import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { Team, TeamMember } from '../types';

const router = Router();

/**
 * @swagger
 * /api/teams:
 *   get:
 *     summary: List teams for current user
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of teams
 */
router.get('/', authMiddleware, (req: Request, res: Response) => {
  const db = getDb();
  let teams: unknown[];
  if (req.user!.role === 'admin') {
    teams = db.prepare('SELECT * FROM teams ORDER BY id').all();
  } else {
    teams = db.prepare(
      `SELECT t.* FROM teams t
       INNER JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
       ORDER BY t.id`
    ).all(req.user!.userId);
  }
  res.json({ code: 0, data: teams, msg: 'success' });
});

/**
 * @swagger
 * /api/teams:
 *   post:
 *     summary: Create a team
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Team created
 */
router.post('/', authMiddleware, (req: Request, res: Response) => {
  const { name, description = '' } = req.body as { name: string; description?: string };
  if (!name) {
    res.json({ code: -1, msg: 'Team name is required' });
    return;
  }
  const db = getDb();
  const userId = req.user!.userId;
  const result = db.prepare('INSERT INTO teams (name, description, created_by) VALUES (?, ?, ?)').run(name, description, userId);
  const teamId = result.lastInsertRowid;
  db.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(teamId, userId, 'owner');
  res.json({ code: 0, data: { id: teamId }, msg: 'success' });
});

/**
 * @swagger
 * /api/teams/{id}:
 *   get:
 *     summary: Get team details with members
 *     tags: [Teams]
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
 *         description: Team details
 */
router.get('/:id', authMiddleware, (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as Team | undefined;
  if (!team) {
    res.json({ code: -1, msg: 'Team not found' });
    return;
  }
  const members = db.prepare(
    `SELECT tm.*, u.username, u.email FROM team_members tm
     INNER JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = ?`
  ).all(id);
  res.json({ code: 0, data: { ...team, members }, msg: 'success' });
});

/**
 * @swagger
 * /api/teams/{id}:
 *   put:
 *     summary: Update team (owner only)
 *     tags: [Teams]
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
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Team updated
 */
router.put('/:id', authMiddleware, (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as Team | undefined;
  if (!team) {
    res.json({ code: -1, msg: 'Team not found' });
    return;
  }
  const member = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(id, req.user!.userId) as TeamMember | undefined;
  if (req.user!.role !== 'admin' && member?.role !== 'owner') {
    res.json({ code: -1, msg: 'Only team owner or admin can update team' });
    return;
  }
  const { name, description } = req.body as { name?: string; description?: string };
  const updates: string[] = [];
  const params: unknown[] = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (updates.length === 0) {
    res.json({ code: 0, msg: 'success' });
    return;
  }
  params.push(id);
  db.prepare(`UPDATE teams SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ code: 0, msg: 'success' });
});

/**
 * @swagger
 * /api/teams/{id}:
 *   delete:
 *     summary: Delete team (admin or owner)
 *     tags: [Teams]
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
 *         description: Team deleted
 */
router.delete('/:id', authMiddleware, (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as Team | undefined;
  if (!team) {
    res.json({ code: -1, msg: 'Team not found' });
    return;
  }
  const member = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(id, req.user!.userId) as TeamMember | undefined;
  if (req.user!.role !== 'admin' && member?.role !== 'owner') {
    res.json({ code: -1, msg: 'Only team owner or admin can delete team' });
    return;
  }
  db.prepare('DELETE FROM teams WHERE id = ?').run(id);
  res.json({ code: 0, msg: 'success' });
});

/**
 * @swagger
 * /api/teams/{id}/members:
 *   post:
 *     summary: Add member to team
 *     tags: [Teams]
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
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: integer
 *               role:
 *                 type: string
 *                 enum: [owner, member]
 *     responses:
 *       200:
 *         description: Member added
 */
router.post('/:id/members', authMiddleware, (req: Request, res: Response) => {
  const teamId = parseInt(req.params.id);
  const db = getDb();
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) as Team | undefined;
  if (!team) {
    res.json({ code: -1, msg: 'Team not found' });
    return;
  }
  const callerMember = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, req.user!.userId) as TeamMember | undefined;
  if (req.user!.role !== 'admin' && callerMember?.role !== 'owner') {
    res.json({ code: -1, msg: 'Only team owner or admin can add members' });
    return;
  }
  const { userId, role = 'member' } = req.body as { userId: number; role?: string };
  if (!userId) {
    res.json({ code: -1, msg: 'userId is required' });
    return;
  }
  try {
    db.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(teamId, userId, role);
    res.json({ code: 0, msg: 'success' });
  } catch {
    res.json({ code: -1, msg: 'User already in team' });
  }
});

/**
 * @swagger
 * /api/teams/{id}/members/{userId}:
 *   delete:
 *     summary: Remove member from team
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Member removed
 */
router.delete('/:id/members/:userId', authMiddleware, (req: Request, res: Response) => {
  const teamId = parseInt(req.params.id);
  const targetUserId = parseInt(req.params.userId);
  const db = getDb();
  const callerMember = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, req.user!.userId) as TeamMember | undefined;
  if (req.user!.role !== 'admin' && callerMember?.role !== 'owner') {
    res.json({ code: -1, msg: 'Only team owner or admin can remove members' });
    return;
  }
  db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(teamId, targetUserId);
  res.json({ code: 0, msg: 'success' });
});

export default router;
