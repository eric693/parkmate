import { useEffect, useState } from 'react';
import { Plus, Droplets, Zap, Flame, Building2, Split, Send, X } from 'lucide-react';
import api from '../api/client';
import { Expense, Property } from '../types';
import HowTo from '../components/HowTo';
import SearchBox, { matches } from '../components/SearchBox';

interface Allocation { unitId: string; unitNumber: string; amount: number; basis: number | null }
interface UtilityBill {
  id: string;
  category: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  method: string;
  note?: string | null;
  property?: { name: string };
  allocations: Array<{ id: string; amount: number; basis: number | null; billed: boolean; unit: { unitNumber: string } }>;
}
const METHOD_LABEL: Record<string, string> = { EVEN: '平均', AREA: '坪數', HEADCOUNT: '人頭', USAGE: '用量' };

const UTILITY_LABELS: Record<string, string> = { WATER: '水費', ELECTRICITY: '電費', GAS: '瓦斯費' };
const UTILITY_COLORS: Record<string, string> = { WATER: '#60a5fa', ELECTRICITY: '#f59e0b', GAS: '#f97316' };
const UTILITY_ICONS: Record<string, React.ReactNode> = {
  WATER: <Droplets className="w-3.5 h-3.5" />,
  ELECTRICITY: <Zap className="w-3.5 h-3.5" />,
  GAS: <Flame className="w-3.5 h-3.5" />,
};

