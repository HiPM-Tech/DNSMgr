import { Router, Request, Response } from 'express';
import { getAdapter } from '../db/adapter';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { Team, TeamMember } from '../types';
import { isAdmin, isSuper } from '../utils/roles';
import { parseInteger, sendError, sendSuccess } from '../utils/http';

const router = Router();

async function getTeamAndMember(teamId: number, userId: number): Promise<{ team: Team | null; member: TeamMember | null }> {
  const adapter = getAdapter();
  if (!adapter) {
    throw new Error('Database adapter not available');
  }
  const team = await adapter.get('SELECT * FROM teams WHERE id = ?', [teamId]) as Team | undefined;
  if (!team) return { team: null, member: null };
  const member = await adapter.get('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, userId]) as TeamMember | undefined;
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
router.get('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const adapter = getAdapter();
  if (!adapter) {
    sendError(res, 'Database error');
    return;
  }
  let teams: unknown[];
  if (isSuper(req.user?.role)) {
    teams = await adapter.query('SELECT * FROM teams ORDER BY id');
  } else {
    teams = await adapter.query(
      `SELECT t.* FROM teams t
       INNER JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
       ORDER BY t.id`,
      [req.user!.userId]
    );
  }
  sendSuccess(res, teams);
}));

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
router.post('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  if (!isAdmin(req.user?.role)) {
    sendError(res, 'Permission denied');
    return;
  }
  const { name, description = '' } = req.body as { name: string; description?: string };
  if (!name) {
    sendError(res, 'Team name is required');
    return;
  }
  const adapter = getAdapter();
  if (!adapter) {
    sendError(res, 'Database error');
    return;
  }
  const userId = req.user!.userId;
  const teamId = await adapter.insert('INSERT INTO teams (name, description, created_by) VALUES (?, ?, ?)', [name, description, userId]);
  await adapter.execute('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)', [teamId, userId, 'owner']);
  sendSuccess(res, { id: teamId });
}));

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
router.get('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const id = parseInteger(req.params.id) ?? 0;
  const adapter = getAdapter();
  if (!adapter) {
    sendError(res, 'Database error');
    return;
  }
  const team = await adapter.get('SELECT * FROM teams WHERE id = ?', [id]) as Team | undefined;
  if (!team) {
    sendError(res, 'Team not found');
    return;
  }
  const members = await adapter.query(
    `SELECT tm.*, u.username, u.nickname, u.email FROM team_members tm
     INNER JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = ?`,
    [id]
  );
  sendSuccess(res, { ...team, members });
}));

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
router.put('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const id = parseInteger(req.params.id) ?? 0;
  const adapter = getAdapter();
  if (!adapter) {
    sendError(res, 'Database error');
    return;
  }
  const team = await adapter.get('SELECT * FROM teams WHERE id = ?', [id]) as Team | undefined;
  if (!team) {
    sendError(res, 'Team not found');
    return;
  }
  const member = await adapter.get('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?', [id, req.user!.userId]) as TeamMember | undefined;
  if (!isSuper(req.user?.role) && member?.role !== 'owner') {
    sendError(res, 'Only team owner or admin can update team');
    return;
  }
  const { name, description } = req.body as { name?: string; description?: string };
  const updates: string[] = [];
  const params: unknown[] = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (updates.length === 0) {
    sendSuccess(res);
    return;
  }
  params.push(id);
  await adapter.execute(`UPDATE teams SET ${updates.join(', ')} WHERE id = ?`, params);
  sendSuccess(res);
}));

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
router.delete('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const id = parseInteger(req.params.id) ?? 0;
  const adapter = getAdapter();
  if (!adapter) {
    sendError(res, 'Database error');
    return;
  }
  const team = await adapter.get('SELECT * FROM teams WHERE id = ?', [id]) as Team | undefined;
  if (!team) {
    sendError(res, 'Team not found');
    return;
  }
  const member = await adapter.get('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?', [id, req.user!.userId]) as TeamMember | undefined;
  if (!isSuper(req.user?.role) && member?.role !== 'owner') {
    sendError(res, 'Only team owner or admin can delete team');
    return;
  }
  await adapter.execute('DELETE FROM teams WHERE id = ?', [id]);
  sendSuccess(res);
}));

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
router.get('/:id/members', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const teamId = parseInteger(req.params.id) ?? 0;
  const adapter = getAdapter();
  if (!adapter) {
    sendError(res, 'Database error');
    return;
  }
  const team = await adapter.get('SELECT * FROM teams WHERE id = ?', [teamId]) as Team | undefined;
  if (!team) {
    sendError(res, 'Team not found');
    return;
  }
  const members = await adapter.query(
    `SELECT tm.*, u.username, u.nickname, u.email FROM team_members tm
     INNER JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = ?`,
    [teamId]
  );
  sendSuccess(res, members);
}));

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
router.post('/:id/members', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const teamId = parseInteger(req.params.id) ?? 0;
  const adapter = getAdapter();
  if (!adapter) {
    sendError(res, 'Database error');
    return;
  }
  const team = await adapter.get('SELECT * FROM teams WHERE id = ?', [teamId]) as Team | undefined;
  if (!team) {
    sendError(res, 'Team not found');
    return;
  }
  const callerMember = await adapter.get('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, req.user!.userId]) as TeamMember | undefined;
  if (!isSuper(req.user?.role) && callerMember?.role !== 'owner') {
    sendError(res, 'Only team owner or admin can add members');
    return;
  }
  const { userId, role = 'member' } = req.body as { userId: number; role?: string };
  if (!userId) {
    sendError(res, 'userId is required');
    return;
  }
  try {
    await adapter.execute('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)', [teamId, userId, role]);
    sendSuccess(res);
  } catch {
    sendError(res, 'User already in team');
  }
}));

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
router.delete('/:id/members/:userId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const teamId = parseInteger(req.params.id) ?? 0;
  const targetUserId = parseInteger(req.params.userId) ?? 0;
  const adapter = getAdapter();
  if (!adapter) {
    sendError(res, 'Database error');
    return;
  }
  const callerMember = await adapter.get('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, req.user!.userId]) as TeamMember | undefined;
  if (!isSuper(req.user?.role) && callerMember?.role !== 'owner') {
    sendError(res, 'Only team owner or admin can remove members');
    return;
  }
  await adapter.execute('DELETE FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, targetUserId]);
  sendSuccess(res);
}));

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
router.get('/:id/domain-permissions', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const teamId = parseInteger(req.params.id) ?? 0;
  const { team, member } = await getTeamAndMember(teamId, req.user!.userId);
  if (!team) {
    sendError(res, 'Team not found');
    return;
  }
  if (!isSuper(req.user?.role) && !member) {
    sendError(res, 'Access denied');
    return;
  }
  const adapter = getAdapter();
  if (!adapter) {
    sendError(res, 'Database error');
    return;
  }
  const list = await adapter.query(
    `SELECT dp.*, d.name as domain_name
     FROM domain_permissions dp
     INNER JOIN domains d ON d.id = dp.domain_id
     WHERE dp.team_id = ?
     ORDER BY d.name`,
    [teamId]
  );
  sendSuccess(res, list);
}));

