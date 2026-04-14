import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Plus, Trash2, RefreshCw, Download, CheckCircle, XCircle, Clock, AlertTriangle, Loader } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import type { Certificate } from '../api';
import { certificatesApi } from '../api';
import { useI18n } from '../contexts/I18nContext';

export function Certificates() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    domain: '',
    domain_id: 0,
    auto_renew: true,
  });

  const { data: certificates, isLoading } = useQuery({
    queryKey: ['certificates'],
    queryFn: async () => {
      const res = await certificatesApi.getAll();
      if (res.data.code === 0) return res.data.data as Certificate[];
      throw new Error(res.data.msg);
    },
  });

  const { data: domains } = useQuery({
    queryKey: ['cert-domains'],
    queryFn: async () => {
      const res = await certificatesApi.getDomains();
      if (res.data.code === 0) return res.data.data as { id: number; name: string; account_name: string }[];
      throw new Error(res.data.msg);
    },
  });

  const applyMutation = useMutation({
    mutationFn: certificatesApi.apply,
    onSuccess: (res) => {
      if (res.data.code === 0) {
        queryClient.invalidateQueries({ queryKey: ['certificates'] });
        toast.success(t('certificates.applySuccess'));
        setShowApplyModal(false);
        setFormData({ domain: '', domain_id: 0, auto_renew: true });
      } else {
        toast.error(res.data.msg);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => certificatesApi.delete(id),
    onSuccess: (res) => {
      if (res.data.code === 0) {
        queryClient.invalidateQueries({ queryKey: ['certificates'] });
        toast.success(t('certificates.deleteSuccess'));
      } else {
        toast.error(res.data.msg);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const renewMutation = useMutation({
    mutationFn: (id: number) => certificatesApi.renew(id),
    onSuccess: (res) => {
      if (res.data.code === 0) {
        queryClient.invalidateQueries({ queryKey: ['certificates'] });
        toast.success(t('certificates.renewSuccess'));
      } else {
        toast.error(res.data.msg);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleAutoRenewMutation = useMutation({
    mutationFn: ({ id, auto_renew }: { id: number; auto_renew: boolean }) =>
      certificatesApi.toggleAutoRenew(id, auto_renew),
    onSuccess: (res) => {
      if (res.data.code === 0) {
        queryClient.invalidateQueries({ queryKey: ['certificates'] });
        toast.success(t('certificates.autoRenewUpdated'));
      } else {
        toast.error(res.data.msg);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleApply = () => {
    if (!formData.domain || !formData.domain_id) {
      toast.error(t('certificates.domainNameHint'));
      return;
    }
    applyMutation.mutate({
      domain: formData.domain,
      domain_id: formData.domain_id,
      auto_renew: formData.auto_renew,
    });
  };

  const handleDownload = async (certId: number, type: 'certificate' | 'private_key' | 'ca_certificate' | 'fullchain') => {
    try {
      const res = await certificatesApi.download(certId, type);
      if (res.data.code === 0) {
        const { content, filename } = res.data.data;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        toast.error(res.data.msg);
      }
    } catch {
      toast.error(t('certificates.downloadFailed'));
    }
    setShowDownloadMenu(null);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'valid': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'issuing': return <Loader className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'expired': return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'valid': return t('certificates.statusValid');
      case 'issuing': return t('certificates.statusIssuing');
      case 'pending': return t('certificates.statusPending');
      case 'expired': return t('certificates.statusExpired');
      case 'failed': return t('certificates.statusFailed');
      default: return status;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-green-600" />
            {t('certificates.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('certificates.subtitle')}
          </p>
        </div>
        <button
          onClick={() => setShowApplyModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('certificates.applyCert')}
        </button>
      </div>

      {/* Certificate List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : !certificates || certificates.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <ShieldCheck className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">{t('certificates.noCertificates')}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('certificates.domain')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('certificates.status')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('certificates.issuer')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('certificates.notAfter')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('certificates.autoRenew')}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('certificates.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {certificates.map((cert) => (
                <tr key={cert.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{cert.domain}</span>
                    </div>
                    {cert.last_error && cert.status === 'failed' && (
                      <p className="text-xs text-red-500 mt-0.5 truncate max-w-xs" title={cert.last_error}>
                        {cert.last_error}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      {getStatusIcon(cert.status)}
                      {getStatusText(cert.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {cert.issuer || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {formatDate(cert.not_after)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleAutoRenewMutation.mutate({ id: cert.id, auto_renew: !cert.auto_renew })}
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        cert.auto_renew
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                      }`}
                    >
                      {cert.auto_renew ? t('certificates.enabled') : t('certificates.disabled')}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {cert.status === 'valid' && (
                        <div className="relative">
                          <button
                            onClick={() => setShowDownloadMenu(showDownloadMenu === cert.id ? null : cert.id)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors"
                            title={t('certificates.download')}
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {showDownloadMenu === cert.id && (
                            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 py-1 min-w-[180px]">
                              <button onClick={() => handleDownload(cert.id, 'certificate')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
                                {t('certificates.downloadCert')}
                              </button>
                              <button onClick={() => handleDownload(cert.id, 'private_key')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
                                {t('certificates.downloadKey')}
                              </button>
                              <button onClick={() => handleDownload(cert.id, 'ca_certificate')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
                                {t('certificates.downloadCA')}
                              </button>
                              <button onClick={() => handleDownload(cert.id, 'fullchain')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
                                {t('certificates.downloadFullchain')}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {(cert.status === 'valid' || cert.status === 'expired' || cert.status === 'failed') && (
                        <button
                          onClick={() => renewMutation.mutate(cert.id)}
                          className="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 rounded transition-colors"
                          title={t('certificates.renew')}
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                      {deleteConfirm === cert.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { deleteMutation.mutate(cert.id); setDeleteConfirm(null); }}
                            className="p-1.5 text-red-600 hover:text-red-700 rounded transition-colors"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(cert.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
                          title={t('certificates.delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Apply Certificate Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowApplyModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t('certificates.applyCert')}
            </h2>

            <div className="space-y-4">
              {/* Domain Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('certificates.selectDomain')}
                </label>
                {domains && domains.length > 0 ? (
                  <select
                    value={formData.domain_id}
                    onChange={(e) => {
                      const id = parseInt(e.target.value);
                      const domain = domains.find(d => d.id === id);
                      setFormData(prev => ({
                        ...prev,
                        domain_id: id,
                        domain: domain ? domain.name : '',
                      }));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value={0}>{t('common.pleaseSelect')}</option>
                    {domains.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.account_name})</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('certificates.noDomains')}</p>
                )}
              </div>

              {/* Certificate Domain Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('certificates.domainName')}
                </label>
                <input
                  type="text"
                  value={formData.domain}
                  onChange={(e) => setFormData(prev => ({ ...prev, domain: e.target.value }))}
                  placeholder={t('certificates.domainNamePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('certificates.wildcardTip')}
                </p>
              </div>

              {/* Auto Renew */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="auto-renew"
                  checked={formData.auto_renew}
                  onChange={(e) => setFormData(prev => ({ ...prev, auto_renew: e.target.checked }))}
                  className="rounded border-gray-300 dark:border-gray-600 text-green-600"
                />
                <label htmlFor="auto-renew" className="text-sm text-gray-700 dark:text-gray-300">
                  {t('certificates.autoRenew')}
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowApplyModal(false)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleApply}
                disabled={applyMutation.isPending || !formData.domain || !formData.domain_id}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {applyMutation.isPending ? t('common.loading') : t('certificates.applyCert')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
