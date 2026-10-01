import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Zap, CalendarClock } from 'lucide-react';
import api from '../api/client';
import HowTo from '../components/HowTo';
import { FEATURES } from '../lib/features';
import SearchBox, { matches } from '../components/SearchBox';
import RentRecordForm, { RentRecordLike } from '../components/RentRecordForm';
import PrepaidRecordForm, { PrepaidRecordLike } from '../components/PrepaidRecordForm';

interface Room {
  unitId: string;
  propertyName: string;
  unitNumber: string;
  contractId: string | null;
  tenantName: string | null;
  tenantPhone: string | null;
  monthlyRent: number;
  rentDueDay: number | null;
  nextDueDate: string | null;
  unpaidCount: number;
  unpaidAmount: number;
  prepaidEnabled: boolean;
  prepaidBalance: number | null;
  prepaidDaysLeft: number | null;
  prepaidDepletionDate: string | null;
  prepaidLow: boolean;
}

type Kind = 'RENT' | 'ELEC_TOPUP' | 'ELEC_USAGE' | 'ELEC_ADJUST' | 'ELEC_BILL';

interface Entry {
  id: string;
  unitId: string;
  propertyName: string;
  unitNumber: string;
  kind: Kind;
  date: string;
  title: string;
  amount: number;
  paidAmount?: number;
  kwh?: number | null;
  balanceAfter?: number;
  status?: string;
  note?: string | null;
  year?: number;
  month?: number;
  dueDate?: string;
  paidDate?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
}

const KIND_LABEL: Record<Kind, string> = {
  RENT: '月租', ELEC_TOPUP: '電費儲值', ELEC_USAGE: '用電扣款', ELEC_ADJUST: '電費調整', ELEC_BILL: '電費分攤',
};
const RENT_STATUS: Record<string, [string, string]> = {
  PAID: ['已繳', 'badge-paid'], PENDING: ['待繳', 'badge-pending'], PARTIAL: ['部分', 'badge-pending'], OVERDUE: ['逾期', 'badge-overdue'],
  BILLED: ['已開帳', 'badge-paid'], UNBILLED: ['未開帳', 'badge-pending'],
};
const PREPAID_TYPE = { ELEC_TOPUP: 'TOPUP', ELEC_USAGE: 'USAGE', ELEC_ADJUST: 'ADJUST' } as const;

const fmtDate = (v: string) => new Date(v).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

