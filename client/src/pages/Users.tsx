import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Shield } from 'lucide-react';
import { usersApi } from '../api';
import type { User } from '../api';
import { Table } from '../components/Table';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from '../components/Avatar';

export function Users() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then((r) => r.data.data ?? []),
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof usersApi.create>[0]) => usersApi.create(data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowAdd(false);
      toast.success('User created');
    },
    onError: () => toast.error('Failed to create user'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof usersApi.update>[1] }) => usersApi.update(id, data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['users'] });
      setEditing(null);
      toast.success('User updated');
    },
    onError: () => toast.error('Failed to update user'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['users'] });
      setDeleting(null);
      toast.success('User deleted');
    },
    onError: () => toast.error('Failed to delete user'),
  });

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  const columns = [
    {
      key: 'username', label: 'Username',
      render: (u: User) => (
        <div className="flex items-center gap-2">
          <Avatar username={u.username} email={u.email} size={28} textClassName="text-xs" />
          <span className="font-medium text-gray-900">{u.username}</span>
          {u.id === me?.id && <Badge variant="blue">You</Badge>}
        </div>
      ),
    },
    { key: 'email', label: 'Email', render: (u: User) => <span className="text-gray-600">{u.email || '—'}</span> },
    {
      key: 'role', label: 'Role',
      render: (u: User) => (
        <div className="flex items-center gap-1.5">
          {u.role === 'admin' && <Shield className="w-3.5 h-3.5 text-blue-600" />}
          <Badge variant={u.role === 'admin' ? 'blue' : 'gray'}>{u.role}</Badge>
        </div>
      ),
    },
    {
      key: 'status', label: 'Status',
      render: (u: User) => <Badge variant={u.status !== 0 ? 'green' : 'red'}>{u.status !== 0 ? 'Active' : 'Disabled'}</Badge>,
    },
    { key: 'created_at', label: 'Created', render: (u: User) => <span className="text-gray-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</span> },
    {
      key: 'actions', label: 'Actions',
      render: (u: User) => (
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(u)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={() => setDeleting(u)} disabled={u.id === me?.id}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
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
          <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
          <p className="text-sm text-gray-500">Manage platform users and permissions</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <Table columns={columns} data={users} loading={isLoading} rowKey={(u) => u.id} emptyText="No users found." />
      </div>

      {showAdd && (
        <Modal title="Add User" onClose={() => setShowAdd(false)} size="sm">
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.target as HTMLFormElement);
            createMutation.mutate({
              username: fd.get('username') as string,
              email: fd.get('email') as string,
              password: fd.get('password') as string,
              role: fd.get('role') as string,
            });
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Username *</label>
              <input name="username" required className={inputClass} placeholder="Enter username" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input name="email" type="email" className={inputClass} placeholder="Enter email" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password *</label>
              <input name="password" type="password" required className={inputClass} placeholder="Enter password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
              <select name="role" className={inputClass}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="submit" disabled={createMutation.isPending}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2">
                {createMutation.isPending && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Create User
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal title="Edit User" onClose={() => setEditing(null)} size="sm">
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.target as HTMLFormElement);
            const data: Parameters<typeof usersApi.update>[1] = {
              email: fd.get('email') as string,
              role: fd.get('role') as string,
              status: Number(fd.get('status')),
            };
            const pwd = fd.get('password') as string;
            if (pwd) data.password = pwd;
            updateMutation.mutate({ id: editing.id, data });
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
              <p className="text-sm font-semibold text-gray-900">{editing.username}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input name="email" type="email" defaultValue={editing.email} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
              <input name="password" type="password" className={inputClass} placeholder="Leave blank to keep current" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
              <select name="role" defaultValue={editing.role} className={inputClass}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
              <select name="status" defaultValue={editing.status} className={inputClass}>
                <option value={1}>Active</option>
                <option value={0}>Disabled</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="submit" disabled={updateMutation.isPending}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2">
                {updateMutation.isPending && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Save Changes
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          message={`Delete user "${deleting.username}"? This action cannot be undone.`}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
