import { useEffect, useState } from 'react';
import api from '../api/client';
import { Expense, Property } from '../types';
import HowTo from '../components/HowTo';
import { AttachmentButton } from '../components/AttachmentModal';
import { useAttachmentSummary } from '../lib/attachments';
import SearchBox, { matches } from '../components/SearchBox';

const EXPENSE_LABELS: Record<string, string> = {
  MANAGEMENT: '管理費', REPAIR: '維修費', OTHER: '其他', INSURANCE: '保險', INTERNET: '網路',
};
const EXPENSE_COLORS: Record<string, string> = {
  MANAGEMENT: '#4a6741', REPAIR: '#8b5cf6', OTHER: '#9ca3af', INSURANCE: '#ec4899', INTERNET: '#14b8a6',
};
const NON_UTILITY = ['MANAGEMENT', 'REPAIR', 'OTHER', 'INSURANCE', 'INTERNET'];

export default function ExpenseRecords() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);
  const files = useAttachmentSummary('EXPENSE');
  const [category, setCategory] = useState('ALL');
  const [search, setSearch] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);

  useEffect(() => { fetchData(); }, [year, month]);
  useEffect(() => { api.get('/properties').then((r) => setProperties(r.data)); }, []);

  async function fetchData() {
    setLoading(true);
    const r = await api.get(`/expenses?year=${year}&month=${month}`);
    setExpenses(r.data.filter((e: Expense) => NON_UTILITY.includes(e.category)));
    setLoading(false);
  }

  async function deleteExpense(id: string) {
    if (!confirm('確定刪除此支出？')) return;
    await api.delete(`/expenses/${id}`);
    fetchData();
  }

  const shown = expenses.filter((e) =>
    (category === 'ALL' || e.category === category)
    && matches(search, e.description, EXPENSE_LABELS[e.category], e.property?.name, e.unit?.unitNumber, e.amount));
  const total = shown.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="px-6 py-6 max-w-4xl">
      <div className="page-header items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">支出記錄</h1>
          <p className="text-xs text-gray-400 mt-0.5">{year} 年 {month} 月管理費、維修費等支出</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input text-xs py-1.5 px-2 w-20">
            {[now.getFullYear() - 1, now.getFullYear()].map((y) => <option key={y}>{y}</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input text-xs py-1.5 px-2 w-16">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m} 月</option>)}
          </select>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">+ 新增支出</button>
        </div>
      </div>

      <HowTo module="expenses" />

      {/* Total */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-5 flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400 mb-1">本月支出合計{(category !== 'ALL' || search) && '（篩選後）'}</div>
          <div className="text-2xl font-bold text-gray-800">NT${total.toLocaleString()}</div>
        </div>
        <div className="text-xs text-gray-400">{shown.length} 筆支出</div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100 flex-wrap">
          {['ALL', ...NON_UTILITY].map((k) => (
            <button
              key={k}
              onClick={() => setCategory(k)}
              className={`px-3 py-1 rounded-lg text-xs font-medium ${category === k ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {k === 'ALL' ? '全部' : EXPENSE_LABELS[k]}
            </button>
          ))}
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder="搜尋說明、停車場、車位編號" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">載入中...</div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-12">
          <div className="text-gray-400 text-sm mb-3">{expenses.length > 0 ? '沒有符合篩選條件的支出' : '本月無支出紀錄'}</div>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">+ 新增支出</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400">
                <th className="text-left px-4 py-3 font-medium">類別</th>
                <th className="text-left px-4 py-3 font-medium">停車場／車位</th>
                <th className="text-left px-4 py-3 font-medium">說明</th>
                <th className="text-left px-4 py-3 font-medium">日期</th>
                <th className="text-right px-4 py-3 font-medium">金額</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className="border-b border-gray-50 hover:bg-warm/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: EXPENSE_COLORS[e.category] ?? '#9ca3af' }} />
                      <span className="font-medium text-gray-700">{EXPENSE_LABELS[e.category] ?? e.category}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{e.property?.name ?? '—'}{e.unit?.unitNumber ? ` ${e.unit.unitNumber}` : ''}</td>
                  <td className="px-4 py-3 text-gray-500">{e.description || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(e.date).toLocaleDateString('zh-TW')}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-700">NT${Number(e.amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <AttachmentButton
                      compact
                      entityType="EXPENSE"
                      entityId={e.id}
                      title={`支出 ${EXPENSE_LABELS[e.category] ?? e.category}・NT$${Number(e.amount).toLocaleString()}・${new Date(e.date).toLocaleDateString('zh-TW')}（發票、收據，報稅用）`}
                      count={files.summary[e.id]?.count}
                      onChanged={files.refresh}
                    />
                    <button onClick={() => setEditing(e)} className="text-xs text-gray-500 hover:text-gray-700 mx-3">編輯</button>
                    <button onClick={() => deleteExpense(e.id)} className="text-xs text-red-400 hover:text-red-600">刪除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(showAdd || editing) && (
        <AddExpenseModal
          expense={editing ?? undefined}
          properties={properties}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={() => { setShowAdd(false); setEditing(null); fetchData(); }}
        />
      )}
    </div>
  );
}

function AddExpenseModal({ expense, properties, onClose, onSaved }: {
  expense?: Expense; properties: Property[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    propertyId: expense?.propertyId ?? properties[0]?.id ?? '',
    category: (expense?.category ?? 'MANAGEMENT') as string,
    amount: expense ? String(expense.amount) : '',
    date: expense ? String(expense.date).split('T')[0] : new Date().toISOString().split('T')[0],
    description: expense?.description ?? '',
  });
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (expense) await api.put(`/expenses/${expense.id}`, form);
    else await api.post('/expenses', form);
    onSaved();
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl">
        <h3 className="font-bold text-lg mb-4">{expense ? '編輯支出' : '新增支出'}</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">停車場</label>
            <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} className="input" required>
              {properties.length === 0 && <option value="">請先到「車位」建立停車場</option>}
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">類別</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
              <option value="MANAGEMENT">管理費</option>
              <option value="REPAIR">維修費</option>
              <option value="INSURANCE">保險</option>
              <option value="INTERNET">網路</option>
              <option value="OTHER">其他</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">金額</label>
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">日期</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">說明</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" placeholder="選填" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
            <button type="submit" className="btn-primary flex-1">{expense ? '儲存' : '新增'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
