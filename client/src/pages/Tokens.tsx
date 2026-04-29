import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, Plus, Trash2, Copy, Check, X, Calendar, Globe, Infinity, Edit2 } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { tokensApi } from '../api';
import { useI18n } from '../contexts/I18nContext';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface Token {
  id: number;
  name: string;
  allowed_domains: number[];
  start_time: string | null;
  end_time: string | null;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export function Tokens() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingToken, setEditingToken] = useState<Token | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [domainSearch, setDomainSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; tokenId: number | null }>({ show: false, tokenId: null });

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    allowed_domains: [] as number[],
    start_time: '',
    end_time: '',
    no_expiry: false,
  });

  const { data: tokens, isLoading } = useQuery({
    queryKey: ['tokens'],
    queryFn: async () => {
      const res = await tokensApi.getAll();
      if (res.data.code === 0) return res.data.data as Token[];
      throw new Error(res.data.msg);
    },
  });

  const { data: domains, isLoading: isLoadingDomains } = useQuery({
    queryKey: ['token-domains'],
    queryFn: async () => {
      const res = await tokensApi.getDomains();
      if (res.data.code === 0) return res.data.data as { id: number; name: string; account_name: string }[];
      throw new Error(res.data.msg);
    },
  });

  const createMutation = useMutation({
    mutationFn: tokensApi.create,
    onSuccess: (res) => {
      if (res.data.code === 0) {
        setNewToken(res.data.data.token);
        queryClient.invalidateQueries({ queryKey: ['tokens'] });
        toast.success(t('tokens.tokenCreated'));
      } else {
        toast.error(res.data.msg);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof tokensApi.update>[1] }) =>
      tokensApi.update(id, data),
    onSuccess: (res) => {
      if (res.data.code === 0) {
        queryClient.invalidateQueries({ queryKey: ['tokens'] });
        toast.success(t('tokens.tokenUpdated'));
        closeEditModal();
      } else {
        toast.error(res.data.msg);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => tokensApi.delete(id),
    onSuccess: (res) => {
      if (res.data.code === 0) {
        queryClient.invalidateQueries({ queryKey: ['tokens'] });
        toast.success(t('tokens.tokenDeleted'));
        setDeleteConfirm({ show: false, tokenId: null });
      } else {
        toast.error(res.data.msg);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleDeleteClick = (tokenId: number) => {
    setDeleteConfirm({ show: true, tokenId });
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm.tokenId !== null) {
      deleteMutation.mutate(deleteConfirm.tokenId);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirm({ show: false, tokenId: null });
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      tokensApi.toggleStatus(id, is_active),
    onSuccess: (res) => {
      if (res.data.code === 0) {
        queryClient.invalidateQueries({ queryKey: ['tokens'] });
        toast.success(t('tokens.tokenStatusUpdated'));
      } else {
        toast.error(res.data.msg);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleCreate = () => {
    if (!formData.name) {
      toast.error(t('tokens.tokenNameRequired'));
      return;
    }
    
    const data = {
      name: formData.name,
      allowed_domains: formData.allowed_domains,
      start_time: formData.start_time,
      end_time: formData.no_expiry ? undefined : formData.end_time,
    };
    
    createMutation.mutate(data);
  };

  const handleEdit = (token: Token) => {
    setEditingToken(token);
    setFormData({
      name: token.name,
      allowed_domains: token.allowed_domains,
      start_time: token.start_time || '',
      end_time: token.end_time || '',
      no_expiry: !token.end_time,
    });
    setShowEditModal(true);
  };

  const handleUpdate = () => {
    if (!editingToken) return;
    if (!formData.name) {
      toast.error(t('tokens.tokenNameRequired'));
      return;
    }

    const data = {
      name: formData.name,
      allowed_domains: formData.allowed_domains,
      start_time: formData.start_time,
      end_time: formData.no_expiry ? undefined : formData.end_time,
    };

    updateMutation.mutate({ id: editingToken.id, data });
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingToken(null);
    setDomainSearch('');
    setFormData({
      name: '',
      allowed_domains: [],
      start_time: '',
      end_time: '',
      no_expiry: false,
    });
  };

  const handleCopyToken = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('tokens.copyFailed'));
    }
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setNewToken(null);
    setDomainSearch('');
    setFormData({
      name: '',
      allowed_domains: [],
      start_time: '',
      end_time: '',
      no_expiry: false,
    });
  };

  const formatDate = (date: string | null) => {
    if (!date) return t('tokens.noExpiry');
    return new Date(date).toLocaleString();
  };

  // Filter domains by search
  const filteredDomains = domains?.filter(d => 
    d.name.toLowerCase().includes(domainSearch.toLowerCase()) ||
    d.account_name.toLowerCase().includes(domainSearch.toLowerCase())
  );

  // Select all domains in current filter
  const selectAllFiltered = () => {
    if (!filteredDomains) return;
    const filteredIds = filteredDomains.map(d => d.id);
    const newSelection = [...new Set([...formData.allowed_domains, ...filteredIds])];
    setFormData({ ...formData, allowed_domains: newSelection });
  };

  // Clear all selection
  const clearAllSelection = () => {
    setFormData({ ...formData, allowed_domains: [] });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('tokens.title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('tokens.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {t('tokens.createToken')}
        </button>
      </div>

      {/* Token List */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">{t('tokens.tokenName')}</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">{t('tokens.domains')}</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">{t('tokens.expiresAt')}</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">{t('tokens.status')}</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">{t('tokens.lastUsedAt')}</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">{t('tokens.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">{t('common.loading')}</td>
              </tr>
            ) : tokens?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">{t('tokens.noTokens')}</td>
              </tr>
            ) : (
              tokens?.map((token) => (
                <tr key={token.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-900 dark:text-white">{token.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {token.allowed_domains.length === 0 ? t('tokens.allDomains') : t('tokens.domainCount', { count: token.allowed_domains.length })}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {formatDate(token.start_time)} - {token.end_time ? formatDate(token.end_time) : t('tokens.noExpiry')}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleMutation.mutate({ id: token.id, is_active: !token.is_active })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        token.is_active ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        token.is_active ? 'translate-x-5' : 'translate-x-1'
                      }`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {token.last_used_at ? new Date(token.last_used_at).toLocaleString() : t('tokens.neverUsed')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleEdit(token)}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded mr-1"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(token.id)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirm Dialog */}
      {deleteConfirm.show && (
        <ConfirmDialog
          message={t('tokens.deleteConfirm')}
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
          isLoading={deleteMutation.isPending}
        />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {newToken ? (
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Key className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('tokens.tokenCreated')}</h2>
                <p className="text-gray-500 mb-4">{t('tokens.copyToken')}</p>
                <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg flex items-center gap-2 mb-4">
                  <code className="flex-1 text-sm break-all">{newToken}</code>
                  <button
                    onClick={handleCopyToken}
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={closeModal}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg"
                >
                  {t('common.confirmAction')}
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('tokens.createToken')}</h2>
                  <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('tokens.tokenName')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder={t('tokens.tokenNamePlaceholder')}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                    />
                  </div>

                  {/* Domains */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <Globe className="w-4 h-4 inline mr-1" />
                      {t('tokens.allowedDomains')}
                    </label>
                    
                    {/* Domain Search */}
                    <input
                      type="text"
                      placeholder={t('tokens.searchDomains')}
                      value={domainSearch}
                      onChange={(e) => setDomainSearch(e.target.value)}
                      className="w-full px-3 py-1.5 mb-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                    />
                    
                    {/* Domain Actions */}
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={selectAllFiltered}
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                      >
                        {t('tokens.selectAllFiltered')}
                      </button>
                      <button
                        onClick={clearAllSelection}
                        className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        {t('tokens.clearAll')}
                      </button>
                      <span className="text-xs text-gray-500 ml-auto">
                        {t('tokens.selectedCount', { count: formData.allowed_domains.length })}
                      </span>
                    </div>

                    <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-3 max-h-48 overflow-y-auto">
                      {isLoadingDomains ? (
                        <p className="text-sm text-gray-500 text-center py-4">{t('common.loading')}</p>
                      ) : !domains || domains.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4">{t('tokens.noDomains')}</p>
                      ) : filteredDomains?.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4">{t('tokens.noMatchingDomains')}</p>
                      ) : (
                        <>
                          <label className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                            <input
                              type="checkbox"
                              checked={formData.allowed_domains.length === 0}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  // 勾选“所有域名”时，清空指定域名列表
                                  setFormData({ ...formData, allowed_domains: [] });
                                }
                              }}
                              className="rounded"
                            />
                            <span className="text-sm font-medium">{t('tokens.allDomains')}</span>
                          </label>
                          {filteredDomains?.map((domain) => (
                            <label key={domain.id} className="flex items-center gap-2 mb-1 py-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
                              <input
                                type="checkbox"
                                checked={formData.allowed_domains.includes(domain.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    // 勾选指定域名时，如果当前是“所有域名”状态（空数组），先初始化
                                    const newAllowedDomains = formData.allowed_domains.length === 0 
                                      ? [] 
                                      : formData.allowed_domains;
                                    setFormData({
                                      ...formData,
                                      allowed_domains: [...newAllowedDomains, domain.id],
                                    });
                                  } else {
                                    setFormData({
                                      ...formData,
                                      allowed_domains: formData.allowed_domains.filter((id) => id !== domain.id),
                                    });
                                  }
                                }}
                                className="rounded"
                              />
                              <div className="flex-1 min-w-0">
                                <span className="text-sm block truncate">{domain.name}</span>
                                <span className="text-xs text-gray-500">{domain.account_name}</span>
                              </div>
                            </label>
                          ))}
                        </>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {t('tokens.allDomainsAllowed')}
                    </p>
                  </div>

                  {/* Time Range */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        <Calendar className="w-4 h-4 inline mr-1" />
                        {t('tokens.startTime')}
                      </label>
                      <input
                        type="datetime-local"
                        value={formData.start_time}
                        onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                      />
                      <p className="text-xs text-gray-500 mt-1">{t('tokens.startTimeHint')}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        <Calendar className="w-4 h-4 inline mr-1" />
                        {t('tokens.endTime')}
                      </label>
                      <input
                        type="datetime-local"
                        value={formData.end_time}
                        onChange={(e) => setFormData({ ...formData, end_time: e.target.value, no_expiry: false })}
                        disabled={formData.no_expiry}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 disabled:bg-gray-100"
                      />
                      <p className="text-xs text-gray-500 mt-1">{t('tokens.endTimeHint')}</p>
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.no_expiry}
                          onChange={(e) => setFormData({ 
                            ...formData, 
                            no_expiry: e.target.checked,
                            end_time: e.target.checked ? '' : formData.end_time
                          })}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          <Infinity className="w-4 h-4 inline mr-1" />
                          {t('tokens.noExpiry')}
                        </span>
                      </label>
                    </div>
                  </div>

                  <p className="text-sm text-gray-500 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <strong>{t('common.remark')}:</strong> {t('tokens.tokenTip')}
                  </p>
                </div>

                <div className="flex justify-end gap-2 mt-6">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={createMutation.isPending || !formData.name}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                  >
                    {createMutation.isPending ? t('common.loading') : t('tokens.createToken')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingToken && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('tokens.editToken')}</h2>
              <button onClick={closeEditModal} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('tokens.tokenName')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('tokens.tokenNamePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                />
              </div>

              {/* Domains */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Globe className="w-4 h-4 inline mr-1" />
                  {t('tokens.allowedDomains')}
                </label>
                
                {/* Domain Search */}
                <input
                  type="text"
                  placeholder={t('tokens.searchDomains')}
                  value={domainSearch}
                  onChange={(e) => setDomainSearch(e.target.value)}
                  className="w-full px-3 py-1.5 mb-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                />
                
                {/* Domain Actions */}
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={selectAllFiltered}
                    className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    {t('tokens.selectAllFiltered')}
                  </button>
                  <button
                    onClick={clearAllSelection}
                    className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    {t('tokens.clearAll')}
                  </button>
                  <span className="text-xs text-gray-500 ml-auto">
                    {t('tokens.selectedCount', { count: formData.allowed_domains.length })}
                  </span>
                </div>

                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-3 max-h-48 overflow-y-auto">
                  {isLoadingDomains ? (
                    <p className="text-sm text-gray-500 text-center py-4">{t('common.loading')}</p>
                  ) : !domains || domains.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">{t('tokens.noDomains')}</p>
                  ) : filteredDomains?.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">{t('tokens.noMatchingDomains')}</p>
                  ) : (
                    <>
                      <label className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                        <input
                          type="checkbox"
                          checked={formData.allowed_domains.length === 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({ ...formData, allowed_domains: [] });
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm font-medium">{t('tokens.allDomains')}</span>
                      </label>
                      {filteredDomains?.map((domain) => (
                        <label key={domain.id} className="flex items-center gap-2 mb-1 py-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
                          <input
                            type="checkbox"
                            checked={formData.allowed_domains.includes(domain.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  allowed_domains: [...formData.allowed_domains, domain.id],
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  allowed_domains: formData.allowed_domains.filter((id) => id !== domain.id),
                                });
                              }
                            }}
                            className="rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm block truncate">{domain.name}</span>
                            <span className="text-xs text-gray-500">{domain.account_name}</span>
                          </div>
                        </label>
                      ))}
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {t('tokens.allDomainsAllowed')}
                </p>
              </div>

              {/* Time Range */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    {t('tokens.startTime')}
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('tokens.startTimeHint')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    {t('tokens.endTime')}
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value, no_expiry: false })}
                    disabled={formData.no_expiry}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 disabled:bg-gray-100"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('tokens.endTimeHint')}</p>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.no_expiry}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        no_expiry: e.target.checked,
                        end_time: e.target.checked ? '' : formData.end_time
                      })}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      <Infinity className="w-4 h-4 inline mr-1" />
                      {t('tokens.noExpiry')}
                    </span>
                  </label>
                </div>
              </div>

              <p className="text-sm text-gray-500 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <strong>{t('common.remark')}:</strong> {t('tokens.tokenTip')}
              </p>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={closeEditModal}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleUpdate}
                disabled={updateMutation.isPending || !formData.name}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                {updateMutation.isPending ? t('common.loading') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