export default function DormRecords() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState<number | ''>('');
  const [unitId, setUnitId] = useState('');
  const [type, setType] = useState<'ALL' | 'RENT' | 'ELEC' | 'UNPAID'>('ALL');
  const [search, setSearch] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [rentForm, setRentForm] = useState<{ record?: RentRecordLike; contractId?: string } | null>(null);
  const [elecForm, setElecForm] = useState<{ record?: PrepaidRecordLike; unitId?: string; label?: string } | null>(null);

  function load() {
    setLoading(true);
    const q = new URLSearchParams({ year: String(year) });
    if (month) q.set('month', String(month));
    if (unitId) q.set('unitId', unitId);
    api.get(`/dorm-records?${q}`).then((r) => {
      setRooms(r.data.rooms);
      setEntries(r.data.entries);
      if (!unitId) setAllRooms(r.data.rooms);
    }).finally(() => setLoading(false));
  }
  useEffect(load, [year, month, unitId]);

  const filtered = useMemo(() => entries.filter((e) => {
    if (type === 'RENT' && e.kind !== 'RENT') return false;
    if (type === 'ELEC' && e.kind === 'RENT') return false;
    if (type === 'UNPAID' && !(e.kind === 'RENT' && e.status !== 'PAID')) return false;
    return matches(search, e.propertyName, e.unitNumber, e.title, e.note, KIND_LABEL[e.kind]);
  }), [entries, type, search]);

  const shownRooms = rooms.filter((r) => matches(search, r.propertyName, r.unitNumber, r.tenantName, r.tenantPhone));
  const contractOptions = allRooms
    .filter((r) => r.contractId)
    .map((r) => ({ id: r.contractId!, label: `${r.propertyName} ${r.unitNumber}・${r.tenantName}`, monthlyRent: r.monthlyRent }));

  const rentDue = filtered.filter((e) => e.kind === 'RENT').reduce((s, e) => s + e.amount, 0);
  const rentPaid = filtered.filter((e) => e.kind === 'RENT').reduce((s, e) => s + (e.paidAmount ?? 0), 0);
  const elecSpend = filtered.filter((e) => e.kind === 'ELEC_USAGE' || e.kind === 'ELEC_BILL').reduce((s, e) => s + e.amount, 0);

  async function remove(e: Entry) {
    if (e.kind === 'RENT') {
      if (!confirm(`確定刪除「${e.propertyName} ${e.unitNumber} ${e.title}」？已對帳的入帳會改回未對帳。`)) return;
      await api.delete(`/rent-records/${e.id}`);
    } else {
      if (!confirm(`確定刪除這筆${KIND_LABEL[e.kind]}？之後的餘額會自動重算。`)) return;
      await api.delete(`/prepaid-records/${e.id}`);
    }
    load();
  }

  function edit(e: Entry) {
    if (e.kind === 'RENT') {
      setRentForm({
        record: {
          id: e.id, year: e.year!, month: e.month!, amount: e.amount, dueDate: e.dueDate!,
          paidDate: e.paidDate, paidAmount: e.paidAmount || null, status: e.status!,
          paymentMethod: e.paymentMethod, notes: e.notes,
        },
      });
    } else if (e.kind !== 'ELEC_BILL') {
      setElecForm({ record: { id: e.id, type: PREPAID_TYPE[e.kind], amount: e.amount, kwh: e.kwh, note: e.note } });
    }
  }

  return (
    <div className="px-6 py-6 max-w-5xl">
      <div className="page-header items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">月租收費紀錄</h1>
          <p className="text-xs text-gray-400 mt-0.5">每個車位的月租收費紀錄、下次繳費日與未繳金額</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setRentForm({ contractId: rooms.find((r) => r.contractId)?.contractId ?? undefined })}
            disabled={contractOptions.length === 0}
            className="flex items-center gap-1.5 text-xs bg-brand text-white rounded-lg px-3 py-1.5 hover:bg-brand-dark disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> 新增租金單
          </button>
        </div>
      </div>

      <HowTo module="records" />

      {/* 篩選列 */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="input text-xs py-1.5 px-2 w-40">
          <option value="">全部車位</option>
          {allRooms.map((r) => <option key={r.unitId} value={r.unitId}>{r.propertyName} {r.unitNumber}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input text-xs py-1.5 px-2 w-20">
          {[thisYear - 2, thisYear - 1, thisYear].map((y) => <option key={y}>{y}</option>)}
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : '')} className="input text-xs py-1.5 px-2 w-24">
          <option value="">全年</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m} 月</option>)}
        </select>
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100">
          {([['ALL', '全部'], ['RENT', '月租'], ['UNPAID', '未繳月租'], ['ELEC', '電費']] as const).filter(([k]) => FEATURES.electricity || k !== 'ELEC').map(([k, l]) => (
            <button
              key={k}
              onClick={() => setType(k)}
              className={`px-3 py-1 rounded-lg text-xs font-medium ${type === k ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {l}
            </button>
          ))}
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder="搜尋車位編號、車主、備註" />
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-16 text-sm">載入中...</div>
      ) : (
        <>
          {/* 各車位現況 */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
            {shownRooms.map((r) => (
              <div key={r.unitId} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold text-gray-800 text-sm">{r.propertyName} {r.unitNumber}</div>
                  <span className="text-xs text-gray-400">{r.tenantName ?? '空位'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1">
                  <CalendarClock className="w-3.5 h-3.5 text-blue-500" />
                  {r.nextDueDate ? <>下次繳租 {r.nextDueDate}（每月 {r.rentDueDay} 號）NT${r.monthlyRent.toLocaleString()}</> : '無生效合約'}
                </div>
                {r.unpaidCount > 0 && (
                  <div className="text-xs text-red-500 mb-1">未繳 {r.unpaidCount} 筆，共 NT${r.unpaidAmount.toLocaleString()}</div>
                )}
                {FEATURES.electricity && <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Zap className={`w-3.5 h-3.5 ${r.prepaidLow ? 'text-red-500' : 'text-orange-400'}`} />
                  {r.prepaidEnabled ? (
                    <span className={r.prepaidLow ? 'text-red-500 font-medium' : ''}>
                      電費餘額 NT${(r.prepaidBalance ?? 0).toLocaleString()}
                      {r.prepaidDepletionDate ? `・預估 ${r.prepaidDepletionDate} 用完` : '・資料不足無法預估'}
                    </span>
                  ) : (
                    <span className="text-gray-400">未啟用預付電表</span>
                  )}
                </div>}
                <div className="flex gap-2 mt-3">
                  {r.contractId && (
                    <button
                      onClick={() => setRentForm({ contractId: r.contractId! })}
                      className="flex-1 text-xs border border-gray-200 rounded-lg py-1 hover:bg-gray-50"
                    >
                      + 租金單
                    </button>
                  )}
                  {FEATURES.electricity && r.prepaidEnabled && (
                    <button
                      onClick={() => setElecForm({ unitId: r.unitId, label: `${r.propertyName} ${r.unitNumber}` })}
                      className="flex-1 text-xs border border-gray-200 rounded-lg py-1 hover:bg-gray-50"
                    >
                      + 電費紀錄
                    </button>
                  )}
                </div>
              </div>
            ))}
            {shownRooms.length === 0 && <div className="text-sm text-gray-400">沒有符合的車位</div>}
          </div>

          {/* 小計 */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-3">
              <div className="text-xs text-gray-400">月租應收</div>
              <div className="font-bold text-gray-800">NT${rentDue.toLocaleString()}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-3">
              <div className="text-xs text-gray-400">月租已收</div>
              <div className="font-bold text-brand">NT${rentPaid.toLocaleString()}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-3">
              {FEATURES.electricity ? (<>
                <div className="text-xs text-gray-400">電費支出（用電＋分攤）</div>
                <div className="font-bold text-gray-800">NT${elecSpend.toLocaleString()}</div>
              </>) : (<>
                <div className="text-xs text-gray-400">已到期未繳</div>
                <div className="font-bold text-red-500">NT${shownRooms.reduce((s, r) => s + r.unpaidAmount, 0).toLocaleString()}</div>
              </>)}
            </div>
          </div>

          {/* 流水 */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-2 text-left font-medium">日期</th>
                  <th className="px-2 py-2 text-left font-medium">車位</th>
                  <th className="px-2 py-2 text-left font-medium">項目</th>
                  <th className="px-2 py-2 text-right font-medium">金額</th>
                  <th className="px-2 py-2 text-right font-medium">狀態／餘額</th>
                  <th className="px-4 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const [label, cls] = RENT_STATUS[e.status ?? ''] ?? ['', ''];
                  return (
                    <tr key={`${e.kind}-${e.id}`} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2 whitespace-nowrap text-gray-600">{fmtDate(e.date)}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-gray-700">{e.propertyName} {e.unitNumber}</td>
                      <td className="px-2 py-2 text-gray-700">
                        <div className="flex items-center gap-1.5">
                          {e.kind === 'RENT' ? <CalendarClock className="w-3.5 h-3.5 text-blue-500 shrink-0" /> : <Zap className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
                          <span>{e.title}</span>
                        </div>
                        {(e.note || e.kwh) && (
                          <div className="text-xs text-gray-400">{[e.kwh ? `${e.kwh} 度` : null, e.note].filter(Boolean).join('・')}</div>
                        )}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-right text-gray-800">
                        {e.kind === 'ELEC_USAGE' ? '−' : e.kind === 'ELEC_TOPUP' ? '+' : ''}NT${e.amount.toLocaleString()}
                        {e.kind === 'RENT' && e.status !== 'PAID' && (e.paidAmount ?? 0) > 0 && (
                          <div className="text-xs text-gray-400">已收 {e.paidAmount!.toLocaleString()}</div>
                        )}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-right">
                        {label ? <span className={cls}>{label}</span> : e.balanceAfter != null ? <span className="text-xs text-gray-500">餘額 {e.balanceAfter.toLocaleString()}</span> : null}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-right">
                        {e.kind === 'ELEC_BILL' ? (
                          <Link to="/finance/utilities" className="text-xs text-brand">到水電帳單編輯</Link>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <button onClick={() => edit(e)} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="編輯">
                              <Pencil className="w-3.5 h-3.5 text-gray-500" />
                            </button>
                            <button onClick={() => remove(e)} className="p-1.5 rounded-lg hover:bg-red-50" aria-label="刪除">
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-gray-400 py-10">{search ? `找不到「${search}」的紀錄` : '這段期間沒有紀錄'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rentForm && (
        <RentRecordForm
          record={rentForm.record}
          contracts={contractOptions}
          defaultContractId={rentForm.contractId}
          onClose={() => setRentForm(null)}
          onSaved={() => { setRentForm(null); load(); window.dispatchEvent(new Event('rentbell:refresh')); }}
        />
      )}
      {elecForm && (
        <PrepaidRecordForm
          record={elecForm.record}
          unitId={elecForm.unitId}
          unitLabel={elecForm.label}
          onClose={() => setElecForm(null)}
          onSaved={() => { setElecForm(null); load(); window.dispatchEvent(new Event('rentbell:refresh')); }}
        />
      )}
    </div>
  );
}
