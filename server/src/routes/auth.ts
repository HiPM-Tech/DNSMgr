import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../db/database';
import { authMiddleware, signToken } from '../middleware/auth';
import { User } from '../types';

const router = Router();

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
router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body as { username: string; password: string };
  if (!username || !password) {
    res.json({ code: -1, msg: 'Username and password are required' });
    return;
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.json({ code: -1, msg: 'Invalid username or password' });
    return;
  }
  if (user.status === 0) {
    res.json({ code: -1, msg: 'Account is disabled' });
    return;
  }
  const token = signToken({ userId: user.id, username: user.username, nickname: user.nickname, role: user.role });
  res.json({
    code: 0,
    data: { token, user: { id: user.id, username: user.username, nickname: user.nickname, email: user.email, role: user.role } },
    msg: 'success',
  });
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
router.post('/register', (req: Request, res: Response) => {
  const { username, nickname, email = '', password } = req.body as { username: string; nickname?: string; email?: string; password: string };
  if (!username || !password) {
    res.json({ code: -1, msg: 'Username and password are required' });
    return;
  }
  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  const role = count === 0 ? 'admin' : 'member';
  const hash = bcrypt.hashSync(password, 10);
  const resolvedNickname = (nickname ?? '').trim() || username;
  try {
    const result = db.prepare(
      'INSERT INTO users (username, nickname, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
    ).run(username, resolvedNickname, email, hash, role);
    res.json({ code: 0, data: { id: result.lastInsertRowid, username, nickname: resolvedNickname, role }, msg: 'success' });
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
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  const db = getDb();
  const user = db.prepare('SELECT id, username, nickname, email, role, status, created_at FROM users WHERE id = ?').get(req.user!.userId) as User | undefined;
  if (!user) {
    res.json({ code: -1, msg: 'User not found' });
    return;
  }
  res.json({ code: 0, data: user, msg: 'success' });
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
router.put('/password', authMiddleware, (req: Request, res: Response) => {
  const { oldPassword, newPassword } = req.body as { oldPassword: string; newPassword: string };
  if (!oldPassword || !newPassword) {
    res.json({ code: -1, msg: 'Old and new passwords are required' });
    return;
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.userId) as User | undefined;
  if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
    res.json({ code: -1, msg: 'Old password is incorrect' });
    return;
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hash, user.id);
  res.json({ code: 0, msg: 'success' });
});

export default router;
