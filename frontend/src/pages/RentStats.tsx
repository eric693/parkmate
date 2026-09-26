import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import api from '../api/client';
import HowTo from '../components/HowTo';
import { FEATURES } from '../lib/features';
import SearchBox, { matches } from '../components/SearchBox';

interface MonthRow {
  month: number;
  rentDue: number;
  rentCollected: number;
  unpaidCount: number;
  electricityBill: number;
  electricityExpense: number;
  prepaidUsage: number;
  prepaidKwh: number;
  prepaidTopup: number;
}

interface UnitRow {
  unitId: string;
  propertyName: string;
  unitNumber: string;
  rentDue: number;
  rentCollected: number;
  unpaidCount: number;
  electricityAllocated: number;
  prepaidUsage: number;
  prepaidKwh: number;
}

interface Stats {
  year: number;
  summary: {
    rentDue: number;
    rentCollected: number;
    rentDueToDate: number;
    rentOutstanding: number;
    collectionRate: number;
    unpaidCount: number;
    electricityBill: number;
    electricityExpense: number;
    prepaidUsage: number;
    prepaidKwh: number;
    prepaidTopup: number;
  };
  months: MonthRow[];
  units: UnitRow[];
}

const money = (v: number) => `NT$${Math.round(v).toLocaleString()}`;

export default function RentStats() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'rent' | 'electricity'>('rent');
  const [search, setSearch] = useState('');
  const [property, setProperty] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get(`/stats/rent-electricity?year=${year}`)
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [year]);

  const s = data?.summary;
  const propertyNames = [...new Set((data?.units ?? []).map((u) => u.propertyName))];
  const units = (data?.units ?? []).filter((u) => (!property || u.propertyName === property) && matches(search, u.propertyName, u.unitNumber));
  const chartData = (data?.months ?? []).map((m) => ({ ...m, label: `${m.month}月` }));

  return (
    <div className="px-6 py-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">月租與收入統計</h1>
          <p className="text-xs text-gray-400 mt-0.5">{year} 年逐月與各車位統計</p>
        </div>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input text-xs py-1.5 px-2 w-20">
          {[thisYear - 2, thisYear - 1, thisYear].map((y) => <option key={y}>{y}</option>)}
        </select>
      </div>

      <HowTo module="stats" />

      {loading || !s ? (
        <div className="text-center text-gray-400 py-16 text-sm">載入中...</div>
      ) : (
        <>
          <div className="flex gap-1.5 mb-4 flex-wrap items-center">
            {([['rent', '月租統計'], ['electricity', '電費統計']] as const).filter(([k]) => FEATURES.electricity || k === 'rent').map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === k ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
              >
                {label}
              </button>
            ))}
            <select value={property} onChange={(e) => setProperty(e.target.value)} className="input text-xs py-1.5 px-2 w-32 ml-auto">
              <option value="">全部停車場</option>
              {propertyNames.map((n) => <option key={n}>{n}</option>)}
            </select>
            <SearchBox value={search} onChange={setSearch} placeholder="搜尋車位編號（各車位表）" />
          </div>

          {tab === 'rent' ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <Tile label="全年應收" value={money(s.rentDue)} />
                <Tile label="全年已收" value={money(s.rentCollected)} tone="text-brand" />
                <Tile label="已到期未收" value={money(s.rentOutstanding)} tone={s.rentOutstanding > 0 ? 'text-red-500' : undefined} sub="不含還沒到期的月份" />
                <Tile label="收款率" value={`${s.collectionRate}%`} sub={`未繳 ${s.unpaidCount} 筆`} />
              </div>

              <Card title="每月應收 vs 已收">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => v.toLocaleString()} />
                    <Tooltip formatter={(v: number) => money(v)} cursor={{ fill: '#f9fafb' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="rentDue" name="應收" fill="#d1d5db" radius={[4, 4, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="rentCollected" name="已收" fill="#4a6741" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card title="逐月明細">
                <Table
                  head={['月份', '應收', '已收', '未收', '已到期未繳']}
                  rows={data!.months.map((m) => [
                    `${m.month} 月`, money(m.rentDue), money(m.rentCollected),
                    money(Math.max(m.rentDue - m.rentCollected, 0)), `${m.unpaidCount}`,
                  ])}
                />
              </Card>

              <Card title="各車位月租">
                <Table
                  head={['停車場', '車位編號', '應收', '已收', '未收', '已到期未繳']}
                  rows={units.map((u) => [
                    u.propertyName, u.unitNumber, money(u.rentDue), money(u.rentCollected),
                    money(Math.max(u.rentDue - u.rentCollected, 0)), `${u.unpaidCount}`,
                  ])}
                />
              </Card>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <Tile label="台電總單" value={money(s.electricityBill)} sub="水電帳單模組" />
                <Tile label="預付電表扣款" value={money(s.prepaidUsage)} sub={`${Math.round(s.prepaidKwh).toLocaleString()} 度`} />
                <Tile label="預付電表儲值" value={money(s.prepaidTopup)} />
                <Tile label="支出記錄電費" value={money(s.electricityExpense)} sub="支出記錄模組" />
              </div>

              <Card title="每月電費">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => v.toLocaleString()} />
                    <Tooltip formatter={(v: number) => money(v)} cursor={{ fill: '#f9fafb' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="electricityBill" name="台電總單" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="prepaidUsage" name="預付電表扣款" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card title="逐月明細">
                <Table
                  head={['月份', '台電總單', '預付扣款', '預付度數', '預付儲值', '支出記錄電費']}
                  rows={data!.months.map((m) => [
                    `${m.month} 月`, money(m.electricityBill), money(m.prepaidUsage),
                    `${Math.round(m.prepaidKwh).toLocaleString()} 度`, money(m.prepaidTopup), money(m.electricityExpense),
                  ])}
                />
              </Card>

              <Card title="各車位電費">
                <Table
                  head={['停車場', '車位編號', '分攤電費', '預付扣款', '預付度數', '合計']}
                  rows={units.map((u) => [
                    u.propertyName, u.unitNumber, money(u.electricityAllocated), money(u.prepaidUsage),
                    `${Math.round(u.prepaidKwh).toLocaleString()} 度`, money(u.electricityAllocated + u.prepaidUsage),
                  ])}
                />
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-lg font-bold ${tone ?? 'text-gray-800'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
      <div className="text-sm font-semibold text-gray-700 mb-3">{title}</div>
      {children}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  if (rows.length === 0) return <div className="text-center text-gray-400 text-sm py-6">尚無資料</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 border-b border-gray-100">
            {head.map((h, i) => <th key={h} className={`py-2 font-medium ${i < 2 && head[1] === '車位編號' ? 'text-left' : i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-gray-50 last:border-0">
              {r.map((c, ci) => (
                <td key={ci} className={`py-2 whitespace-nowrap ${ci < 2 && head[1] === '車位編號' ? 'text-left text-gray-700' : ci === 0 ? 'text-left text-gray-700' : 'text-right text-gray-600'}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
