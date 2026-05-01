import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { authMiddleware, adminOnly, noTokenAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { User } from '../types';
import { ROLE_ADMIN, ROLE_SUPER, ROLE_USER, normalizeRole } from '../utils/roles';
import { parseInteger, sendError, sendSuccess } from '../utils/http';
import { isValidUsername } from '../utils/validation';
import { UserOperations } from '../db/business-adapter';
import { wsService } from '../service/websocket';
import { log } from '../lib/logger';

const router = Router();

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: List all users (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/', authMiddleware, noTokenAuth('user management'), adminOnly, asyncHandler(async (_req: Request, res: Response) => {
  const users = await UserOperations.getAll();
  sendSuccess(res, users);
}));

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Create a new user (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *               nickname:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [1, 2]
 *     responses:
 *       200:
 *         description: User created
 */
router.post('/', authMiddleware, noTokenAuth('user management'), adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const { username, nickname, email = '', password, role = ROLE_USER } = req.body as {
    username: string; nickname?: string; email?: string; password: string; role?: number;
  };
  const normalizedUsername = (username ?? '').trim();
  if (!normalizedUsername || !password) {
    sendError(res, 'Username and password are required');
    return;
  }
  if (!isValidUsername(normalizedUsername)) {
    sendError(res, 'Username must use letters, numbers, "_" or "-"');
    return;
  }
  const resolvedNickname = (nickname ?? '').trim() || normalizedUsername;
  const hash = bcrypt.hashSync(password, 10);
  const callerRole = normalizeRole(req.user?.role);
  let roleLevel = normalizeRole(role);
  if (callerRole === ROLE_ADMIN) {
    roleLevel = ROLE_USER;
  }
  if (roleLevel === ROLE_SUPER) {
    sendError(res, 'Super admin cannot be created');
    return;
  }
  const roleText = roleLevel >= ROLE_ADMIN ? 'admin' : 'member';
  try {
    const id = await UserOperations.create({
      username: normalizedUsername,
      nickname: resolvedNickname,
      email,
      password_hash: hash,
      role: roleText,
      role_level: roleLevel,
    });
    
    // 推送 WebSocket 消息
    try {
      wsService.broadcast({
        type: 'user_created',
        data: {
          userId: id,
          username: normalizedUsername,
          role: roleText,
        },
      });
    } catch (error) {
      log.error('Users', 'Failed to broadcast user_created event', { error });
    }
    
    sendSuccess(res, { id });
  } catch {
    sendError(res, 'Username already exists');
  }
}));

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update a user (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname:
 *                 type: string
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *               status:
 *                 type: integer
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: User updated
 */
router.put('/:id', authMiddleware, noTokenAuth('user management'), adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const id = parseInteger(req.params.id, { min: 1 }) ?? 0;
  const user = await UserOperations.getById(id) as User | undefined;
  if (!user) {
    sendError(res, 'User not found');
    return;
  }
  const { nickname, email, role, status, password } = req.body as {
    nickname?: string; email?: string; role?: number; status?: number; password?: string;
  };
  const callerRole = normalizeRole(req.user?.role);
  const targetRole = normalizeRole(user.role);
  
  // Super admin cannot be modified
  if (targetRole === ROLE_SUPER) {
    sendError(res, 'Super admin cannot be modified');
    return;
  }
  
  // Admin cannot modify users with same or higher role level (peer protection)
  // This prevents admins from modifying other admins or being modified by other admins
  if (callerRole === ROLE_ADMIN && targetRole >= ROLE_ADMIN) {
    sendError(res, 'Permission denied: Cannot modify users with same or higher role level');
    return;
  }
  
  // Admin cannot upgrade users to admin level
  if (callerRole === ROLE_ADMIN && role !== undefined) {
    const newRoleLevel = normalizeRole(role);
    if (newRoleLevel >= ROLE_ADMIN) {
      sendError(res, 'Permission denied: Cannot grant admin privileges');
      return;
    }
  }
  
  const updates: { nickname?: string; email?: string; role_level?: number; role?: string; status?: number; password_hash?: string } = {};
  
  if (nickname !== undefined) {
    updates.nickname = nickname.trim() || user.username;
  }
  if (email !== undefined) { updates.email = email; }
  if (role !== undefined) {
    let roleLevel = normalizeRole(role);
    // Only super admin can create other admins
    if (callerRole !== ROLE_SUPER && roleLevel >= ROLE_ADMIN) {
      roleLevel = ROLE_USER;
    }
    if (roleLevel === ROLE_SUPER) {
      sendError(res, 'Super admin cannot be created through this endpoint');
      return;
    }
    updates.role_level = roleLevel;
    updates.role = roleLevel >= ROLE_ADMIN ? 'admin' : 'member';
  }
  if (status !== undefined) { updates.status = status; }
  if (password) { updates.password_hash = bcrypt.hashSync(password, 10); }
  
  await UserOperations.update(id, updates);
  
  // 推送 WebSocket 消息
  try {
    wsService.broadcast({
      type: 'user_updated',
      data: {
        userId: id,
        username: user.username,
      },
    });
  } catch (error) {
    log.error('Users', 'Failed to broadcast user_updated event', { error });
  }
  
  sendSuccess(res);
}));

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete a user (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User deleted
 */
router.delete('/:id', authMiddleware, noTokenAuth('user management'), adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const id = parseInteger(req.params.id, { min: 1 }) ?? 0;
  if (id === req.user!.userId) {
    sendError(res, 'Cannot delete yourself');
    return;
  }
  const target = await UserOperations.getById(id) as User | undefined;
  if (!target) {
    sendError(res, 'User not found');
    return;
  }
  const callerRole = normalizeRole(req.user?.role);
  const targetRole = normalizeRole(target.role);
  
  // Super admin cannot be deleted
  if (targetRole === ROLE_SUPER) {
    sendError(res, 'Super admin cannot be deleted');
    return;
  }
  
  // Admin cannot delete users with same or higher role level (peer protection)
  if (callerRole === ROLE_ADMIN && targetRole >= ROLE_ADMIN) {
    sendError(res, 'Permission denied: Cannot delete users with same or higher role level');
    return;
  }
  
  await UserOperations.delete(id);
  
  // 推送 WebSocket 消息
  try {
    wsService.broadcast({
      type: 'user_deleted',
      data: {
        userId: id,
        username: target.username,
      },
    });
  } catch (error) {
    log.error('Users', 'Failed to broadcast user_deleted event', { error });
  }
  
  sendSuccess(res);
}));

export default router;