export default function UtilityBills() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingBill, setEditingBill] = useState<UtilityBill | null>(null);
  const [category, setCategory] = useState('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => { fetchData(); }, [year, month]);

  async function fetchData() {
    setLoading(true);
    const [r, p, b] = await Promise.all([
      api.get(`/expenses?year=${year}&month=${month}`),
      api.get('/properties'),
      api.get('/utility-bills'),
    ]);
    setExpenses(r.data.filter((e: Expense) => ['WATER', 'ELECTRICITY', 'GAS'].includes(e.category)));
    setProperties(p.data);
    setBills(b.data);
    setLoading(false);
  }

  async function billToTenants(id: string) {
    const r = await api.post(`/utility-bills/${id}/bill`);
    alert(`已透過 LINE 通知 ${r.data.notified} / ${r.data.total} 位車主`);
    fetchData();
  }

  async function deleteBill(b: UtilityBill) {
    if (!confirm(`確定刪除這張${UTILITY_LABELS[b.category]}分攤帳單（含各房分攤明細）？`)) return;
    await api.delete(`/utility-bills/${b.id}`);
    fetchData();
  }

  async function deleteExpense(id: string) {
    if (!confirm('確定刪除此帳單？')) return;
    await api.delete(`/expenses/${id}`);
    fetchData();
  }

  const shownExpenses = expenses.filter((e) =>
    (category === 'ALL' || e.category === category)
    && matches(search, e.description, e.property?.name, e.unit?.unitNumber, UTILITY_LABELS[e.category], e.amount));
  const shownBills = bills.filter((b) =>
    (category === 'ALL' || b.category === category)
    && matches(search, b.property?.name, b.note, UTILITY_LABELS[b.category], ...b.allocations.map((a) => a.unit.unitNumber)));

  const totalByCategory: Record<string, number> = {};
  for (const e of expenses) {
    totalByCategory[e.category] = (totalByCategory[e.category] ?? 0) + Number(e.amount);
  }

  const allUnits = properties.flatMap((p) =>
    p.units.map((u) => ({ ...u, propertyName: p.name, propertyId: p.id }))
  );

  return (
    <div className="px-6 py-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">水電帳單</h1>
          <p className="text-xs text-gray-400 mt-0.5">{year} 年 {month} 月公用費用管理</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input text-xs py-1.5 px-2 w-20">
            {[now.getFullYear() - 1, now.getFullYear()].map((y) => <option key={y}>{y}</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input text-xs py-1.5 px-2 w-16">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m} 月</option>)}
          </select>
          <button onClick={() => setShowSplit(true)} className="btn-secondary text-sm flex items-center gap-1">
            <Split className="w-4 h-4" />費用分攤
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm flex items-center gap-1">
            <Plus className="w-4 h-4" />新增帳單
          </button>
        </div>
      </div>

      <HowTo module="utilities" />

      {/* Category summary */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {['WATER', 'ELECTRICITY', 'GAS'].map((cat) => (
          <div key={cat} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color: UTILITY_COLORS[cat] }}>{UTILITY_ICONS[cat]}</span>
              <span className="text-xs text-gray-500">{UTILITY_LABELS[cat]}</span>
            </div>
            <div className="text-lg font-bold text-gray-800">NT${(totalByCategory[cat] ?? 0).toLocaleString()}</div>
            <div className="text-xs text-gray-400">{expenses.filter((e) => e.category === cat).length} 筆</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100">
          {['ALL', 'ELECTRICITY', 'WATER', 'GAS'].map((k) => (
            <button
              key={k}
              onClick={() => setCategory(k)}
              className={`px-3 py-1 rounded-lg text-xs font-medium ${category === k ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {k === 'ALL' ? '全部' : UTILITY_LABELS[k]}
            </button>
          ))}
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder="搜尋說明、停車場、車位編號" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">載入中...</div>
      ) : shownExpenses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-12">
          <div className="text-gray-400 text-sm mb-3">{expenses.length > 0 ? '沒有符合篩選條件的帳單' : '本月無水電帳單'}</div>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm flex items-center gap-1 mx-auto">
            <Plus className="w-4 h-4" />新增帳單
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400">
                <th className="text-left px-4 py-3 font-medium">類別</th>
                <th className="text-left px-4 py-3 font-medium">停車場 / 車位</th>
                <th className="text-left px-4 py-3 font-medium">說明</th>
                <th className="text-left px-4 py-3 font-medium">日期</th>
                <th className="text-right px-4 py-3 font-medium">金額</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {shownExpenses.map((e) => (
                <tr key={e.id} className="border-b border-gray-50 hover:bg-warm/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span style={{ color: UTILITY_COLORS[e.category] }}>{UTILITY_ICONS[e.category]}</span>
                      <span className="font-medium text-gray-700">{UTILITY_LABELS[e.category]}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-gray-500 text-xs">
                      <Building2 className="w-3 h-3" />
                      <span>{e.property?.name ?? '—'}</span>
                      {e.unit?.unitNumber && <span className="text-gray-400">/ {e.unit.unitNumber}</span>}
                      {!e.property && !e.unit && <span className="text-gray-300">未指定</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{e.description || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(e.date).toLocaleDateString('zh-TW')}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-700">NT${Number(e.amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setEditingExpense(e)} className="text-xs text-gray-500 hover:text-gray-700 mr-3">編輯</button>
                    <button onClick={() => deleteExpense(e.id)} className="text-xs text-red-400 hover:text-red-600">刪除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 分攤帳單 */}
      {shownBills.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <Split className="w-4 h-4 text-brand" />分攤帳單
          </h2>
          <div className="space-y-3">
            {shownBills.map((b) => (
              <div key={b.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span style={{ color: UTILITY_COLORS[b.category] }}>{UTILITY_ICONS[b.category]}</span>
                    <span className="font-medium text-gray-700">{UTILITY_LABELS[b.category]}</span>
                    <span className="text-xs text-gray-400">{b.property?.name}</span>
                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{METHOD_LABEL[b.method]}分攤</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800">NT${Number(b.totalAmount).toLocaleString()}</span>
                    <button onClick={() => setEditingBill(b)} className="text-xs text-gray-500 hover:text-gray-700">編輯</button>
                    <button onClick={() => deleteBill(b)} className="text-xs text-red-400 hover:text-red-600">刪除</button>
                  </div>
                </div>
                <div className="text-xs text-gray-400 mb-2">
                  {new Date(b.periodStart).toLocaleDateString('zh-TW')} ~ {new Date(b.periodEnd).toLocaleDateString('zh-TW')}
                  {b.note && <span className="ml-2">・{b.note}</span>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
                  {b.allocations.map((a) => (
                    <div key={a.id} className="bg-warm rounded-lg px-2.5 py-1.5 text-xs flex items-center justify-between">
                      <span className="text-gray-600">{a.unit.unitNumber}</span>
                      <span className="font-medium text-gray-800">NT${Number(a.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                {b.allocations.every((a) => a.billed) ? (
                  <span className="text-xs text-green-600">已開帳通知車主</span>
                ) : (
                  <button onClick={() => billToTenants(b.id)} className="btn-secondary text-xs flex items-center gap-1">
                    <Send className="w-3.5 h-3.5" />LINE 開帳給車主
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {editingBill && (
        <EditBillModal
          bill={editingBill}
          onClose={() => setEditingBill(null)}
          onSaved={() => { setEditingBill(null); fetchData(); }}
        />
      )}

      {(showAdd || editingExpense) && (
        <AddUtilityModal
          expense={editingExpense ?? undefined}
          properties={properties}
          allUnits={allUnits}
          onClose={() => { setShowAdd(false); setEditingExpense(null); }}
          onSaved={() => { setShowAdd(false); setEditingExpense(null); fetchData(); }}
        />
      )}

      {showSplit && (
        <SplitModal
          properties={properties}
          onClose={() => setShowSplit(false)}
          onSaved={() => { setShowSplit(false); fetchData(); }}
        />
      )}
    </div>
  );
}

function SplitModal({ properties, onClose, onSaved }: {
  properties: Property[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const [form, setForm] = useState({
    propertyId: properties[0]?.id ?? '',
    category: 'ELECTRICITY',
    periodStart: firstDay,
    periodEnd: lastDay,
    totalAmount: '',
    method: 'EVEN',
  });
  const [usage, setUsage] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Allocation[] | null>(null);
  const [saving, setSaving] = useState(false);

  const property = properties.find((p) => p.id === form.propertyId);
  const occupiedUnits = (property?.units ?? []).filter((u) => u.status === 'OCCUPIED');

  function inputsPayload() {
    return occupiedUnits.map((u) => ({ unitId: u.id, usage: Number(usage[u.id] ?? 0) }));
  }

  async function doPreview() {
    if (!form.totalAmount) return;
    const r = await api.post('/utility-bills/preview', {
      propertyId: form.propertyId,
      totalAmount: Number(form.totalAmount),
      method: form.method,
      inputs: inputsPayload(),
    });
    setPreview(r.data.allocations);
  }

  async function submit() {
    setSaving(true);
    try {
      await api.post('/utility-bills', {
        ...form,
        totalAmount: Number(form.totalAmount),
        inputs: inputsPayload(),
      });
      onSaved();
    } catch (e: any) {
      alert(e.response?.data?.error ?? '建立失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2"><Split className="w-5 h-5 text-brand" />水電費分攤</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium mb-1">停車場</label>
              <select className="input" value={form.propertyId} onChange={(e) => { setForm({ ...form, propertyId: e.target.value }); setPreview(null); }}>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">類別</label>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="ELECTRICITY">電費</option>
                <option value="WATER">水費</option>
                <option value="GAS">瓦斯費</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium mb-1">期間起</label>
              <input type="date" className="input" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">期間迄</label>
              <input type="date" className="input" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium mb-1">總金額</label>
              <input type="number" className="input" value={form.totalAmount} onChange={(e) => { setForm({ ...form, totalAmount: e.target.value }); setPreview(null); }} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">分攤方式</label>
              <select className="input" value={form.method} onChange={(e) => { setForm({ ...form, method: e.target.value }); setPreview(null); }}>
                <option value="EVEN">平均分攤</option>
                <option value="AREA">依坪數</option>
                <option value="HEADCOUNT">依人頭</option>
                <option value="USAGE">依用量</option>
              </select>
            </div>
          </div>

          {form.method === 'USAGE' && (
            <div>
              <label className="block text-sm font-medium mb-1">各房用量</label>
              <div className="space-y-1.5">
                {occupiedUnits.map((u) => (
                  <div key={u.id} className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 w-20">{u.unitNumber}</span>
                    <input type="number" className="input text-sm flex-1" placeholder="度數/用量" value={usage[u.id] ?? ''} onChange={(e) => { setUsage({ ...usage, [u.id]: e.target.value }); setPreview(null); }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={doPreview} className="btn-secondary text-sm w-full">試算分攤</button>

          {preview && (
            <div className="bg-warm rounded-xl p-3">
              <div className="text-xs font-medium text-gray-600 mb-2">分攤結果（{occupiedUnits.length} 間在住）</div>
              {preview.length === 0 ? (
                <div className="text-xs text-gray-400">此停車場目前無在住車位。</div>
              ) : (
                <div className="space-y-1">
                  {preview.map((a) => (
                    <div key={a.unitId} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{a.unitNumber}{a.basis != null ? `（${a.basis}）` : ''}</span>
                      <span className="font-medium text-gray-800">NT${a.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
            <button type="button" onClick={submit} disabled={saving || !form.totalAmount} className="btn-primary flex-1 disabled:opacity-50">{saving ? '建立中...' : '建立分攤帳單'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddUtilityModal({ expense, properties, allUnits, onClose, onSaved }: {
  expense?: Expense;
  properties: Property[];
  allUnits: Array<{ id: string; unitNumber: string; propertyName: string; propertyId: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const now = new Date();
  const [form, setForm] = useState({
    category: (expense?.category ?? 'ELECTRICITY') as string,
    amount: expense ? String(expense.amount) : '',
    date: expense ? String(expense.date).split('T')[0] : now.toISOString().split('T')[0],
    description: expense?.description ?? '',
    propertyId: expense ? expense.propertyId ?? '' : properties[0]?.id ?? '',
    unitId: expense?.unitId ?? '',
  });

  const unitsForProperty = allUnits.filter((u) => u.propertyId === form.propertyId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      category: form.category,
      amount: form.amount,
      date: form.date,
      description: form.description,
      propertyId: form.propertyId || (expense ? '' : undefined),
      unitId: form.unitId || (expense ? '' : undefined),
    };
    if (expense) await api.put(`/expenses/${expense.id}`, body);
    else await api.post('/expenses', body);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl">
        <h3 className="font-bold text-lg mb-4">{expense ? '編輯水電帳單' : '新增水電帳單'}</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">類別</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
              <option value="ELECTRICITY">電費</option>
              <option value="WATER">水費</option>
              <option value="GAS">瓦斯費</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">停車場</label>
            <select
              value={form.propertyId}
              onChange={(e) => setForm({ ...form, propertyId: e.target.value, unitId: '' })}
              className="input"
              required
            >
              {properties.length === 0 && <option value="">請先建立停車場</option>}
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {form.propertyId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">車位（選填，公共區域可不填）</label>
              <select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} className="input">
                <option value="">公共區域</option>
                {unitsForProperty.map((u) => <option key={u.id} value={u.id}>{u.unitNumber}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">金額 <span className="text-red-400">*</span></label>
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" required placeholder="NT$" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">日期 <span className="text-red-400">*</span></label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">說明</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" placeholder="例：5月份電費、共用區域水費..." />
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

function EditBillModal({ bill, onClose, onSaved }: { bill: UtilityBill; onClose: () => void; onSaved: () => void }) {
  const day = (v: string) => String(v).split('T')[0];
  const [periodStart, setPeriodStart] = useState(day(bill.periodStart));
  const [periodEnd, setPeriodEnd] = useState(day(bill.periodEnd));
  const [note, setNote] = useState(bill.note ?? '');
  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(bill.allocations.map((a) => [a.id, String(a.amount)])),
  );
  const [saving, setSaving] = useState(false);
  const total = Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0);

  async function submit() {
    setSaving(true);
    await api.put(`/utility-bills/${bill.id}`, {
      periodStart, periodEnd, note,
      allocations: Object.entries(amounts).map(([id, amount]) => ({ id, amount: Number(amount) || 0 })),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="font-bold text-lg mb-4">編輯{UTILITY_LABELS[bill.category]}分攤帳單</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-gray-500">計費期起
              <input type="date" className="input mt-1" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </label>
            <label className="block text-xs text-gray-500">計費期迄
              <input type="date" className="input mt-1" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </label>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">各房分攤金額</div>
            <div className="grid grid-cols-2 gap-2">
              {bill.allocations.map((a) => (
                <label key={a.id} className="flex items-center gap-2 bg-warm rounded-lg px-2.5 py-1.5 text-xs">
                  <span className="text-gray-600 w-12 shrink-0">{a.unit.unitNumber}</span>
                  <input
                    type="number"
                    className="input py-1 text-xs"
                    value={amounts[a.id]}
                    onChange={(e) => setAmounts({ ...amounts, [a.id]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <div className="text-xs text-gray-500 mt-2">總額：NT${total.toLocaleString()}（依各房加總）</div>
          </div>
          <label className="block text-xs text-gray-500">備註
            <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <div className="flex gap-2 pt-4">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
          <button onClick={submit} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">{saving ? '儲存中…' : '儲存'}</button>
        </div>
      </div>
    </div>
  );
}
