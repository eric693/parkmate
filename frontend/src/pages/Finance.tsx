import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { AlertTriangle, FileSpreadsheet } from 'lucide-react';
import api from '../api/client';
import HowTo from '../components/HowTo';

interface FinanceOverview {
  year: number;
  month: number;
  current: {
    total: number;
    collected: number;
    pending: number;
    overdue: number;
    overdueCount: number;
    utility: number;
    utilityCount: number;
    expenses: number;
    expenseCount: number;
    rate: number;
  };
  previous: {
    total: number;
    collected: number;
    pending: number;
    overdue: number;
    utility: number;
    rate: number;
  };
  mom: { collected: number; pending: number; utility: number };
  trend: Array<{ month: string; collected: number; total: number; utility: number; rate: number }>;
  expenseBreakdown: Array<{ category: string; label: string; amount: number; pct: number }>;
}

const CATEGORY_COLORS: Record<string, string> = {
  WATER: '#60a5fa',
  ELECTRICITY: '#f59e0b',
  GAS: '#f97316',
  MANAGEMENT: '#4a6741',
  REPAIR: '#8b5cf6',
  OTHER: '#9ca3af',
  INSURANCE: '#ec4899',
  INTERNET: '#14b8a6',
};

export default function Finance() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const navigate = useNavigate();

  async function downloadTaxReport(exportYear: number) {
    setExporting(true);
    try {
      const res = await api.get(`/tax-export?year=${exportYear}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ParkMate_${exportYear}_租賃所得申報表.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    api.get(`/finance-overview?year=${year}&month=${month}`)
      .then((r) => { setData(r.data); setLoading(false); });
  }, [year, month]);

  const fmt = (n: number) => `NT$${n.toLocaleString()}`;
  const momArrow = (pct: number) => {
    if (pct === 0) return null;
    return pct > 0
      ? <span className="text-green-500 text-xs font-medium">+{pct}%</span>
      : <span className="text-red-400 text-xs font-medium">{pct}%</span>;
  };

  return (
    <div className="px-6 py-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">財務總覽</h1>
          <p className="text-xs text-gray-400 mt-0.5">{year} 年 {month} 月的收支彙整與趨勢分析</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={() => downloadTaxReport(year)}
            disabled={exporting}
            className="flex items-center gap-1.5 text-xs border border-brand text-brand rounded-lg px-3 py-1.5 hover:bg-brand/5 transition-colors disabled:opacity-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {exporting ? '產生中…' : `匯出 ${year} 年報稅表`}
          </button>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input text-xs py-1.5 px-2 w-20">
            {[now.getFullYear() - 1, now.getFullYear()].map((y) => <option key={y}>{y}</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input text-xs py-1.5 px-2 w-16">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m} 月</option>)}
          </select>
        </div>
      </div>

      <HowTo module="finance" />

      {loading || !data ? (
        <div className="flex items-center justify-center h-64 text-gray-400">載入中...</div>
      ) : (
        <>
          {/* 6 KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <KpiCard label="本月應收" value={fmt(data.current.total)} sub={`共 ${data.current.total > 0 ? '數' : '0'} 筆合約`} />
            <KpiCard label="已收金額" value={fmt(data.current.collected)} mom={momArrow(data.mom.collected)} accent="text-brand" />
            <KpiCard label="待收金額" value={fmt(data.current.pending)} mom={momArrow(data.mom.pending)} accent={data.current.pending > 0 ? 'text-amber-500' : ''} />
            <KpiCard label="逾期款項" value={fmt(data.current.overdue)} sub={data.current.overdueCount > 0 ? `${data.current.overdueCount} 筆逾期` : '無逾期'} accent={data.current.overdue > 0 ? 'text-red-500' : ''} />
            <KpiCard label="公用費用" value={fmt(data.current.utility)} mom={momArrow(data.mom.utility)} sub={`${data.current.utilityCount} 筆帳單`} />
            <KpiCard label="收款率" value={`${data.current.rate}%`} sub={`上月 ${data.previous.rate}%`} accent={data.current.rate >= 90 ? 'text-brand' : data.current.rate >= 70 ? 'text-amber-500' : 'text-red-400'} />
          </div>

          {/* Middle 2-column */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
            {/* Left: collection summary mini */}
            <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800">本月收款摘要</h2>
                <button
                  onClick={() => navigate('/finance/workbench')}
                  className="text-xs text-brand hover:underline font-medium"
                >
                  前往收款工作台
                </button>
              </div>
              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-gray-500">收款進度</span>
                  <span className="font-semibold text-brand">{data.current.rate}%</span>
                </div>
                <div className="bg-gray-100 rounded-full h-2.5">
                  <div
                    className="bg-brand rounded-full h-2.5 transition-all"
                    style={{ width: `${Math.min(data.current.rate, 100)}%` }}
                  />
                </div>
              </div>
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-warm rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400 mb-1">應收總額</div>
                  <div className="font-bold text-gray-800 text-sm">{fmt(data.current.total)}</div>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400 mb-1">已收金額</div>
                  <div className="font-bold text-brand text-sm">{fmt(data.current.collected)}</div>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400 mb-1">待收金額</div>
                  <div className="font-bold text-amber-600 text-sm">{fmt(data.current.pending)}</div>
                </div>
              </div>
              {data.current.overdue > 0 && (
                <div className="mt-3 flex items-center gap-2 bg-red-50 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span className="text-sm text-red-600">
                    逾期款項 <strong>{fmt(data.current.overdue)}</strong>，共 {data.current.overdueCount} 筆需要跟進
                  </span>
                </div>
              )}
            </div>

            {/* Right: dark green rent card */}
            <div className="lg:col-span-2 bg-brand rounded-2xl p-5 text-white flex flex-col justify-between">
              <div>
                <div className="text-white/60 text-xs mb-1">{year} 年 {month} 月</div>
                <div className="text-2xl font-bold mb-0.5">{fmt(data.current.collected)}</div>
                <div className="text-white/60 text-sm">已入帳 / {fmt(data.current.total)} 應收</div>
              </div>
              <div className="mt-4 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-white/70 text-sm">上月已收</span>
                  <span className="font-semibold text-sm">{fmt(data.previous.collected)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/70 text-sm">公用費用</span>
                  <span className="font-semibold text-sm">{fmt(data.current.utility)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/70 text-sm">其他支出</span>
                  <span className="font-semibold text-sm">{fmt(data.current.expenses)}</span>
                </div>
                <div className="border-t border-white/20 pt-2 flex justify-between items-center">
                  <span className="text-white/70 text-sm">淨收入估算</span>
                  <span className="font-bold">{fmt(data.current.collected - data.current.utility - data.current.expenses)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom 3-column */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 收款趨勢 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-700 mb-4 text-sm">收款趨勢 (近 6 個月)</h3>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={data.trend} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <Tooltip formatter={(v: number) => `NT$${v.toLocaleString()}`} />
                  <Line type="monotone" dataKey="total" stroke="#e5e7eb" strokeWidth={1.5} dot={false} name="應收" />
                  <Line type="monotone" dataKey="collected" stroke="#4a6741" strokeWidth={2} dot={{ r: 3, fill: '#4a6741' }} name="已收" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <span className="w-3 h-0.5 inline-block rounded bg-brand" />已收
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <span className="w-3 h-0.5 inline-block rounded bg-gray-300" />應收
                </span>
              </div>
            </div>

            {/* 收款率趨勢 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-700 mb-4 text-sm">公用費用趨勢 (近 6 個月)</h3>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={data.trend} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <Tooltip formatter={(v: number) => `NT$${v.toLocaleString()}`} />
                  <Line type="monotone" dataKey="utility" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3, fill: '#60a5fa' }} name="公用費用" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <span className="w-3 h-0.5 inline-block rounded bg-blue-400" />公用費用
                </span>
              </div>
            </div>

            {/* 支出分類 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-700 mb-4 text-sm">支出分類</h3>
              {data.expenseBreakdown.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm">本月無支出紀錄</div>
              ) : (
                <div className="space-y-3">
                  {data.expenseBreakdown.slice(0, 6).map((item) => (
                    <div key={item.category}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 font-medium">{item.label}</span>
                        <span className="text-gray-500">NT${item.amount.toLocaleString()} · {item.pct}%</span>
                      </div>
                      <div className="bg-gray-100 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{
                            width: `${item.pct}%`,
                            backgroundColor: CATEGORY_COLORS[item.category] ?? '#9ca3af',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {data.expenseBreakdown.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between text-xs">
                  <span className="text-gray-400">本月支出合計</span>
                  <span className="font-semibold text-gray-700">
                    NT${data.expenseBreakdown.reduce((s, e) => s + e.amount, 0).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, mom, accent }: {
  label: string;
  value: string;
  sub?: string;
  mom?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="text-xs text-gray-400 mb-2">{label}</div>
      <div className={`text-lg font-bold text-gray-800 ${accent ?? ''}`}>{value}</div>
      <div className="flex items-center gap-1 mt-1">
        {mom && <>{mom}<span className="text-xs text-gray-300">vs 上月</span></>}
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
      </div>
    </div>
  );
}

