import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Empty, Form, Input, Loading, Select, Space, Tag } from 'tdesign-react';
import type { SelectValue } from 'tdesign-react/es/select';
import {
  AddIcon,
  DeleteIcon,
  EditIcon,
  SecuredIcon,
  UserAddIcon,
  UserClearIcon,
  UserListIcon,
} from 'tdesign-icons-react';
import { teamsApi, usersApi, domainsApi } from '../api';
import type { Team, TeamMember, User, Domain, DomainPermission } from '../api';
import { Table } from '../components/Table';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from '../components/Avatar';
import { useI18n } from '../contexts/I18nContext';
import { isAdmin } from '../utils/roles';
import { useRealtimeData } from '../hooks/useRealtimeData';

function selectToDomainId(value: SelectValue): number | '' {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === '' || raw === undefined || raw === null ? '' : Number(raw);
}

function selectToPermission(value: SelectValue): 'read' | 'write' {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'read' ? 'read' : 'write';
}

function roleLabel(role: string, t: (key: string) => string) {
  return t(`teams.role${role.charAt(0).toUpperCase() + role.slice(1)}` as any);
}

export function Teams() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const [showCreate, setShowCreate] = useState(false);
  const [viewTeam, setViewTeam] = useState<Team | null>(null);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [deleteTeam, setDeleteTeam] = useState<Team | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [removingMember, setRemovingMember] = useState<TeamMember | null>(null);
  const [memberPermissionsFor, setMemberPermissionsFor] = useState<TeamMember | null>(null);
  const [teamForm, setTeamForm] = useState({ name: '', description: '' });
  const [teamPermDomainId, setTeamPermDomainId] = useState<number | ''>('');
  const [teamPermPermission, setTeamPermPermission] = useState<'read' | 'write'>('write');
  const [teamPermSub, setTeamPermSub] = useState('');
  const [memberPermDomainId, setMemberPermDomainId] = useState<number | ''>('');
  const [memberPermPermission, setMemberPermPermission] = useState<'read' | 'write'>('write');
  const [memberPermSub, setMemberPermSub] = useState('');
  const getDisplayName = (u: { nickname?: string; username: string }) => u.nickname || u.username;

  useRealtimeData({
    queryKey: ['teams'],
    websocketEventTypes: ['team_created', 'team_updated', 'team_deleted', 'team_member_added', 'team_member_removed'],
    pollingInterval: 120000,
  });

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list().then((r) => r.data.data ?? []),
  });

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['team-members', viewTeam?.id],
    queryFn: () => teamsApi.members(viewTeam!.id).then((r) => r.data.data ?? []),
    enabled: !!viewTeam,
  });

  const { data: domainsData } = useQuery<{ list: Domain[]; total: number; page: number; pageSize: number; totalPages: number }>({
    queryKey: ['domains'],
    queryFn: () => domainsApi.list({ pageSize: 1000 }).then((r) => r.data.data ?? { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    enabled: !!viewTeam,
  });
  const domains = domainsData?.list ?? [];
  const domainOptions = domains.map((domain) => ({ label: domain.name, value: domain.id }));

  const { data: teamDomainPermissions = [], isLoading: teamDomainPermissionsLoading } = useQuery({
    queryKey: ['team-domain-permissions', viewTeam?.id],
    queryFn: () => teamsApi.domainPermissions(viewTeam!.id).then((r) => r.data.data ?? []),
    enabled: !!viewTeam,
  });

  const { data: memberDomainPermissions = [], isLoading: memberDomainPermissionsLoading } = useQuery({
    queryKey: ['member-domain-permissions', viewTeam?.id, memberPermissionsFor?.user_id],
    queryFn: () => teamsApi.memberDomainPermissions(viewTeam!.id, memberPermissionsFor!.user_id).then((r) => r.data.data ?? []),
    enabled: !!viewTeam && !!memberPermissionsFor,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then((r) => r.data.data ?? []),
    enabled: showAddMember && isAdmin(me?.role),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) => teamsApi.create(data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['teams'] });
      setShowCreate(false);
      setTeamForm({ name: '', description: '' });
      toast.success(t('teams.teamCreated'));
    },
    onError: () => toast.error(t('teams.createFailed')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; description?: string } }) => teamsApi.update(id, data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['teams'] });
      setEditTeam(null);
      toast.success(t('teams.teamUpdated'));
    },
    onError: () => toast.error(t('teams.updateFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => teamsApi.delete(id),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['teams'] });
      if (viewTeam?.id === deleteTeam?.id) setViewTeam(null);
      setDeleteTeam(null);
      toast.success(t('teams.teamDeleted'));
    },
    onError: () => toast.error(t('teams.deleteFailed')),
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ userId }: { userId: number }) => teamsApi.addMember(viewTeam!.id, userId, 'member'),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['team-members', viewTeam?.id] });
      setShowAddMember(false);
      setMemberSearch('');
      toast.success(t('teams.memberAdded'));
    },
    onError: () => toast.error(t('teams.addMemberFailed')),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: number) => teamsApi.removeMember(viewTeam!.id, userId),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['team-members', viewTeam?.id] });
      setRemovingMember(null);
      toast.success(t('teams.memberRemoved'));
    },
    onError: () => toast.error(t('teams.removeMemberFailed')),
  });

  const addTeamDomainPermissionMutation = useMutation({
    mutationFn: (data: { domain_id: number; permission?: 'read' | 'write'; sub?: string }) =>
      teamsApi.addDomainPermission(viewTeam!.id, data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['team-domain-permissions', viewTeam?.id] });
      setTeamPermDomainId('');
      setTeamPermPermission('write');
      setTeamPermSub('');
      toast.success(t('teams.permissionSaved'));
    },
    onError: () => toast.error(t('teams.permissionSaveFailed')),
  });

  const removeTeamDomainPermissionMutation = useMutation({
    mutationFn: (permId: number) => teamsApi.removeDomainPermission(viewTeam!.id, permId),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['team-domain-permissions', viewTeam?.id] });
      toast.success(t('teams.permissionRemoved'));
    },
    onError: () => toast.error(t('teams.permissionRemoveFailed')),
  });

  const addMemberDomainPermissionMutation = useMutation({
    mutationFn: (data: { domain_id: number; permission?: 'read' | 'write'; sub?: string }) =>
      teamsApi.addMemberDomainPermission(viewTeam!.id, memberPermissionsFor!.user_id, data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['member-domain-permissions', viewTeam?.id, memberPermissionsFor?.user_id] });
      setMemberPermDomainId('');
      setMemberPermPermission('write');
      setMemberPermSub('');
      toast.success(t('teams.permissionSaved'));
    },
    onError: () => toast.error(t('teams.permissionSaveFailed')),
  });

  const removeMemberDomainPermissionMutation = useMutation({
    mutationFn: (permId: number) => teamsApi.removeMemberDomainPermission(viewTeam!.id, memberPermissionsFor!.user_id, permId),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['member-domain-permissions', viewTeam?.id, memberPermissionsFor?.user_id] });
      toast.success(t('teams.permissionRemoved'));
    },
    onError: () => toast.error(t('teams.permissionRemoveFailed')),
  });

  const memberUserIds = new Set(members.map((m) => m.user_id));
  const availableUsers = allUsers.filter((u: User) => !memberUserIds.has(u.id) && u.id !== me?.id);
  const filteredUsers = availableUsers.filter((u: User) => {
    const query = memberSearch.toLowerCase();
    return (
      u.username.toLowerCase().includes(query) ||
      Boolean(u.nickname?.toLowerCase().includes(query)) ||
      Boolean(u.email?.toLowerCase().includes(query))
    );
  });
  const myMember = members.find((m) => m.user_id === me?.id);
  const canManageTeam = isAdmin(me?.role) || myMember?.role === 'owner';

  // Sync teamForm when editTeam changes
  useEffect(() => {
    if (editTeam) {
      setTeamForm({ name: editTeam.name, description: editTeam.description || '' });
    } else {
      setTeamForm({ name: '', description: '' });
    }
  }, [editTeam?.id]);

  const openCreate = () => {
    setTeamForm({ name: '', description: '' });
    setShowCreate(true);
  };

  const openEdit = (team: Team) => {
    setEditTeam(team);
  };

  const submitTeamForm = (mode: 'create' | 'edit') => {
    const name = teamForm.name.trim();
    if (!name) {
      toast.error(t('teams.teamNamePlaceholder'));
      return;
    }
    const payload = { name, description: teamForm.description.trim() };
    if (mode === 'create') {
      createMutation.mutate(payload);
    } else if (editTeam) {
      updateMutation.mutate({ id: editTeam.id, data: payload });
    }
  };

  const addTeamPermission = () => {
    if (!teamPermDomainId) {
      toast.error(t('teams.selectDomainTip'));
      return;
    }
    addTeamDomainPermissionMutation.mutate({
      domain_id: Number(teamPermDomainId),
      permission: teamPermPermission,
      sub: teamPermSub,
    });
  };

  const addMemberPermission = () => {
    if (!memberPermDomainId) {
      toast.error(t('teams.selectDomainTip'));
      return;
    }
    addMemberDomainPermissionMutation.mutate({
      domain_id: Number(memberPermDomainId),
      permission: memberPermPermission,
      sub: memberPermSub,
    });
  };

  const teamColumns = [
    {
      key: 'name',
      label: t('teams.teamName'),
      render: (team: Team) => (
        <Button variant="text" icon={<UserListIcon />} onClick={() => setViewTeam(team)}>
          {team.name}
        </Button>
      ),
    },
    { key: 'description', label: t('teams.description'), render: (team: Team) => <span className="page-muted">{team.description || '-'}</span> },
    { key: 'member_count', label: t('teams.members'), render: (team: Team) => <Tag variant="light">{team.member_count ?? 0}</Tag> },
    {
      key: 'my_role',
      label: t('teams.myRole'),
      render: (team: Team) => (
        team.my_role ? <Tag theme="primary" variant="light">{roleLabel(team.my_role, t)}</Tag> : <span className="page-muted">-</span>
      ),
    },
    {
      key: 'actions',
      label: t('common.actions'),
      render: (team: Team) => (
        <Space size="small">
          <Button shape="square" variant="text" icon={<EditIcon />} onClick={() => openEdit(team)} />
          <Button shape="square" variant="text" theme="danger" icon={<DeleteIcon />} onClick={() => setDeleteTeam(team)} />
        </Space>
      ),
    },
  ];

  const renderPermissionList = (
    permissions: DomainPermission[],
    loading: boolean,
    onRemove: (id: number) => void,
  ) => {
    if (loading) return <div className="page-state"><Loading loading size="small" /></div>;
    if (permissions.length === 0) return <Empty description={t('teams.noDomainPermissions')} />;
    return (
      <div className="page-list">
        {permissions.map((perm) => (
          <div key={perm.id} className="page-list-item">
            <div className="page-list-item__main">
              <strong>{perm.domain_name ?? `#${perm.domain_id}`}</strong>
              <span>{perm.sub ? `${t('teams.subdomain')}: ${perm.sub}` : t('teams.allSubdomains')}</span>
            </div>
            <Space size="small">
              <Tag theme={perm.permission === 'write' ? 'primary' : 'default'} variant="light">
                {perm.permission === 'write' ? t('teams.permissionWrite') : t('teams.permissionRead')}
              </Tag>
              {canManageTeam && (
                <Button shape="square" variant="text" theme="danger" icon={<DeleteIcon />} onClick={() => onRemove(perm.id)} />
              )}
            </Space>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="page-shell">
      <section className="page-heading">
        <div>
          <h1>{t('teams.title')}</h1>
          <p>{t('teams.subtitle')}</p>
        </div>
        <Button theme="primary" icon={<AddIcon />} onClick={openCreate}>
          {t('teams.createTeam')}
        </Button>
      </section>

      <Card bordered={false} shadow={false} className="page-card">
        <Table columns={teamColumns} data={teams} loading={isLoading} rowKey={(team) => team.id} emptyText={t('teams.noTeams')} />
      </Card>

      {showCreate && (
        <Modal title={t('teams.createTeam')} onClose={() => setShowCreate(false)} size="sm">
          <Form layout="vertical" colon={false} requiredMark={false} className="page-shell" onSubmit={({ e }) => { e?.preventDefault(); submitTeamForm('create'); }}>
            <Form.FormItem label={t('teams.teamName')}>
              <Input value={teamForm.name} onChange={(value) => setTeamForm((form) => ({ ...form, name: String(value) }))} placeholder={t('teams.teamNamePlaceholder')} />
            </Form.FormItem>
            <Form.FormItem label={t('teams.description')}>
              <Input value={teamForm.description} onChange={(value) => setTeamForm((form) => ({ ...form, description: String(value) }))} placeholder={t('teams.descriptionPlaceholder')} />
            </Form.FormItem>
            <Space className="record-form__actions">
              <Button type="submit" theme="primary" loading={createMutation.isPending}>
                {t('common.create')}
              </Button>
            </Space>
          </Form>
        </Modal>
      )}

      {editTeam && (
        <Modal title={t('teams.editTeam')} onClose={() => setEditTeam(null)} size="sm">
          <Form layout="vertical" colon={false} requiredMark={false} className="page-shell" onSubmit={({ e }) => { e?.preventDefault(); submitTeamForm('edit'); }}>
            <Form.FormItem label={t('teams.teamName')}>
              <Input value={teamForm.name} onChange={(value) => setTeamForm((form) => ({ ...form, name: String(value) }))} />
            </Form.FormItem>
            <Form.FormItem label={t('teams.description')}>
              <Input value={teamForm.description} onChange={(value) => setTeamForm((form) => ({ ...form, description: String(value) }))} />
            </Form.FormItem>
            <Space className="record-form__actions">
              <Button type="submit" theme="primary" loading={updateMutation.isPending}>
                {t('common.save')}
              </Button>
            </Space>
          </Form>
        </Modal>
      )}

      {viewTeam && (
        <Modal title={t('teams.teamMembers', { name: viewTeam.name })} onClose={() => setViewTeam(null)} size="lg">
          <div className="page-shell">
            <Card
              bordered
              title={t('teams.membersCount', { count: members.length, suffix: members.length !== 1 ? 's' : '' })}
              actions={canManageTeam && (
                <Button size="small" theme="primary" icon={<UserAddIcon />} onClick={() => setShowAddMember(true)}>
                  {t('teams.addMember')}
                </Button>
              )}
            >
              {membersLoading ? (
                <div className="page-state"><Loading loading size="small" /></div>
              ) : members.length === 0 ? (
                <Empty description={t('teams.noMembers')} />
              ) : (
                <div className="page-list">
                  {members.map((member) => (
                    <div key={member.id} className="page-list-item">
                      <div className="team-member">
                        <Avatar username={getDisplayName(member)} email={member.email} size={32} textClassName="text-xs" />
                        <div className="page-list-item__main">
                          <strong>{getDisplayName(member)}</strong>
                          <span>{member.username} · {member.email || t('teams.noEmail')}</span>
                        </div>
                      </div>
                      <Space size="small">
                        <Tag variant="light">{roleLabel(member.role, t)}</Tag>
                        {canManageTeam && (
                          <Button shape="square" variant="text" icon={<SecuredIcon />} onClick={() => setMemberPermissionsFor(member)} />
                        )}
                        <Button shape="square" variant="text" theme="danger" icon={<UserClearIcon />} onClick={() => setRemovingMember(member)} />
                      </Space>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card bordered title={t('teams.domainPermissions')}>
              {canManageTeam && (
                <div className="permission-form-grid">
                  <Select
                    value={teamPermDomainId}
                    options={[{ label: t('teams.selectDomain'), value: '' }, ...domainOptions]}
                    onChange={(value) => setTeamPermDomainId(selectToDomainId(value))}
                  />
                  <Select
                    value={teamPermPermission}
                    options={[
                      { label: t('teams.permissionRead'), value: 'read' },
                      { label: t('teams.permissionWrite'), value: 'write' },
                    ]}
                    onChange={(value) => setTeamPermPermission(selectToPermission(value))}
                  />
                  <Input value={teamPermSub} onChange={(value) => setTeamPermSub(String(value))} placeholder={t('teams.subdomainPlaceholder')} />
                  <Button theme="primary" loading={addTeamDomainPermissionMutation.isPending} onClick={addTeamPermission}>
                    {t('teams.addPermission')}
                  </Button>
                </div>
              )}
              {renderPermissionList(teamDomainPermissions, teamDomainPermissionsLoading, (id) => removeTeamDomainPermissionMutation.mutate(id))}
            </Card>
          </div>
        </Modal>
      )}

      {showAddMember && viewTeam && (
        <Modal title={t('teams.addTeamMember')} onClose={() => { setShowAddMember(false); setMemberSearch(''); }} size="sm">
          <div className="page-shell">
            <Input clearable value={memberSearch} onChange={(value) => setMemberSearch(String(value))} placeholder={t('teams.searchUsers')} />
            {filteredUsers.length === 0 ? (
              <Empty description={t('teams.noUsersAvailable')} />
            ) : (
              <div className="page-list page-list--scroll">
                {filteredUsers.map((user) => (
                  <Button
                    key={user.id}
                    type="button"
                    variant="outline"
                    onClick={() => addMemberMutation.mutate({ userId: user.id })}
                    disabled={addMemberMutation.isPending}
                    className="page-list-button"
                  >
                    <Avatar username={getDisplayName(user)} email={user.email} size={28} textClassName="text-xs" />
                    <span className="page-list-item__main">
                      <strong>{getDisplayName(user)}</strong>
                      <span>{user.username} · {user.email || t('teams.noEmail')}</span>
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {memberPermissionsFor && viewTeam && (
        <Modal title={t('teams.memberDomainPermissions', { name: getDisplayName(memberPermissionsFor) })} onClose={() => setMemberPermissionsFor(null)} size="lg">
          <div className="page-shell">
            {canManageTeam && (
              <div className="permission-form-grid">
                <Select
                  value={memberPermDomainId}
                  options={[{ label: t('teams.selectDomain'), value: '' }, ...domainOptions]}
                  onChange={(value) => setMemberPermDomainId(selectToDomainId(value))}
                />
                <Select
                  value={memberPermPermission}
                  options={[
                    { label: t('teams.permissionRead'), value: 'read' },
                    { label: t('teams.permissionWrite'), value: 'write' },
                  ]}
                  onChange={(value) => setMemberPermPermission(selectToPermission(value))}
                />
                <Input value={memberPermSub} onChange={(value) => setMemberPermSub(String(value))} placeholder={t('teams.subdomainPlaceholder')} />
                <Button theme="primary" loading={addMemberDomainPermissionMutation.isPending} onClick={addMemberPermission}>
                  {t('teams.addPermission')}
                </Button>
              </div>
            )}
            {renderPermissionList(memberDomainPermissions, memberDomainPermissionsLoading, (id) => removeMemberDomainPermissionMutation.mutate(id))}
          </div>
        </Modal>
      )}

      {removingMember && (
        <ConfirmDialog
          message={t('teams.removeMemberConfirm', { name: getDisplayName(removingMember) })}
          onConfirm={() => removeMemberMutation.mutate(removingMember.user_id)}
          onCancel={() => setRemovingMember(null)}
          isLoading={removeMemberMutation.isPending}
          confirmLabel={t('teams.remove')}
        />
      )}

      {deleteTeam && (
        <ConfirmDialog
          message={t('teams.deleteConfirm', { name: deleteTeam.name })}
          onConfirm={() => deleteMutation.mutate(deleteTeam.id)}
          onCancel={() => setDeleteTeam(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
