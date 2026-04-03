import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Users as UsersIcon, UserPlus, UserMinus, ChevronRight } from 'lucide-react';
import { teamsApi, usersApi } from '../api';
import type { Team, TeamMember, User } from '../api';
import { Table } from '../components/Table';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';

export function Teams() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [viewTeam, setViewTeam] = useState<Team | null>(null);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [deleteTeam, setDeleteTeam] = useState<Team | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [removingMember, setRemovingMember] = useState<TeamMember | null>(null);

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list().then((r) => r.data.data ?? []),
  });

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['team-members', viewTeam?.id],
    queryFn: () => teamsApi.members(viewTeam!.id).then((r) => r.data.data ?? []),
    enabled: !!viewTeam,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then((r) => r.data.data ?? []),
    enabled: showAddMember,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) => teamsApi.create(data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['teams'] });
      setShowCreate(false);
      toast.success('Team created');
    },
    onError: () => toast.error('Failed to create team'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; description?: string } }) => teamsApi.update(id, data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['teams'] });
      setEditTeam(null);
      toast.success('Team updated');
    },
    onError: () => toast.error('Failed to update team'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => teamsApi.delete(id),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['teams'] });
      if (viewTeam?.id === deleteTeam?.id) setViewTeam(null);
      setDeleteTeam(null);
      toast.success('Team deleted');
    },
    onError: () => toast.error('Failed to delete team'),
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ userId }: { userId: number }) => teamsApi.addMember(viewTeam!.id, userId, 'member'),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['team-members', viewTeam?.id] });
      setShowAddMember(false);
      toast.success('Member added');
    },
    onError: () => toast.error('Failed to add member'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: number) => teamsApi.removeMember(viewTeam!.id, userId),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['team-members', viewTeam?.id] });
      setRemovingMember(null);
      toast.success('Member removed');
    },
    onError: () => toast.error('Failed to remove member'),
  });

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  const memberUserIds = new Set(members.map((m) => m.user_id));
  const availableUsers = allUsers.filter((u: User) => !memberUserIds.has(u.id) && u.id !== me?.id);
  const filteredUsers = availableUsers.filter((u: User) =>
    u.username.toLowerCase().includes(memberSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const teamColumns = [
    {
      key: 'name', label: 'Team Name',
      render: (t: Team) => (
        <button onClick={() => setViewTeam(t)} className="flex items-center gap-2 font-medium text-blue-600 hover:text-blue-800 transition-colors">
          <UsersIcon className="w-4 h-4" />
          {t.name}
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      ),
    },
    { key: 'description', label: 'Description', render: (t: Team) => <span className="text-gray-500">{t.description || '—'}</span> },
    {
      key: 'member_count', label: 'Members',
      render: (t: Team) => (
        <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
          {t.member_count ?? 0}
        </span>
      ),
    },
    {
      key: 'my_role', label: 'My Role',
      render: (t: Team) => t.my_role ? <Badge variant="blue">{t.my_role}</Badge> : <span className="text-gray-400 text-xs">—</span>,
    },
    {
      key: 'actions', label: 'Actions',
      render: (t: Team) => (
        <div className="flex items-center gap-2">
          <button onClick={() => setEditTeam(t)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={() => setDeleteTeam(t)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Teams</h2>
          <p className="text-sm text-gray-500">Manage team access to DNS accounts</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Create Team
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <Table columns={teamColumns} data={teams} loading={isLoading} rowKey={(t) => t.id} emptyText="No teams yet." />
      </div>

      {/* Create Team */}
      {showCreate && (
        <Modal title="Create Team" onClose={() => setShowCreate(false)} size="sm">
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.target as HTMLFormElement);
            createMutation.mutate({ name: fd.get('name') as string, description: fd.get('description') as string });
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Team Name *</label>
              <input name="name" required className={inputClass} placeholder="Enter team name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <input name="description" className={inputClass} placeholder="Optional description" />
            </div>
            <div className="flex justify-end pt-2">
              <button type="submit" disabled={createMutation.isPending}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2">
                {createMutation.isPending && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Create
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Team */}
      {editTeam && (
        <Modal title="Edit Team" onClose={() => setEditTeam(null)} size="sm">
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.target as HTMLFormElement);
            updateMutation.mutate({ id: editTeam.id, data: { name: fd.get('name') as string, description: fd.get('description') as string } });
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Team Name *</label>
              <input name="name" required defaultValue={editTeam.name} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <input name="description" defaultValue={editTeam.description} className={inputClass} />
            </div>
            <div className="flex justify-end pt-2">
              <button type="submit" disabled={updateMutation.isPending}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* View Team Members */}
      {viewTeam && (
        <Modal title={`Team: ${viewTeam.name}`} onClose={() => setViewTeam(null)} size="md">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">{members.length} member{members.length !== 1 ? 's' : ''}</p>
              <button onClick={() => setShowAddMember(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                <UserPlus className="w-3.5 h-3.5" /> Add Member
              </button>
            </div>
            {membersLoading ? (
              <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
            ) : members.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No members yet</p>
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {m.username[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{m.username}</p>
                        <p className="text-xs text-gray-500">{m.email || 'No email'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="gray">{m.role}</Badge>
                      <button onClick={() => setRemovingMember(m)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Add Member Modal */}
      {showAddMember && viewTeam && (
        <Modal title="Add Team Member" onClose={() => { setShowAddMember(false); setMemberSearch(''); }} size="sm">
          <div className="space-y-3">
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search users..."
              className={inputClass}
            />
            <div className="max-h-56 overflow-y-auto space-y-1">
              {filteredUsers.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No users available</p>
              ) : filteredUsers.map((u: User) => (
                <button key={u.id} onClick={() => addMemberMutation.mutate({ userId: u.id })}
                  disabled={addMemberMutation.isPending}
                  className="w-full flex items-center gap-2.5 p-2.5 hover:bg-blue-50 rounded-lg transition-colors text-left">
                  <div className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-xs font-bold">
                    {u.username[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{u.username}</p>
                    <p className="text-xs text-gray-500">{u.email || 'No email'}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {removingMember && (
        <ConfirmDialog
          message={`Remove "${removingMember.username}" from the team?`}
          onConfirm={() => removeMemberMutation.mutate(removingMember.user_id)}
          onCancel={() => setRemovingMember(null)}
          isLoading={removeMemberMutation.isPending}
          confirmLabel="Remove"
        />
      )}

      {deleteTeam && (
        <ConfirmDialog
          message={`Delete team "${deleteTeam.name}"? This will remove all team associations.`}
          onConfirm={() => deleteMutation.mutate(deleteTeam.id)}
          onCancel={() => setDeleteTeam(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
