import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { Team, TeamMember } from '../types';
import { isAdmin, isSuper } from '../utils/roles';

const router = Router();

function getTeamAndMember(teamId: number, userId: number): { team: Team | null; member: TeamMember | null } {
  const db = getDb();
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) as Team | undefined;
  if (!team) return { team: null, member: null };
  const member = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, userId) as TeamMember | undefined;
  return { team, member: member ?? null };
}

function normalizeSubInput(sub?: string): string {
  const trimmed = (sub ?? '').trim().toLowerCase();
  if (trimmed === '@') return '@';
  return trimmed;
}

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
  if (isSuper(req.user?.role)) {
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
  if (!isAdmin(req.user?.role)) {
    res.json({ code: -1, msg: 'Permission denied' });
    return;
  }
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
    `SELECT tm.*, u.username, u.nickname, u.email FROM team_members tm
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
  if (!isSuper(req.user?.role) && member?.role !== 'owner') {
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
  if (!isSuper(req.user?.role) && member?.role !== 'owner') {
    res.json({ code: -1, msg: 'Only team owner or admin can delete team' });
    return;
  }
  db.prepare('DELETE FROM teams WHERE id = ?').run(id);
  res.json({ code: 0, msg: 'success' });
});

/**
 * @swagger
 * /api/teams/{id}/members:
 *   get:
 *     summary: List members of a team
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
 *         description: List of team members
 */
router.get('/:id/members', authMiddleware, (req: Request, res: Response) => {
  const teamId = parseInt(req.params.id);
  const db = getDb();
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) as Team | undefined;
  if (!team) {
    res.json({ code: -1, msg: 'Team not found' });
    return;
  }
  const members = db.prepare(
    `SELECT tm.*, u.username, u.nickname, u.email FROM team_members tm
     INNER JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = ?`
  ).all(teamId);
  res.json({ code: 0, data: members, msg: 'success' });
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
  if (!isSuper(req.user?.role) && callerMember?.role !== 'owner') {
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
  if (!isSuper(req.user?.role) && callerMember?.role !== 'owner') {
    res.json({ code: -1, msg: 'Only team owner or admin can remove members' });
    return;
  }
  db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(teamId, targetUserId);
  res.json({ code: 0, msg: 'success' });
});

/**
 * @swagger
 * /api/teams/{id}/domain-permissions:
 *   get:
 *     summary: List domain permissions for a team
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
 *         description: List of domain permissions
 */
router.get('/:id/domain-permissions', authMiddleware, (req: Request, res: Response) => {
  const teamId = parseInt(req.params.id);
  const { team, member } = getTeamAndMember(teamId, req.user!.userId);
  if (!team) {
    res.json({ code: -1, msg: 'Team not found' });
    return;
  }
  if (!isSuper(req.user?.role) && !member) {
    res.json({ code: -1, msg: 'Access denied' });
    return;
  }
  const db = getDb();
  const list = db.prepare(
    `SELECT dp.*, d.name as domain_name
     FROM domain_permissions dp
     INNER JOIN domains d ON d.id = dp.domain_id
     WHERE dp.team_id = ?
     ORDER BY d.name`
  ).all(teamId);
  res.json({ code: 0, data: list, msg: 'success' });
});

/**
 * @swagger
 * /api/teams/{id}/domain-permissions:
 *   post:
 *     summary: Add or update a domain permission for a team
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/domain-permissions', authMiddleware, (req: Request, res: Response) => {
  const teamId = parseInt(req.params.id);
  const { team, member } = getTeamAndMember(teamId, req.user!.userId);
  if (!team) {
    res.json({ code: -1, msg: 'Team not found' });
    return;
  }
  if (!isSuper(req.user?.role) && member?.role !== 'owner') {
    res.json({ code: -1, msg: 'Only team owner or admin can manage permissions' });
    return;
  }
  const { domain_id, permission = 'write', sub = '' } = req.body as {
    domain_id: number; permission?: 'read' | 'write'; sub?: string;
  };
  if (!domain_id) {
    res.json({ code: -1, msg: 'domain_id is required' });
    return;
  }
  const db = getDb();
  const domain = db.prepare('SELECT id FROM domains WHERE id = ?').get(domain_id);
  if (!domain) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  const normalizedSub = normalizeSubInput(sub);
  const existing = db.prepare(
    'SELECT id FROM domain_permissions WHERE team_id = ? AND domain_id = ? AND sub = ?'
  ).get(teamId, domain_id, normalizedSub) as { id: number } | undefined;
  if (existing) {
    db.prepare('UPDATE domain_permissions SET permission = ? WHERE id = ?').run(permission, existing.id);
    res.json({ code: 0, data: { id: existing.id }, msg: 'success' });
    return;
  }
  const result = db.prepare(
    'INSERT INTO domain_permissions (team_id, domain_id, sub, permission) VALUES (?, ?, ?, ?)'
  ).run(teamId, domain_id, normalizedSub, permission);
  res.json({ code: 0, data: { id: result.lastInsertRowid }, msg: 'success' });
});

/**
 * @swagger
 * /api/teams/{id}/domain-permissions/{permId}:
 *   delete:
 *     summary: Remove a team domain permission
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id/domain-permissions/:permId', authMiddleware, (req: Request, res: Response) => {
  const teamId = parseInt(req.params.id);
  const permId = parseInt(req.params.permId);
  const { team, member } = getTeamAndMember(teamId, req.user!.userId);
  if (!team) {
    res.json({ code: -1, msg: 'Team not found' });
    return;
  }
  if (!isSuper(req.user?.role) && member?.role !== 'owner') {
    res.json({ code: -1, msg: 'Only team owner or admin can manage permissions' });
    return;
  }
  getDb().prepare('DELETE FROM domain_permissions WHERE id = ? AND team_id = ?').run(permId, teamId);
  res.json({ code: 0, msg: 'success' });
});

/**
 * @swagger
 * /api/teams/{id}/members/{userId}/domain-permissions:
 *   get:
 *     summary: List domain permissions for a team member
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id/members/:userId/domain-permissions', authMiddleware, (req: Request, res: Response) => {
  const teamId = parseInt(req.params.id);
  const targetUserId = parseInt(req.params.userId);
  const { team, member } = getTeamAndMember(teamId, req.user!.userId);
  if (!team) {
    res.json({ code: -1, msg: 'Team not found' });
    return;
  }
  const db = getDb();
  const targetMember = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, targetUserId) as TeamMember | undefined;
  if (!targetMember) {
    res.json({ code: -1, msg: 'User is not in team' });
    return;
  }
  const isSelf = req.user!.userId === targetUserId;
  if (!isSuper(req.user?.role) && member?.role !== 'owner' && !isSelf) {
    res.json({ code: -1, msg: 'Access denied' });
    return;
  }
  const list = db.prepare(
    `SELECT dp.*, d.name as domain_name
     FROM domain_permissions dp
     INNER JOIN domains d ON d.id = dp.domain_id
     WHERE dp.user_id = ?
     ORDER BY d.name`
  ).all(targetUserId);
  res.json({ code: 0, data: list, msg: 'success' });
});

/**
 * @swagger
 * /api/teams/{id}/members/{userId}/domain-permissions:
 *   post:
 *     summary: Add or update a domain permission for a team member
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/members/:userId/domain-permissions', authMiddleware, (req: Request, res: Response) => {
  const teamId = parseInt(req.params.id);
  const targetUserId = parseInt(req.params.userId);
  const { team, member } = getTeamAndMember(teamId, req.user!.userId);
  if (!team) {
    res.json({ code: -1, msg: 'Team not found' });
    return;
  }
  if (!isSuper(req.user?.role) && member?.role !== 'owner') {
    res.json({ code: -1, msg: 'Only team owner or admin can manage permissions' });
    return;
  }
  const db = getDb();
  const targetMember = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, targetUserId) as TeamMember | undefined;
  if (!targetMember) {
    res.json({ code: -1, msg: 'User is not in team' });
    return;
  }
  const { domain_id, permission = 'write', sub = '' } = req.body as {
    domain_id: number; permission?: 'read' | 'write'; sub?: string;
  };
  if (!domain_id) {
    res.json({ code: -1, msg: 'domain_id is required' });
    return;
  }
  const domain = db.prepare('SELECT id FROM domains WHERE id = ?').get(domain_id);
  if (!domain) {
    res.json({ code: -1, msg: 'Domain not found' });
    return;
  }
  const normalizedSub = normalizeSubInput(sub);
  const existing = db.prepare(
    'SELECT id FROM domain_permissions WHERE user_id = ? AND domain_id = ? AND sub = ?'
  ).get(targetUserId, domain_id, normalizedSub) as { id: number } | undefined;
  if (existing) {
    db.prepare('UPDATE domain_permissions SET permission = ? WHERE id = ?').run(permission, existing.id);
    res.json({ code: 0, data: { id: existing.id }, msg: 'success' });
    return;
  }
  const result = db.prepare(
    'INSERT INTO domain_permissions (user_id, domain_id, sub, permission) VALUES (?, ?, ?, ?)'
  ).run(targetUserId, domain_id, normalizedSub, permission);
  res.json({ code: 0, data: { id: result.lastInsertRowid }, msg: 'success' });
});

/**
 * @swagger
 * /api/teams/{id}/members/{userId}/domain-permissions/{permId}:
 *   delete:
 *     summary: Remove a domain permission for a team member
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id/members/:userId/domain-permissions/:permId', authMiddleware, (req: Request, res: Response) => {
  const teamId = parseInt(req.params.id);
  const targetUserId = parseInt(req.params.userId);
  const permId = parseInt(req.params.permId);
  const { team, member } = getTeamAndMember(teamId, req.user!.userId);
  if (!team) {
    res.json({ code: -1, msg: 'Team not found' });
    return;
  }
  if (!isSuper(req.user?.role) && member?.role !== 'owner') {
    res.json({ code: -1, msg: 'Only team owner or admin can manage permissions' });
    return;
  }
  getDb().prepare('DELETE FROM domain_permissions WHERE id = ? AND user_id = ?').run(permId, targetUserId);
  res.json({ code: 0, msg: 'success' });
});

export default router;
