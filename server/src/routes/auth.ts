import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getAdapter } from '../db/adapter';
import { authMiddleware, signToken } from '../middleware/auth';
import { User } from '../types';
import { ROLE_SUPER, ROLE_USER } from '../utils/roles';

const router = Router();
const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with username and password
 *     tags: [Auth]
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
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: JWT token returned
 */
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body as { username: string; password: string };
  if (!username || !password) {
    res.json({ code: -1, msg: 'Username and password are required' });
    return;
  }

  const db = getAdapter();
  if (!db) {
    res.status(500).json({ code: 500, msg: 'Database connection not available' });
    return;
  }

  try {
    const result = await db.get('SELECT id, username, nickname, email, password_hash, role_level as role, status, created_at, updated_at FROM users WHERE username = ?', [username]);
    const user = result as User | undefined;

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      res.json({ code: -1, msg: 'Invalid username or password' });
      return;
    }
    if (user.status === 0) {
      res.json({ code: -1, msg: 'Account is disabled' });
      return;
    }
    const token = await signToken({ userId: user.id, username: user.username, nickname: user.nickname, role: user.role });
    res.json({
      code: 0,
      data: { token, user: { id: user.id, username: user.username, nickname: user.nickname, email: user.email, role: user.role } },
      msg: 'success',
    });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Login failed' });
  }
});

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user (first user becomes admin)
 *     tags: [Auth]
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
 *     responses:
 *       200:
 *         description: User created
 */
router.post('/register', async (req: Request, res: Response) => {
  const { username, nickname, email = '', password } = req.body as { username: string; nickname?: string; email?: string; password: string };
  const normalizedUsername = (username ?? '').trim();
  if (!normalizedUsername || !password) {
    res.json({ code: -1, msg: 'Username and password are required' });
    return;
  }
  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    res.json({ code: -1, msg: 'Username must use letters, numbers, "_" or "-"' });
    return;
  }

  const db = getAdapter();
  if (!db) {
    res.status(500).json({ code: 500, msg: 'Database connection not available' });
    return;
  }

  try {
    const countResult = await db.get('SELECT COUNT(*) as cnt FROM users');
    const count = (countResult as { cnt: number })?.cnt || 0;

    const role = count === 0 ? ROLE_SUPER : ROLE_USER;
    const hash = bcrypt.hashSync(password, 10);
    const resolvedNickname = (nickname ?? '').trim() || normalizedUsername;

    const roleText = role >= 2 ? 'admin' : 'member';

    const id = await db.insert(
      'INSERT INTO users (username, nickname, email, password_hash, role, role_level) VALUES (?, ?, ?, ?, ?, ?)',
      [normalizedUsername, resolvedNickname, email, hash, roleText, role]
    );
    res.json({ code: 0, data: { id, username: normalizedUsername, nickname: resolvedNickname, role }, msg: 'success' });
  } catch {
    res.json({ code: -1, msg: 'Username already exists' });
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user info
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user info
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  const db = getAdapter();
  if (!db) {
    res.status(500).json({ code: 500, msg: 'Database connection not available' });
    return;
  }

  try {
    const result = await db.get('SELECT id, username, nickname, email, role_level as role, status, created_at FROM users WHERE id = ?', [req.user!.userId]);
    const user = result as User | undefined;

    if (!user) {
      res.json({ code: -1, msg: 'User not found' });
      return;
    }
    res.json({ code: 0, data: user, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get user info' });
  }
});

/**
 * @swagger
 * /api/auth/password:
 *   put:
 *     summary: Change current user password
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed
 */
router.put('/password', authMiddleware, async (req: Request, res: Response) => {
  const { oldPassword, newPassword } = req.body as { oldPassword: string; newPassword: string };
  if (!oldPassword || !newPassword) {
    res.json({ code: -1, msg: 'Old and new passwords are required' });
    return;
  }

  const db = getAdapter();
  if (!db) {
    res.status(500).json({ code: 500, msg: 'Database connection not available' });
    return;
  }

  try {
    const result = await db.get('SELECT id, username, nickname, email, password_hash, role_level as role, status, created_at, updated_at FROM users WHERE id = ?', [req.user!.userId]);
    const user = result as User | undefined;

    if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
      res.json({ code: -1, msg: 'Old password is incorrect' });
      return;
    }
    const hash = bcrypt.hashSync(newPassword, 10);

    await db.execute(`UPDATE users SET password_hash = ?, updated_at = ${db.now()} WHERE id = ?`, [hash, user.id]);

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to change password' });
  }
});

/**
 * @swagger
 * /api/auth/profile:
 *   put:
 *     summary: Update current user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
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
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.put('/profile', authMiddleware, async (req: Request, res: Response) => {
  const { nickname, email } = req.body as { nickname?: string; email?: string };
  if (nickname === undefined && email === undefined) {
    res.json({ code: -1, msg: 'Nothing to update' });
    return;
  }

  const db = getAdapter();
  if (!db) {
    res.status(500).json({ code: 500, msg: 'Database connection not available' });
    return;
  }

  try {
    const result = await db.get('SELECT id, username, nickname, email, role_level as role, status, created_at, updated_at FROM users WHERE id = ?', [req.user!.userId]);
    const user = result as User | undefined;

    if (!user) {
      res.json({ code: -1, msg: 'User not found' });
      return;
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (nickname !== undefined) {
      const resolvedNickname = nickname.trim() || user.username;
      updates.push('nickname = ?');
      params.push(resolvedNickname);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }
    params.push(user.id);

    await db.execute(`UPDATE users SET ${updates.join(', ')}, updated_at = ${db.now()} WHERE id = ?`, params);
    const updatedResult = await db.get('SELECT id, username, nickname, email, role_level as role, status, created_at, updated_at FROM users WHERE id = ?', [user.id]);
    res.json({ code: 0, data: updatedResult, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to update profile' });
  }
});

export default router;