/**
 * @swagger
 * /api/teams/{id}/domain-permissions:
 *   post:
 *     summary: Add or update a domain permission for a team
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/domain-permissions', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const teamId = parseInteger(req.params.id) ?? 0;
  const { team, member } = await getTeamAndMember(teamId, req.user!.userId);
  if (!team) {
    sendError(res, 'Team not found');
    return;
  }
  if (!isSuper(req.user?.role) && member?.role !== 'owner') {
    sendError(res, 'Only team owner or admin can manage permissions');
    return;
  }
  const { domain_id, permission = 'write', sub = '' } = req.body as {
    domain_id: number; permission?: 'read' | 'write'; sub?: string;
  };
  if (!domain_id) {
    sendError(res, 'domain_id is required');
    return;
  }
  const adapter = getAdapter();
  if (!adapter) {
    sendError(res, 'Database error');
    return;
  }
  const domain = await adapter.get('SELECT id FROM domains WHERE id = ?', [domain_id]);
  if (!domain) {
    sendError(res, 'Domain not found');
    return;
  }
  const normalizedSub = normalizeSubInput(sub);
  const existing = await adapter.get(
    'SELECT id FROM domain_permissions WHERE team_id = ? AND domain_id = ? AND sub = ?',
    [teamId, domain_id, normalizedSub]
  ) as { id: number } | undefined;
  if (existing) {
    await adapter.execute('UPDATE domain_permissions SET permission = ? WHERE id = ?', [permission, existing.id]);
    sendSuccess(res, { id: existing.id });
    return;
  }
  const result = await adapter.insert(
    'INSERT INTO domain_permissions (team_id, domain_id, sub, permission) VALUES (?, ?, ?, ?)',
    [teamId, domain_id, normalizedSub, permission]
  );
  sendSuccess(res, { id: result });
}));

/**
 * @swagger
 * /api/teams/{id}/domain-permissions/{permId}:
 *   delete:
 *     summary: Remove a team domain permission
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id/domain-permissions/:permId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const teamId = parseInteger(req.params.id) ?? 0;
  const permId = parseInteger(req.params.permId) ?? 0;
  const { team, member } = await getTeamAndMember(teamId, req.user!.userId);
  if (!team) {
    sendError(res, 'Team not found');
    return;
  }
  if (!isSuper(req.user?.role) && member?.role !== 'owner') {
    sendError(res, 'Only team owner or admin can manage permissions');
    return;
  }
  const adapter = getAdapter();
  if (!adapter) {
    sendError(res, 'Database error');
    return;
  }
  await adapter.execute('DELETE FROM domain_permissions WHERE id = ? AND team_id = ?', [permId, teamId]);
  sendSuccess(res);
}));

/**
 * @swagger
 * /api/teams/{id}/members/{userId}/domain-permissions:
 *   get:
 *     summary: List domain permissions for a team member
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id/members/:userId/domain-permissions', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const teamId = parseInteger(req.params.id) ?? 0;
  const targetUserId = parseInteger(req.params.userId) ?? 0;
  const { team, member } = await getTeamAndMember(teamId, req.user!.userId);
  if (!team) {
    sendError(res, 'Team not found');
    return;
  }
  const adapter = getAdapter();
  if (!adapter) {
    sendError(res, 'Database error');
    return;
  }
  const targetMember = await adapter.get('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, targetUserId]) as TeamMember | undefined;
  if (!targetMember) {
    sendError(res, 'User is not in team');
    return;
  }
  const isSelf = req.user!.userId === targetUserId;
  if (!isSuper(req.user?.role) && member?.role !== 'owner' && !isSelf) {
    sendError(res, 'Access denied');
    return;
  }
  const list = await adapter.query(
    `SELECT dp.*, d.name as domain_name
     FROM domain_permissions dp
     INNER JOIN domains d ON d.id = dp.domain_id
     WHERE dp.user_id = ?
     ORDER BY d.name`,
    [targetUserId]
  );
  sendSuccess(res, list);
}));

/**
 * @swagger
 * /api/teams/{id}/members/{userId}/domain-permissions:
 *   post:
 *     summary: Add or update a domain permission for a team member
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/members/:userId/domain-permissions', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const teamId = parseInteger(req.params.id) ?? 0;
  const targetUserId = parseInteger(req.params.userId) ?? 0;
  const { team, member } = await getTeamAndMember(teamId, req.user!.userId);
  if (!team) {
    sendError(res, 'Team not found');
    return;
  }
  if (!isSuper(req.user?.role) && member?.role !== 'owner') {
    sendError(res, 'Only team owner or admin can manage permissions');
    return;
  }
  const adapter = getAdapter();
  if (!adapter) {
    sendError(res, 'Database error');
    return;
  }
  const targetMember = await adapter.get('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, targetUserId]) as TeamMember | undefined;
  if (!targetMember) {
    sendError(res, 'User is not in team');
    return;
  }
  const { domain_id, permission = 'write', sub = '' } = req.body as {
    domain_id: number; permission?: 'read' | 'write'; sub?: string;
  };
  if (!domain_id) {
    sendError(res, 'domain_id is required');
    return;
  }
  const domain = await adapter.get('SELECT id FROM domains WHERE id = ?', [domain_id]);
  if (!domain) {
    sendError(res, 'Domain not found');
    return;
  }
  const normalizedSub = normalizeSubInput(sub);
  const existing = await adapter.get(
    'SELECT id FROM domain_permissions WHERE user_id = ? AND domain_id = ? AND sub = ?',
    [targetUserId, domain_id, normalizedSub]
  ) as { id: number } | undefined;
  if (existing) {
    await adapter.execute('UPDATE domain_permissions SET permission = ? WHERE id = ?', [permission, existing.id]);
    sendSuccess(res, { id: existing.id });
    return;
  }
  const result = await adapter.insert(
    'INSERT INTO domain_permissions (user_id, domain_id, sub, permission) VALUES (?, ?, ?, ?)',
    [targetUserId, domain_id, normalizedSub, permission]
  );
  sendSuccess(res, { id: result });
}));

/**
 * @swagger
 * /api/teams/{id}/members/{userId}/domain-permissions/{permId}:
 *   delete:
 *     summary: Remove a domain permission for a team member
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id/members/:userId/domain-permissions/:permId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const teamId = parseInteger(req.params.id) ?? 0;
  const targetUserId = parseInteger(req.params.userId) ?? 0;
  const permId = parseInteger(req.params.permId) ?? 0;
  const { team, member } = await getTeamAndMember(teamId, req.user!.userId);
  if (!team) {
    sendError(res, 'Team not found');
    return;
  }
  if (!isSuper(req.user?.role) && member?.role !== 'owner') {
    sendError(res, 'Only team owner or admin can manage permissions');
    return;
  }
  const adapter = getAdapter();
  if (!adapter) {
    sendError(res, 'Database error');
    return;
  }
  await adapter.execute('DELETE FROM domain_permissions WHERE id = ? AND user_id = ?', [permId, targetUserId]);
  sendSuccess(res);
}));

export default router;
