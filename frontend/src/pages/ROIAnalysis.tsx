import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { Building2, AlertCircle, Pencil, Check, X, TrendingUp } from 'lucide-react';
import api from '../api/client';
import HowTo from '../components/HowTo';

interface UnitROI {
  id: string;
  unitNumber: string;
  status: string;
  monthlyRent: number;
  vacancyDays: number;
  vacancyCost: number;
}

interface PropertyROI {
  id: string;
  name: string;
  address: string;
  purchasePrice: number | null;
  totalUnits: number;
  occupiedUnits: number;
  totalExpected: number;
  totalCollected: number;
  totalExpenses: number;
  netIncome: number;
  vacancyDays: number;
  vacancyCost: number;
  annualizedROI: number | null;
  collectionRate: number;
  units: UnitROI[];
}

export default function ROIAnalysis() {
  const [data, setData] = useState<PropertyROI[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  function load() {
    setLoading(true);
    api.get('/roi')
      .then((r) => { setData(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function savePurchasePrice(propertyId: string) {
    setSaving(true);
    try {
      const val = editPrice.replace(/,/g, '');
      await api.put(`/properties/${propertyId}`, { purchasePrice: val ? Number(val) : null });
      setEditingId(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  const fmt = (n: number) => `NT$${Math.round(n).toLocaleString()}`;

  const totalNetIncome = data.reduce((s, p) => s + p.netIncome, 0);
  const totalVacancyCost = data.reduce((s, p) => s + p.vacancyCost, 0);
  const avgCollectionRate =
    data.length > 0 ? Math.round(data.reduce((s, p) => s + p.collectionRate, 0) / data.length) : 0;
  const bestProperty = data[0];

  const chartData = data.map((p) => ({
    name: p.name.length > 6 ? p.name.slice(0, 6) + '…' : p.name,
    淨收益: Math.max(0, p.netIncome),
    支出費用: p.totalExpenses,
    空置損失: p.vacancyCost,
  }));

  if (loading) {
    return <div className="flex items-center justify-center h-full py-20 text-gray-400">載入中...</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100">
        <div>
          <h1 className="text-xl font-bold text-gray-800">投報分析</h1>
          <p className="text-xs text-gray-400 mt-0.5">近 12 個月各房產收益、空置成本與年化投報率</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <HowTo module="roi" />

        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
            <Building2 className="w-12 h-12 text-gray-200" />
            <p className="text-sm">尚未建立任何房產</p>
            <button onClick={() => navigate('/properties')} className="btn-primary text-sm px-4 py-2">
              前往建立房產
            </button>
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <KpiCard
                label="投資組合淨收益"
                value={fmt(totalNetIncome)}
                sub="近 12 個月"
                accent={totalNetIncome >= 0 ? 'text-brand' : 'text-red-500'}
              />
              <KpiCard
                label="空置機會成本"
                value={fmt(totalVacancyCost)}
                sub="租金損失估算"
                accent={totalVacancyCost > 0 ? 'text-orange-500' : 'text-gray-400'}
              />
              <KpiCard
                label="平均收款率"
                value={`${avgCollectionRate}%`}
                sub="各房產平均"
                accent={
                  avgCollectionRate >= 90
                    ? 'text-brand'
                    : avgCollectionRate >= 70
                    ? 'text-amber-500'
                    : 'text-red-400'
                }
              />
              <KpiCard
                label="收益最佳房產"
                value={bestProperty?.name ?? '--'}
                sub={bestProperty ? `淨收益 ${fmt(bestProperty.netIncome)}` : '尚無資料'}
                accent="text-brand"
              />
            </div>

            {/* Bar chart — only if multiple properties */}
            {data.length > 1 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
                <h2 className="font-semibold text-gray-800 mb-4">各房產收益比較</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                    />
                    <Tooltip formatter={(v: number) => `NT$${v.toLocaleString()}`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="淨收益" fill="#4a6741" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="支出費用" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="空置損失" fill="#fb923c" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Rankings */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-5">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-800">各房產排名</h2>
                  <p className="text-xs text-gray-400 mt-0.5">點擊「買入總價」即可輸入，自動計算年化投報率</p>
                </div>
                <TrendingUp className="w-5 h-5 text-brand" />
              </div>

              {/* Mobile card list */}
              <div className="md:hidden divide-y divide-gray-50">
                {data.map((p, i) => {
                  const occ = p.totalUnits > 0 ? Math.round((p.occupiedUnits / p.totalUnits) * 100) : 0;
                  return (
                    <div key={p.id} className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold flex-shrink-0 ${i === 0 ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                          <div>
                            <div className="font-semibold text-gray-800 text-sm">{p.name}</div>
                            <div className="text-xs text-gray-400">{p.address}</div>
                          </div>
                        </div>
                        {p.annualizedROI !== null ? (
                          <span className={`text-lg font-bold ${p.annualizedROI >= 5 ? 'text-brand' : p.annualizedROI >= 3 ? 'text-amber-500' : 'text-red-400'}`}>
                            {p.annualizedROI}%
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">設定買入價</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                        <div className="bg-warm rounded-xl p-2.5">
                          <div className="text-gray-400 mb-0.5">出租率</div>
                          <div className={`font-semibold ${occ === 100 ? 'text-brand' : occ >= 70 ? 'text-amber-500' : 'text-red-400'}`}>{occ}% · {p.occupiedUnits}/{p.totalUnits} 間</div>
                        </div>
                        <div className="bg-warm rounded-xl p-2.5">
                          <div className="text-gray-400 mb-0.5">淨收益</div>
                          <div className={`font-semibold ${p.netIncome >= 0 ? 'text-brand' : 'text-red-500'}`}>{fmt(p.netIncome)}</div>
                        </div>
                        <div className="bg-warm rounded-xl p-2.5">
                          <div className="text-gray-400 mb-0.5">已收款</div>
                          <div className="font-semibold text-gray-700">{fmt(p.totalCollected)}</div>
                        </div>
                        <div className="bg-warm rounded-xl p-2.5">
                          <div className="text-gray-400 mb-0.5">空置損失</div>
                          <div className={`font-semibold ${p.vacancyCost > 0 ? 'text-orange-500' : 'text-gray-300'}`}>{p.vacancyCost > 0 ? fmt(p.vacancyCost) : '--'}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                        <span className="text-xs text-gray-400">買入總價</span>
                        {editingId === p.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-brand"
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                              placeholder="e.g. 8000000"
                              type="number"
                              autoFocus
                            />
                            <button onClick={() => savePurchasePrice(p.id)} disabled={saving} className="w-6 h-6 flex items-center justify-center text-brand hover:bg-brand/10 rounded">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingId(p.id); setEditPrice(p.purchasePrice?.toString() ?? ''); }}
                            className="flex items-center gap-1 text-xs text-gray-600 hover:text-brand"
                          >
                            {p.purchasePrice ? fmt(p.purchasePrice) : <span className="text-gray-300">點擊設定</span>}
                            <Pencil className="w-3 h-3 text-gray-300" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warm text-xs text-gray-400 font-medium">
                      <th className="px-4 py-3 text-left w-8">#</th>
                      <th className="px-4 py-3 text-left">房產</th>
                      <th className="px-4 py-3 text-right">出租率</th>
                      <th className="px-4 py-3 text-right">已收款</th>
                      <th className="px-4 py-3 text-right">支出</th>
                      <th className="px-4 py-3 text-right">淨收益</th>
                      <th className="px-4 py-3 text-right">空置損失</th>
                      <th className="px-4 py-3 text-right">買入總價</th>
                      <th className="px-4 py-3 text-right">年化投報</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.map((p, i) => {
                      const occupancyRate =
                        p.totalUnits > 0 ? Math.round((p.occupiedUnits / p.totalUnits) * 100) : 0;
                      return (
                        <tr key={p.id} className="hover:bg-warm/50 transition-colors">
                          <td className="px-4 py-3.5">
                            <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                              i === 0 ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {i + 1}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-medium text-gray-800">{p.name}</div>
                            <div className="text-xs text-gray-400">{p.address}</div>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <span className={`font-medium ${occupancyRate === 100 ? 'text-brand' : occupancyRate >= 70 ? 'text-amber-500' : 'text-red-400'}`}>
                              {occupancyRate}%
                            </span>
                            <div className="text-xs text-gray-400">{p.occupiedUnits}/{p.totalUnits} 間</div>
                          </td>
                          <td className="px-4 py-3.5 text-right text-gray-700 font-medium">
                            {fmt(p.totalCollected)}
                          </td>
                          <td className="px-4 py-3.5 text-right text-gray-500">
                            {p.totalExpenses > 0 ? fmt(p.totalExpenses) : <span className="text-gray-300">--</span>}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <span className={`font-semibold ${p.netIncome >= 0 ? 'text-brand' : 'text-red-500'}`}>
                              {fmt(p.netIncome)}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {p.vacancyCost > 0 ? (
                              <span className="text-orange-500">{fmt(p.vacancyCost)}</span>
                            ) : (
                              <span className="text-gray-300">--</span>
                            )}
                          </td>

                          {/* Purchase price editable cell */}
                          <td className="px-4 py-3.5 text-right">
                            {editingId === p.id ? (
                              <div className="flex items-center gap-1 justify-end">
                                <input
                                  className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-brand"
                                  value={editPrice}
                                  onChange={(e) => setEditPrice(e.target.value)}
                                  placeholder="e.g. 8000000"
                                  type="number"
                                  autoFocus
                                />
                                <button
                                  onClick={() => savePurchasePrice(p.id)}
                                  disabled={saving}
                                  className="w-6 h-6 flex items-center justify-center text-brand hover:bg-brand/10 rounded"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="w-6 h-6 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingId(p.id);
                                  setEditPrice(p.purchasePrice?.toString() ?? '');
                                }}
                                className="group flex items-center gap-1 justify-end text-gray-600 hover:text-brand w-full"
                              >
                                <span>
                                  {p.purchasePrice ? (
                                    fmt(p.purchasePrice)
                                  ) : (
                                    <span className="text-gray-300 text-xs">點擊設定</span>
                                  )}
                                </span>
                                <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 flex-shrink-0" />
                              </button>
                            )}
                          </td>

                          {/* ROI */}
                          <td className="px-4 py-3.5 text-right">
                            {p.annualizedROI !== null ? (
                              <span className={`font-bold text-base ${
                                p.annualizedROI >= 5
                                  ? 'text-brand'
                                  : p.annualizedROI >= 3
                                  ? 'text-amber-500'
                                  : 'text-red-400'
                              }`}>
                                {p.annualizedROI}%
                              </span>
                            ) : (
                              <span className="text-gray-300 text-xs">--</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ROI legend */}
              <div className="px-5 py-3 border-t border-gray-50 flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-brand inline-block" /> 投報 ≥ 5%：優質
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> 投報 3–5%：普通
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> 投報 &lt; 3%：偏低
                </span>
              </div>
            </div>

            {/* Vacancy alert */}
            {totalVacancyCost > 0 && (
              <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-orange-700 text-sm">空置機會成本提醒</div>
                  <div className="text-xs text-orange-600 mt-0.5">
                    過去 12 個月因空置估計損失 {fmt(totalVacancyCost)}，建議前往「空位刊登」加速租出。
                  </div>
                  <button
                    onClick={() => navigate('/listings')}
                    className="mt-2 text-xs font-medium text-orange-700 border border-orange-300 rounded-lg px-3 py-1 hover:bg-orange-100 transition-colors"
                  >
                    前往空位刊登
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub: string; accent: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="text-xs text-gray-400 mb-2">{label}</div>
      <div className={`text-lg font-bold ${accent} truncate`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{sub}</div>
    </div>
  );
}
