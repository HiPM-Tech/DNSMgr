import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getAdapter } from '../db/adapter';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { User } from '../types';
import { ROLE_ADMIN, ROLE_SUPER, ROLE_USER, normalizeRole } from '../utils/roles';

const router = Router();
const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;

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
router.get('/', authMiddleware, adminOnly, async (_req: Request, res: Response) => {
  const adapter = getAdapter();
  if (!adapter) {
    return res.status(500).json({ code: 500, msg: 'Database error' });
  }
  const users = await adapter.query('SELECT id, username, nickname, email, role_level as role, status, created_at, updated_at FROM users ORDER BY id');
  res.json({ code: 0, data: users, msg: 'success' });
});

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
router.post('/', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const { username, nickname, email = '', password, role = ROLE_USER } = req.body as {
    username: string; nickname?: string; email?: string; password: string; role?: number;
  };
  const normalizedUsername = (username ?? '').trim();
  if (!normalizedUsername || !password) {
    res.json({ code: -1, msg: 'Username and password are required' });
    return;
  }
  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    res.json({ code: -1, msg: 'Username must use letters, numbers, "_" or "-"' });
    return;
  }
  const adapter = getAdapter();
  if (!adapter) {
    return res.status(500).json({ code: 500, msg: 'Database error' });
  }
  const resolvedNickname = (nickname ?? '').trim() || username;
  const hash = bcrypt.hashSync(password, 10);
  const callerRole = normalizeRole(req.user?.role);
  let roleLevel = normalizeRole(role);
  if (callerRole === ROLE_ADMIN) {
    roleLevel = ROLE_USER;
  }
  if (roleLevel === ROLE_SUPER) {
    res.json({ code: -1, msg: 'Super admin cannot be created' });
    return;
  }
  const roleText = roleLevel >= ROLE_ADMIN ? 'admin' : 'member';
  try {
    const id = await adapter.insert(
      'INSERT INTO users (username, nickname, email, password_hash, role, role_level) VALUES (?, ?, ?, ?, ?, ?)',
      [normalizedUsername, resolvedNickname, email, hash, roleText, roleLevel]
    );
    res.json({ code: 0, data: { id }, msg: 'success' });
  } catch {
    res.json({ code: -1, msg: 'Username already exists' });
  }
});

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
router.put('/:id', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const adapter = getAdapter();
  if (!adapter) {
    return res.status(500).json({ code: 500, msg: 'Database error' });
  }
  const user = await adapter.get('SELECT id, username, nickname, email, password_hash, role_level as role, status, created_at, updated_at FROM users WHERE id = ?', [id]) as User | undefined;
  if (!user) {
    res.json({ code: -1, msg: 'User not found' });
    return;
  }
  const { nickname, email, role, status, password } = req.body as {
    nickname?: string; email?: string; role?: number; status?: number; password?: string;
  };
  const callerRole = normalizeRole(req.user?.role);
  if (user.role === ROLE_SUPER) {
    res.json({ code: -1, msg: 'Super admin cannot be modified' });
    return;
  }
  if (callerRole === ROLE_ADMIN && user.role >= ROLE_ADMIN) {
    res.json({ code: -1, msg: 'Permission denied' });
    return;
  }
  const updates: string[] = [`updated_at = ${adapter.now()}`];
  const params: unknown[] = [];
  if (nickname !== undefined) {
    const resolvedNickname = nickname.trim() || user.username;
    updates.push('nickname = ?');
    params.push(resolvedNickname);
  }
  if (email !== undefined) { updates.push('email = ?'); params.push(email); }
  if (role !== undefined) {
    let roleLevel = normalizeRole(role);
    if (callerRole === ROLE_ADMIN) {
      roleLevel = ROLE_USER;
    }
    if (roleLevel === ROLE_SUPER) {
      res.json({ code: -1, msg: 'Super admin cannot be created' });
      return;
    }
    updates.push('role_level = ?');
    params.push(roleLevel);
    updates.push('role = ?');
    params.push(roleLevel >= ROLE_ADMIN ? 'admin' : 'member');
  }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (password) { updates.push('password_hash = ?'); params.push(bcrypt.hashSync(password, 10)); }
  params.push(id);
  await adapter.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json({ code: 0, msg: 'success' });
});

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
router.delete('/:id', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (id === req.user!.userId) {
    res.json({ code: -1, msg: 'Cannot delete yourself' });
    return;
  }
  const adapter = getAdapter();
  if (!adapter) {
    return res.status(500).json({ code: 500, msg: 'Database error' });
  }
  const target = await adapter.get('SELECT id, role_level as role FROM users WHERE id = ?', [id]) as { id: number; role: number } | undefined;
  if (!target) {
    res.json({ code: -1, msg: 'User not found' });
    return;
  }
  const callerRole = normalizeRole(req.user?.role);
  if (target.role === ROLE_SUPER) {
    res.json({ code: -1, msg: 'Super admin cannot be deleted' });
    return;
  }
  if (callerRole === ROLE_ADMIN && target.role >= ROLE_ADMIN) {
    res.json({ code: -1, msg: 'Permission denied' });
    return;
  }
  await adapter.execute('DELETE FROM users WHERE id = ?', [id]);
  res.json({ code: 0, msg: 'success' });
});

export default router;
