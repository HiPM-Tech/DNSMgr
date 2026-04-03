import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../db/database';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { User } from '../types';

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
router.get('/', authMiddleware, adminOnly, (_req: Request, res: Response) => {
  const db = getDb();
  const users = db.prepare('SELECT id, username, email, role, status, created_at, updated_at FROM users ORDER BY id').all();
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
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, member]
 *     responses:
 *       200:
 *         description: User created
 */
router.post('/', authMiddleware, adminOnly, (req: Request, res: Response) => {
  const { username, email = '', password, role = 'member' } = req.body as {
    username: string; email?: string; password: string; role?: string;
  };
  if (!username || !password) {
    res.json({ code: -1, msg: 'Username and password are required' });
    return;
  }
  const db = getDb();
  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(username, email, hash, role);
    res.json({ code: 0, data: { id: result.lastInsertRowid }, msg: 'success' });
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
router.put('/:id', authMiddleware, adminOnly, (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
  if (!user) {
    res.json({ code: -1, msg: 'User not found' });
    return;
  }
  const { email, role, status, password } = req.body as {
    email?: string; role?: string; status?: number; password?: string;
  };
  const updates: string[] = ["updated_at = datetime('now')"];
  const params: unknown[] = [];
  if (email !== undefined) { updates.push('email = ?'); params.push(email); }
  if (role !== undefined) { updates.push('role = ?'); params.push(role); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (password) { updates.push('password_hash = ?'); params.push(bcrypt.hashSync(password, 10)); }
  params.push(id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
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
router.delete('/:id', authMiddleware, adminOnly, (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (id === req.user!.userId) {
    res.json({ code: -1, msg: 'Cannot delete yourself' });
    return;
  }
  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ code: 0, msg: 'success' });
});

export default router;
