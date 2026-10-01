import { useEffect, useState } from 'react';
import { X, Plus, Search, AlertTriangle, Calendar, User, Home, FileSignature, CheckCircle2, Send, Copy, Check, Wallet, ShieldCheck, ClipboardCheck, FileText, Pencil, Trash2 } from 'lucide-react';
import api from '../api/client';
import { Contract, Property, Tenant, Unit } from '../types';
import DepositRefundModal from '../components/DepositRefundModal';
import ComplianceModal from '../components/ComplianceModal';
import HandoverModal from '../components/HandoverModal';
import ContractDocumentModal from '../components/ContractDocumentModal';
import HowTo from '../components/HowTo';
import { AttachmentButton } from '../components/AttachmentModal';
import { useAttachmentSummary } from '../lib/attachments';
import { FEATURES } from '../lib/features';
import { BILLING_CYCLE_LABEL, CYCLE_MONTHS, billingSummary, shortTermDays, shortTermQuote } from '../lib/parking';
import type { BillingCycle } from '../types';

type FilterType = 'all' | 'active' | 'expiring' | 'expired' | 'terminated';

export default function Contracts() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filter, setFilter] = useState<FilterType>('active');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const files = useAttachmentSummary('CONTRACT');
  const [signResult, setSignResult] = useState<{ contractId: string; signUrl: string; sent: boolean } | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [depositModal, setDepositModal] = useState<Contract | null>(null);
  const [complianceModal, setComplianceModal] = useState<Contract | null>(null);
  const [handoverModal, setHandoverModal] = useState<Contract | null>(null);
  const [documentModal, setDocumentModal] = useState<Contract | null>(null);
  const [editContract, setEditContract] = useState<Contract | null>(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [c, p, t] = await Promise.all([
      api.get('/contracts'),
      api.get('/properties'),
      api.get('/tenants'),
    ]);
    setContracts(c.data);
    setProperties(p.data);
    setTenants(t.data);
    setLoading(false);
  }

  async function terminate(id: string) {
    if (!confirm('確定要終止此合約？此操作無法復原。')) return;
    await api.put(`/contracts/${id}`, { status: 'TERMINATED' });
    fetchAll();
  }

  async function removeContract(c: Contract) {
    if (!confirm(`確定刪除 ${c.unit?.unitNumber ?? ''} ${c.tenant?.name ?? ''} 的合約？\n會一併刪除這份合約的租金單、點交與退押紀錄，無法復原。\n（正常到期或退租請用「終止合約」）`)) return;
    await api.delete(`/contracts/${c.id}`);
    fetchAll();
  }

  async function sendSignInvite(id: string) {
    setSigningId(id);
    try {
      const r = await api.post(`/contracts/${id}/sign-invite`);
      setSignResult({ contractId: id, signUrl: r.data.signUrl, sent: r.data.sent });
    } catch (e: any) {
      alert(e.response?.data?.error ?? '發送失敗');
    } finally {
      setSigningId(null);
    }
  }

  function copySignUrl(url: string) {
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }

  const now = Date.now();
  const thirtyDays = 30 * 86400000;

  const filtered = contracts
    .filter((c) => {
      const end = new Date(c.endDate).getTime();
      const daysLeft = (end - now) / 86400000;
      if (filter === 'active') return c.status === 'ACTIVE';
      if (filter === 'expiring') return c.status === 'ACTIVE' && daysLeft <= 30 && daysLeft > 0;
      if (filter === 'expired') return c.status === 'EXPIRED';
      if (filter === 'terminated') return c.status === 'TERMINATED';
      return true;
    })
    .filter((c) => {
      if (!search) return true;
      const tenantName = c.tenant?.name ?? '';
      const unit = c.unit?.unitNumber ?? '';
      return tenantName.includes(search) || unit.includes(search);
    });

  const counts = {
    all: contracts.length,
    active: contracts.filter((c) => c.status === 'ACTIVE').length,
    expiring: contracts.filter((c) => {
      const d = (new Date(c.endDate).getTime() - now) / 86400000;
      return c.status === 'ACTIVE' && d <= 30 && d > 0;
    }).length,
    expired: contracts.filter((c) => c.status === 'EXPIRED').length,
    terminated: contracts.filter((c) => c.status === 'TERMINATED').length,
  };

  const statusLabel = (s: string) => ({ ACTIVE: '進行中', EXPIRED: '已到期', TERMINATED: '已終止' }[s] ?? s);
  const statusClass = (s: string) => ({
    ACTIVE: 'bg-green-100 text-green-700',
    EXPIRED: 'bg-orange-100 text-orange-600',
    TERMINATED: 'bg-gray-100 text-gray-500',
  }[s] ?? 'bg-gray-100 text-gray-500');

  const allUnits = properties.flatMap((p) => p.units.map((u) => ({ ...u, propertyName: p.name })));

  return (
    <div className="px-6 py-6 max-w-5xl">
      {/* Header */}
      <div className="page-header items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">合約管理</h1>
          <p className="text-xs text-gray-400 mt-0.5">共 {contracts.length} 份合約，{counts.active} 份進行中</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" />新增合約
        </button>
      </div>

      <HowTo module="contracts" />

      {/* Expiring alerts */}
      {counts.expiring > 0 && (
        <div className="mb-4 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <span className="text-sm text-orange-700">有 <strong>{counts.expiring}</strong> 份合約將在 30 天內到期，請及時處理續租或到期事宜。</span>
          <button onClick={() => setFilter('expiring')} className="ml-auto text-xs text-orange-600 underline whitespace-nowrap">查看</button>
        </div>
      )}

      {/* Filters + Search */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100">
          {([
            { key: 'all', label: '全部' },
            { key: 'active', label: '進行中' },
            { key: 'expiring', label: '即將到期' },
            { key: 'expired', label: '已到期' },
            { key: 'terminated', label: '已終止' },
          ] as const).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors relative ${filter === f.key ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {f.label} ({counts[f.key]})
              {f.key === 'expiring' && counts.expiring > 0 && filter !== 'expiring' && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            placeholder="搜尋車主姓名或車位編號"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-xl pl-8 pr-3 py-2 outline-none focus:border-brand bg-white"
          />
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">載入中...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-12 text-gray-400 text-sm">
          {search ? `找不到「${search}」的相關合約` : '暫無符合條件的合約'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const end = new Date(c.endDate).getTime();
            const daysLeft = Math.ceil((end - now) / 86400000);
            const isExpiringSoon = c.status === 'ACTIVE' && daysLeft <= 30 && daysLeft > 0;

            return (
              <div key={c.id} className={`bg-white rounded-2xl border p-4 ${isExpiringSoon ? 'border-orange-200' : 'border-gray-100'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-warm rounded-xl flex items-center justify-center flex-shrink-0">
                      <Home className="w-4 h-4 text-brand" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-800">{c.unit?.unitNumber}</span>
                        <span className="text-xs text-gray-400">{c.unit?.property?.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusClass(c.status)}`}>
                          {statusLabel(c.status)}
                        </span>
                        {isExpiringSoon && (
                          <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                            <AlertTriangle className="w-3 h-3" />{daysLeft} 天後到期
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                        <User className="w-3 h-3" />{c.tenant?.name} · {c.tenant?.phone}
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const b = billingSummary(c);
                    return (
                      <div className="text-right">
                        <div className="font-bold text-gray-800">NT${b.amount.toLocaleString()}</div>
                        <div className="text-xs text-gray-400">{c.billingCycle && c.billingCycle !== 'MONTHLY' ? `${b.label} ` : ''}{b.unit}</div>
                      </div>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-3 gap-2 bg-warm rounded-xl p-3 mb-3 text-xs text-center">
                  <div>
                    <div className="text-gray-400 mb-0.5">開始日期</div>
                    <div className="font-medium text-gray-700">{new Date(c.startDate).toLocaleDateString('zh-TW')}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 mb-0.5">結束日期</div>
                    <div className={`font-medium ${isExpiringSoon ? 'text-orange-600' : 'text-gray-700'}`}>
                      {new Date(c.endDate).toLocaleDateString('zh-TW')}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 mb-0.5">押金</div>
                    <div className="font-medium text-gray-700">NT${Number(c.depositAmount).toLocaleString()}</div>
                  </div>
                </div>

                {c.notes && (
                  <p className="text-xs text-gray-400 mb-3">備註：{c.notes}</p>
                )}

                {/* Sign status */}
                {c.signedAt ? (
                  <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 rounded-lg px-2.5 py-1.5 mb-2 w-fit">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    已電子簽署 · {new Date(c.signedAt).toLocaleDateString('zh-TW')}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 rounded-lg px-2.5 py-1.5 mb-2 w-fit">
                    <FileSignature className="w-3.5 h-3.5" />
                    尚未簽署
                  </div>
                )}

                {/* Deposit refund status badge */}
                {c.depositRefund && (
                  <div className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 mb-2 w-fit ${
                    c.depositRefund.status === 'COMPLETED'
                      ? 'bg-green-50 text-green-600'
                      : 'bg-yellow-50 text-yellow-700'
                  }`}>
                    <Wallet className="w-3.5 h-3.5" />
                    {c.depositRefund.status === 'COMPLETED'
                      ? `押金已退 NT$${Number(c.depositRefund.refundAmount).toLocaleString()}`
                      : `退押進行中・應退 NT$${Number(c.depositRefund.refundAmount).toLocaleString()}`}
                  </div>
                )}

                {c.status === 'ACTIVE' && (
                  <div className="flex gap-2 flex-wrap">
                    {!c.signedAt && (
                      <button
                        onClick={() => sendSignInvite(c.id)}
                        disabled={signingId === c.id}
                        className="text-xs px-3 py-1.5 border border-brand/30 rounded-lg text-brand hover:bg-brand/5 transition-colors flex items-center gap-1 disabled:opacity-50"
                      >
                        <Send className="w-3 h-3" />
                        {signingId === c.id ? '發送中...' : '邀請簽署'}
                      </button>
                    )}
                    <button
                      onClick={() => setDocumentModal(c)}
                      className="text-xs px-3 py-1.5 border border-brand/30 rounded-lg text-brand hover:bg-brand/5 transition-colors flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" />租約書
                    </button>
                    {FEATURES.handover && <button
                      onClick={() => setHandoverModal(c)}
                      className="text-xs px-3 py-1.5 border border-brand/30 rounded-lg text-brand hover:bg-brand/5 transition-colors flex items-center gap-1"
                    >
                      <ClipboardCheck className="w-3 h-3" />點交
                    </button>}
                    {FEATURES.residentialCompliance && <button
                      onClick={() => setComplianceModal(c)}
                      className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1"
                    >
                      <ShieldCheck className="w-3 h-3" />合規檢查
                    </button>}
                    <button
                      onClick={() => setDepositModal(c)}
                      className="text-xs px-3 py-1.5 border border-orange-200 rounded-lg text-orange-600 hover:bg-orange-50 transition-colors flex items-center gap-1"
                    >
                      <Wallet className="w-3 h-3" />辦理退押
                    </button>
                    <button
                      onClick={() => terminate(c.id)}
                      className="text-xs px-3 py-1.5 border border-red-100 rounded-lg text-red-400 hover:bg-red-50 transition-colors"
                    >
                      終止合約
                    </button>
                    <div className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
                      <Calendar className="w-3 h-3" />
                      {c.billingCycle === 'SHORT_TERM'
                        ? '起租日一次收清'
                        : c.billingCycle && c.billingCycle !== 'MONTHLY'
                          ? `每 ${CYCLE_MONTHS[c.billingCycle]} 個月收一次・${c.rentDueDay} 日`
                          : `每月 ${c.rentDueDay} 日繳費`}
                    </div>
                  </div>
                )}

                {(c.vehicle || c.accessCard) && (
                  <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500 mt-2">
                    {c.vehicle && <span>🚗 <span className="font-semibold tracking-wide text-gray-700">{c.vehicle.plateNumber}</span></span>}
                    {c.accessCard && (
                      <span>
                        遙控器／感應卡：{c.accessCard}
                        {c.accessCardDeposit ? `（押金 NT$${Number(c.accessCardDeposit).toLocaleString()}）` : ''}
                        {c.status !== 'ACTIVE' && (c.accessCardReturned
                          ? <span className="text-green-600 ml-1">已歸還</span>
                          : <span className="text-red-500 ml-1">尚未歸還</span>)}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setEditContract(c)}
                    className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" />編輯
                  </button>
                  <button
                    onClick={() => removeContract(c)}
                    className="text-xs px-3 py-1.5 border border-red-100 rounded-lg text-red-400 hover:bg-red-50 transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />刪除
                  </button>
                  <AttachmentButton
                    entityType="CONTRACT"
                    entityId={c.id}
                    title={`合約 ${c.tenant?.name ?? ''}・${c.unit?.property?.name ?? ''} ${c.unit?.unitNumber ?? ''}（紙本合約掃描、進場／退租車況照）`}
                    count={files.summary[c.id]?.count}
                    onChanged={files.refresh}
                  />
                </div>

                {/* Terminated/Expired: show deposit button */}
                {(c.status === 'TERMINATED' || c.status === 'EXPIRED') && c.depositPaid && (
                  <button
                    onClick={() => setDepositModal(c)}
                    className="text-xs px-3 py-1.5 border border-orange-200 rounded-lg text-orange-600 hover:bg-orange-50 transition-colors flex items-center gap-1 w-fit mt-1"
                  >
                    <Wallet className="w-3 h-3" />
                    {c.depositRefund ? '查看退押明細' : '辦理退押'}
                  </button>
                )}

                {/* Sign link result */}
                {signResult?.contractId === c.id && (
                  <div className="mt-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
                    <div className="text-xs text-blue-700 font-medium mb-2">
                      {signResult.sent ? '✅ 已透過 LINE 發送簽署連結給車主' : '⚠️ 車主尚未綁定 LINE，請複製連結手動發送'}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={signResult.signUrl}
                        className="flex-1 text-xs bg-white border border-blue-100 rounded-lg px-2 py-1 text-blue-800 truncate"
                      />
                      <button onClick={() => copySignUrl(signResult.signUrl)} className="p-1.5 bg-white border border-blue-100 rounded-lg hover:border-blue-300 transition-colors">
                        {copiedUrl ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-blue-500" />}
                      </button>
                    </div>
                    <button onClick={() => setSignResult(null)} className="text-xs text-blue-400 mt-1.5 hover:text-blue-600">關閉</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddContractModal
          units={allUnits}
          tenants={tenants}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); fetchAll(); }}
        />
      )}

      {editContract && (
        <AddContractModal
          contract={editContract}
          units={[]}
          tenants={[]}
          onClose={() => setEditContract(null)}
          onSaved={() => { setEditContract(null); fetchAll(); }}
        />
      )}
      {depositModal && (
        <DepositRefundModal
          contract={depositModal}
          onClose={() => setDepositModal(null)}
          onSaved={() => { fetchAll(); }}
        />
      )}

      {complianceModal && (
        <ComplianceModal contract={complianceModal} onClose={() => setComplianceModal(null)} />
      )}

      {documentModal && (
        <ContractDocumentModal contract={documentModal} onClose={() => setDocumentModal(null)} />
      )}

      {handoverModal && (
        <HandoverModal contract={handoverModal} onClose={() => setHandoverModal(null)} />
      )}
    </div>
  );
}

function AddContractModal({ contract, units, tenants, onClose, onSaved }: {
  contract?: Contract;
  units: Array<Unit & { propertyName: string }>;
  tenants: Tenant[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const day = (v?: string) => (v ? String(v).split('T')[0] : '');
  const [form, setForm] = useState({
    unitId: contract?.unitId ?? '',
    tenantId: contract?.tenantId ?? '',
    startDate: day(contract?.startDate) || new Date().toISOString().split('T')[0],
    endDate: day(contract?.endDate),
    monthlyRent: contract ? String(contract.monthlyRent) : '',
    depositAmount: contract ? String(contract.depositAmount ?? '') : '',
    rentDueDay: String(contract?.rentDueDay ?? 5),
    billingCycle: (contract?.billingCycle ?? 'MONTHLY') as BillingCycle,
    periodAmount: contract?.periodAmount != null ? String(contract.periodAmount) : '',
    notes: contract?.notes ?? '',
    vehicleId: contract?.vehicleId ?? '',
    accessCard: contract?.accessCard ?? '',
    accessCardDeposit: contract?.accessCardDeposit != null ? String(contract.accessCardDeposit) : '',
    accessCardReturned: contract?.accessCardReturned ?? false,
  });
  const vehicleOptions = contract
    ? contract.tenant?.vehicles ?? []
    : tenants.find((t) => t.id === form.tenantId)?.vehicles ?? [];

  const [error, setError] = useState('');
  const selectedUnit = units.find((u) => u.id === form.unitId) ?? contract?.unit;
  const shortTerm = form.billingCycle === 'SHORT_TERM';
  const months = form.billingCycle === 'SHORT_TERM' ? 0 : CYCLE_MONTHS[form.billingCycle];
  const fullPrice = (Number(form.monthlyRent) || 0) * months; // 每期原價
  const days = shortTerm ? shortTermDays(form.startDate, form.endDate) : 0;
  const quote = shortTerm ? shortTermQuote(selectedUnit, days) : null;
  // 每期金額留空 = 原價（月租 × 期數）；短租留空 = 依日租／週租估價
  const effectiveAmount = form.periodAmount !== '' ? Number(form.periodAmount) : shortTerm ? quote : fullPrice;
  const discount = !shortTerm && form.periodAmount !== '' && fullPrice > 0 ? fullPrice - Number(form.periodAmount) : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    // 月繳且沒另外設定金額時，不存每期金額（跟著月租走）
    const payload = {
      ...form,
      periodAmount: form.billingCycle === 'MONTHLY' ? '' : form.periodAmount !== '' ? form.periodAmount : shortTerm && quote != null ? String(quote) : '',
    };
    try {
      if (contract) {
        const { unitId: _u, tenantId: _t, ...rest } = payload;
        await api.put(`/contracts/${contract.id}`, rest);
      } else {
        await api.post('/contracts', payload);
      }
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? '儲存失敗');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">{contract ? '編輯合約' : '新增合約'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {contract ? (
            <div className="text-sm text-gray-600 bg-warm rounded-xl px-3 py-2">
              {contract.unit?.unitNumber}・{contract.tenant?.name}
              <div className="text-xs text-gray-400">車位與車主建立後不可更換，需更換請終止後重新簽約</div>
            </div>
          ) : (<>
          <div>
            <label className="block text-sm font-medium mb-1">車位 <span className="text-red-400">*</span></label>
            <select
              className="input"
              value={form.unitId}
              onChange={(e) => {
                const u = units.find((u) => u.id === e.target.value);
                setForm({ ...form, unitId: e.target.value, monthlyRent: u ? String(u.monthlyRent) : form.monthlyRent });
              }}
              required
            >
              <option value="">請選擇車位</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.propertyName} — {u.unitNumber} (NT${Number(u.monthlyRent).toLocaleString()})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">車主 <span className="text-red-400">*</span></label>
            <select className="input" value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} required>
              <option value="">請選擇車主</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.phone}</option>)}
            </select>
          </div>
          </>)}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium mb-1">開始日期 <span className="text-red-400">*</span></label>
              <input type="date" className="input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">結束日期 <span className="text-red-400">*</span></label>
              <input type="date" className="input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">繳費方式</label>
            <select
              className="input"
              value={form.billingCycle}
              onChange={(e) => setForm({ ...form, billingCycle: e.target.value as BillingCycle, periodAmount: '' })}
            >
              {Object.entries(BILLING_CYCLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium mb-1">月租金 {!shortTerm && <span className="text-red-400">*</span>}</label>
              <input type="number" className="input" value={form.monthlyRent} onChange={(e) => setForm({ ...form, monthlyRent: e.target.value })} required={!shortTerm} placeholder={shortTerm ? '參考用' : ''} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">押金</label>
              <input type="number" className="input" value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: e.target.value })} placeholder="0" />
            </div>
          </div>
          {form.billingCycle !== 'MONTHLY' && (
            <div className="bg-warm rounded-xl p-3 space-y-1.5">
              <label className="block text-sm font-medium">
                {shortTerm ? `短租總額（${days > 0 ? `${days} 天` : '請先選日期'}）` : `每期收費（${months} 個月）`}
              </label>
              <input
                type="number"
                min="1"
                className="input"
                value={form.periodAmount}
                onChange={(e) => setForm({ ...form, periodAmount: e.target.value })}
                placeholder={shortTerm ? (quote != null ? `依日租／週租估 ${quote}` : '請輸入總金額') : `原價 ${fullPrice}`}
                required={shortTerm && quote == null}
              />
              <div className="text-xs text-gray-500">
                {shortTerm
                  ? quote != null
                    ? `留空會用車位的日租／週租價估算：NT$${quote.toLocaleString()}`
                    : '這個車位沒有設定日租／週租價，請直接輸入總金額'
                  : discount > 0
                    ? `原價 NT$${fullPrice.toLocaleString()}，折扣 NT$${discount.toLocaleString()}（約 ${Math.round((Number(form.periodAmount) / fullPrice) * 100) / 10} 折）`
                    : `留空 = 月租 × ${months} = NT$${fullPrice.toLocaleString()}；有折扣請輸入折扣後金額`}
              </div>
              {effectiveAmount != null && effectiveAmount > 0 && (
                <div className="text-xs text-gray-400">
                  {shortTerm ? '起租日開一張單，一次收清' : `從起租月起每 ${months} 個月開一張 NT$${effectiveAmount.toLocaleString()} 的單；最後一期不足 ${months} 個月時按比例計算`}
                </div>
              )}
            </div>
          )}
          {!shortTerm && (
            <div>
              <label className="block text-sm font-medium mb-1">{form.billingCycle === 'MONTHLY' ? '每月繳租日' : '每期繳費日（幾號）'}</label>
              <input type="number" min="1" max="31" className="input" value={form.rentDueDay} onChange={(e) => setForm({ ...form, rentDueDay: e.target.value })} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">登記車輛</label>
              <select className="input" value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
                <option value="">{vehicleOptions.length ? '不指定' : '此車主尚未登記車輛（可到「車主」新增）'}</option>
                {vehicleOptions.map((v) => <option key={v.id} value={v.id}>{v.plateNumber}（{v.type === 'MOTORCYCLE' ? '機車' : v.type === 'CAR' ? '汽車' : '其他'}）</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">遙控器／感應卡號</label>
              <input className="input" value={form.accessCard} onChange={(e) => setForm({ ...form, accessCard: e.target.value })} placeholder="例：R-012" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">遙控器押金</label>
              <input type="number" className="input" value={form.accessCardDeposit} onChange={(e) => setForm({ ...form, accessCardDeposit: e.target.value })} placeholder="0" />
            </div>
            {contract && form.accessCard && (
              <label className="col-span-2 flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" className="accent-brand" checked={form.accessCardReturned} onChange={(e) => setForm({ ...form, accessCardReturned: e.target.checked })} />
                遙控器／感應卡已歸還
              </label>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">備註</label>
            <textarea className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="選填" />
          </div>
          {error && <div className="text-sm text-red-500">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
            <button type="submit" className="btn-primary flex-1">{contract ? '儲存' : '新增合約'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
