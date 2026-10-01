import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Plus, Pencil, Trash2 } from 'lucide-react';
import api from '../api/client';
import { RentRecord } from '../types';
import HowTo from '../components/HowTo';
import { AttachmentButton } from '../components/AttachmentModal';
import { useAttachmentSummary } from '../lib/attachments';
import SearchBox, { matches } from '../components/SearchBox';
import RentRecordForm, { ContractOption, RentRecordLike } from '../components/RentRecordForm';

export default function RentManagement() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<RentRecord[]>([]);
  const [confirmModal, setConfirmModal] = useState<RentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const files = useAttachmentSummary('RENT_RECORD');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [markingOverdue, setMarkingOverdue] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<{ record?: RentRecordLike } | null>(null);
  const [contractOptions, setContractOptions] = useState<ContractOption[]>([]);

  useEffect(() => { fetchData(); }, [year, month]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function fetchData() {
    setLoading(true);
    const r = await api.get(`/rent-records?year=${year}&month=${month}`);
    setRecords(r.data);
    setLoading(false);
  }

  async function handleConfirmPayment(recordId: string, paidAmount: number) {
    await api.put(`/rent-records/${recordId}/confirm`, { paidAmount, paidDate: new Date().toISOString() });
    setConfirmModal(null);
    fetchData();
  }

  async function openCreate() {
    if (contractOptions.length === 0) {
      const r = await api.get('/contracts');
      setContractOptions(
        r.data
          .filter((c: { status: string }) => c.status === 'ACTIVE')
          .map((c: { id: string; monthlyRent: number; unit?: { unitNumber: string; property?: { name: string } }; tenant?: { name: string } }) => ({
            id: c.id,
            label: `${c.unit?.property?.name ?? ''} ${c.unit?.unitNumber ?? ''}・${c.tenant?.name ?? ''}`,
            monthlyRent: Number(c.monthlyRent),
          })),
      );
    }
    setForm({});
  }

  async function handleDelete(r: RentRecord) {
    if (!confirm(`確定刪除 ${r.contract?.unit?.unitNumber ?? ''} ${r.contract?.tenant?.name ?? ''} ${r.year}/${r.month} 的租金單？`)) return;
    await api.delete(`/rent-records/${r.id}`);
    showToast('已刪除');
    fetchData();
  }

  async function handleMarkOverdue() {
    setMarkingOverdue(true);
    const r = await api.post('/rent-records/mark-overdue');
    setMarkingOverdue(false);
    showToast(`已更新 ${r.data.updated} 筆逾期記錄`);
    fetchData();
  }

  const statusLabel = (s: string) => ({ PAID: '已繳', PENDING: '待繳', OVERDUE: '逾期', PARTIAL: '部分' }[s] ?? s);
  const statusClass = (s: string) => ({ PAID: 'badge-paid', PENDING: 'badge-pending', OVERDUE: 'badge-overdue', PARTIAL: 'badge-pending' }[s] ?? '');

  const filtered = records
    .filter((r) => statusFilter === 'ALL' || r.status === statusFilter)
    .filter((r) => matches(search, r.contract?.tenant?.name, r.contract?.tenant?.phone, r.contract?.unit?.unitNumber, r.contract?.unit?.property?.name, r.notes));

  const totalRent = records.reduce((s, r) => s + Number(r.amount), 0);
  const collectedRent = records.filter((r) => r.status === 'PAID' || r.status === 'PARTIAL').reduce((s, r) => s + Number(r.paidAmount ?? r.amount), 0);
  const overdueCount = records.filter((r) => r.status === 'OVERDUE').length;

  return (
    <div className="px-6 py-6 max-w-4xl relative">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          {toast}
        </div>
      )}
      <div className="page-header items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">租金管理</h1>
          <p className="text-xs text-gray-400 mt-0.5">{year} 年 {month} 月租金收款狀況</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap md:justify-end">
          <button onClick={openCreate} className="flex items-center gap-1.5 text-xs bg-brand text-white rounded-lg px-3 py-1.5 hover:bg-brand-dark">
            <Plus className="w-3.5 h-3.5" />新增租金單
          </button>
          <button
            onClick={handleMarkOverdue}
            disabled={markingOverdue}
            className="flex items-center gap-1.5 text-xs text-orange-600 border border-orange-200 rounded-lg px-3 py-1.5 hover:bg-orange-50 transition-colors disabled:opacity-50"
          >
            {markingOverdue ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            標記逾期
          </button>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input text-xs py-1.5 px-2 w-20">
            {[now.getFullYear() - 1, now.getFullYear()].map((y) => <option key={y}>{y}</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input text-xs py-1.5 px-2 w-16">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m} 月</option>)}
          </select>
        </div>
      </div>

      <HowTo module="rent" />

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-2 md:gap-3 mb-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-3 md:p-4 min-w-0">
          <div className="text-xs text-gray-400 mb-1">應收總額</div>
          <div className="text-sm sm:text-base md:text-lg font-bold text-gray-800">NT${totalRent.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-3 md:p-4 min-w-0">
          <div className="text-xs text-gray-400 mb-1">已收金額</div>
          <div className="text-sm sm:text-base md:text-lg font-bold text-brand">NT${collectedRent.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-3 md:p-4 min-w-0">
          <div className="text-xs text-gray-400 mb-1">逾期筆數</div>
          <div className={`text-sm sm:text-base md:text-lg font-bold ${overdueCount > 0 ? 'text-red-500' : 'text-gray-800'}`}>{overdueCount} 筆</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-4 flex-wrap items-center">
        {['ALL', 'PENDING', 'OVERDUE', 'PAID', 'PARTIAL'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
          >
            {s === 'ALL' ? '全部' : statusLabel(s)}
            <span className="ml-1 opacity-60">({s === 'ALL' ? records.length : records.filter(r => r.status === s).length})</span>
          </button>
        ))}
        <SearchBox value={search} onChange={setSearch} placeholder="搜尋車主、電話、車位編號" className="ml-auto" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">載入中...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-12 text-gray-400 text-sm">{search ? `找不到「${search}」的紀錄` : '本月無收租紀錄'}</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400">
                <th className="text-left px-4 py-3 font-medium">車主</th>
                <th className="text-left px-4 py-3 font-medium">車位編號</th>
                <th className="text-right px-4 py-3 font-medium">應收金額</th>
                <th className="text-left px-4 py-3 font-medium">到期日</th>
                <th className="text-left px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3" />
                <th className="pr-3 py-3 text-right text-xs font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-warm/50">
                  <td className="px-4 py-3 font-medium text-gray-800">{r.contract?.tenant?.name}</td>
                  <td className="px-4 py-3 text-gray-500">{r.contract?.unit?.unitNumber}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-700">NT${Number(r.amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(r.dueDate).toLocaleDateString('zh-TW')}</td>
                  <td className="px-4 py-3">
                    <span className={statusClass(r.status)}>{statusLabel(r.status)}</span>
                    {r.status === 'OVERDUE' && (
                      <span className="ml-1 text-xs text-red-400">
                        {Math.floor((Date.now() - new Date(r.dueDate).getTime()) / 86400000)} 天
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(r.status === 'PENDING' || r.status === 'OVERDUE') && (
                      <button onClick={() => setConfirmModal(r)} className="btn-primary text-xs px-3 py-1.5">確認收款</button>
                    )}
                    {r.status === 'PAID' && r.paidDate && (
                      <span className="text-xs text-gray-400">{new Date(r.paidDate).toLocaleDateString('zh-TW')}</span>
                    )}
                  </td>
                  <td className="pr-3 py-3 whitespace-nowrap text-right">
                    <AttachmentButton
                      compact
                      entityType="RENT_RECORD"
                      entityId={r.id}
                      title={`${r.year}/${r.month} 月租・${r.contract?.tenant?.name ?? ''} ${r.contract?.unit?.unitNumber ?? ''}（轉帳截圖、收據）`}
                      count={files.summary[r.id]?.count}
                      onChanged={files.refresh}
                    />
                    <button onClick={() => setForm({ record: r as unknown as RentRecordLike })} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="編輯">
                      <Pencil className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <button onClick={() => handleDelete(r)} className="p-1.5 rounded-lg hover:bg-red-50" aria-label="刪除">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <RentRecordForm
          record={form.record}
          contracts={contractOptions}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); fetchData(); showToast('已儲存'); window.dispatchEvent(new Event('rentbell:refresh')); }}
        />
      )}

      {confirmModal && (
        <ConfirmPaymentModal
          record={confirmModal}
          onClose={() => setConfirmModal(null)}
          onConfirm={handleConfirmPayment}
        />
      )}
    </div>
  );
}

function ConfirmPaymentModal({ record, onClose, onConfirm }: {
  record: RentRecord;
  onClose: () => void;
  onConfirm: (id: string, amount: number) => void;
}) {
  const [amount, setAmount] = useState(String(record.amount));
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl">
        <h3 className="font-bold text-lg mb-1">確認收款</h3>
        <p className="text-sm text-gray-500 mb-4">{record.contract?.tenant?.name} — {record.contract?.unit?.unitNumber}</p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">收款金額</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">取消</button>
          <button onClick={() => onConfirm(record.id, Number(amount))} className="btn-primary flex-1">確認入帳</button>
        </div>
      </div>
    </div>
  );
}
