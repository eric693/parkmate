import { useState } from 'react';
import { X } from 'lucide-react';
import api from '../api/client';

export interface RentRecordLike {
  id: string;
  year: number;
  month: number;
  amount: number | string;
  dueDate: string;
  paidDate?: string | null;
  paidAmount?: number | string | null;
  status: string;
  paymentMethod?: string | null;
  notes?: string | null;
}

export interface ContractOption {
  id: string;
  label: string;
  monthlyRent: number;
}

const toDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }) : '');

/**
 * 租金單新增／編輯表單。
 * 傳 record = 編輯；不傳則為新增，需給 contracts 讓使用者選車位。
 */
export default function RentRecordForm({
  record, contracts = [], defaultContractId, onClose, onSaved,
}: {
  record?: RentRecordLike;
  contracts?: ContractOption[];
  defaultContractId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const now = new Date();
  const [form, setForm] = useState({
    contractId: defaultContractId ?? contracts[0]?.id ?? '',
    year: record?.year ?? now.getFullYear(),
    month: record?.month ?? now.getMonth() + 1,
    amount: String(record?.amount ?? contracts.find((c) => c.id === (defaultContractId ?? contracts[0]?.id))?.monthlyRent ?? ''),
    dueDate: toDate(record?.dueDate),
    status: record?.status ?? 'PENDING',
    paidAmount: record?.paidAmount != null ? String(record.paidAmount) : '',
    paidDate: toDate(record?.paidDate),
    paymentMethod: record?.paymentMethod ?? '',
    notes: record?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof form, v: string | number) => setForm((f) => ({ ...f, [k]: v }));
  const paid = form.status === 'PAID' || form.status === 'PARTIAL';

  async function submit() {
    setSaving(true);
    setError('');
    try {
      if (record) {
        await api.put(`/rent-records/${record.id}`, {
          amount: form.amount,
          dueDate: form.dueDate || undefined,
          status: form.status,
          paidAmount: paid ? form.paidAmount || form.amount : null,
          paidDate: paid ? form.paidDate || new Date().toISOString() : null,
          paymentMethod: form.paymentMethod,
          notes: form.notes,
        });
      } else {
        await api.post('/rent-records', {
          contractId: form.contractId, year: form.year, month: form.month,
          amount: form.amount, dueDate: form.dueDate || undefined, notes: form.notes,
        });
      }
      onSaved();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">{record ? `編輯租金單 ${record.year}/${record.month}` : '新增租金單'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          {!record && (
            <>
              <label className="block text-xs text-gray-500">車位／車主
                <select
                  className="input mt-1 w-full"
                  value={form.contractId}
                  onChange={(e) => {
                    const c = contracts.find((x) => x.id === e.target.value);
                    setForm((f) => ({ ...f, contractId: e.target.value, amount: String(c?.monthlyRent ?? f.amount) }));
                  }}
                >
                  {contracts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-gray-500">年
                  <input type="number" className="input mt-1 w-full" value={form.year} onChange={(e) => set('year', Number(e.target.value))} />
                </label>
                <label className="block text-xs text-gray-500">月
                  <select className="input mt-1 w-full" value={form.month} onChange={(e) => set('month', Number(e.target.value))}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m} 月</option>)}
                  </select>
                </label>
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-gray-500">應收金額
              <input type="number" className="input mt-1 w-full" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
            </label>
            <label className="block text-xs text-gray-500">到期日{!record && '（空白依合約繳租日）'}
              <input type="date" className="input mt-1 w-full" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            </label>
          </div>
          {record && (
            <>
              <label className="block text-xs text-gray-500">狀態
                <select className="input mt-1 w-full" value={form.status} onChange={(e) => set('status', e.target.value)}>
                  <option value="PENDING">待繳</option>
                  <option value="OVERDUE">逾期</option>
                  <option value="PARTIAL">部分繳納</option>
                  <option value="PAID">已繳清</option>
                </select>
              </label>
              {paid && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs text-gray-500">實收金額
                    <input type="number" className="input mt-1 w-full" value={form.paidAmount} placeholder={String(form.amount)} onChange={(e) => set('paidAmount', e.target.value)} />
                  </label>
                  <label className="block text-xs text-gray-500">收款日
                    <input type="date" className="input mt-1 w-full" value={form.paidDate} onChange={(e) => set('paidDate', e.target.value)} />
                  </label>
                </div>
              )}
              {paid && (
                <label className="block text-xs text-gray-500">付款方式
                  <input className="input mt-1 w-full" value={form.paymentMethod} placeholder="現金、轉帳…" onChange={(e) => set('paymentMethod', e.target.value)} />
                </label>
              )}
            </>
          )}
          <label className="block text-xs text-gray-500">備註
            <input className="input mt-1 w-full" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </label>
          {error && <div className="text-xs text-red-500">{error}</div>}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 text-sm border border-gray-200 rounded-xl py-2">取消</button>
          <button
            onClick={submit}
            disabled={saving || (!record && !form.contractId)}
            className="flex-1 text-sm bg-brand text-white rounded-xl py-2 font-medium disabled:opacity-50"
          >
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}
