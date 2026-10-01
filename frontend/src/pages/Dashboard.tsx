import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
  CircleDollarSign, ClipboardList, Home, Clock,
  Calendar, AlertTriangle, ChevronRight,
} from 'lucide-react';
import api from '../api/client';
import { DashboardData } from '../types';
import CalendarModal from '../components/CalendarModal';
import HowTo from '../components/HowTo';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../lib/permissions';

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);
  const [trendPeriod, setTrendPeriod] = useState<'6m' | '12m'>('6m');
  const navigate = useNavigate();
  const { user } = useAuth();
  const now = new Date();

  useEffect(() => {
    api.get('/dashboard').then((r) => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full py-20 text-gray-400">載入中...</div>;
  if (!data) return null;

  const { rentSummary, occupancy, pendingMaintenance, trendData, expiringContracts, overdueRecords, totalTodos, operationSummary, autoNotifyEnabled } = data;

  const pendingAmount = rentSummary.totalRent - rentSummary.collectedRent;

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="page-header items-center justify-between px-6 py-4 bg-white border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-800">總覽</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowCalendar(true)} className="flex items-center gap-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-brand hover:text-brand transition-colors">
            <Calendar className="w-4 h-4" />
            {now.getFullYear()} 年 {now.getMonth() + 1} 月
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate('/accounts')}
              className="flex items-center gap-1.5"
              title="我的帳號"
              aria-label="我的帳號"
            >
              <div className="w-7 h-7 bg-brand rounded-full flex items-center justify-center text-white text-xs font-bold">
                {user?.name?.charAt(0) ?? '?'}
              </div>
              <span className="text-sm text-gray-600 hidden lg:block">{user?.name}（{isAdmin(user) ? '管理員' : '員工'}）</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <HowTo module="dashboard" />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard
            label="本月已收"
            value={`NT$${rentSummary.collectedRent.toLocaleString()}`}
            sub={`較上月 ${rentSummary.collectionRate >= 50 ? '+' : ''}${rentSummary.collectionRate}%`}
            subColor="text-gray-400"
            icon={<CircleDollarSign className="w-4 h-4 text-green-600" />}
            iconBg="bg-green-50"
          />
          <KpiCard
            label="待收金額"
            value={`NT$${pendingAmount.toLocaleString()}`}
            sub="與上月持平"
            subColor={pendingAmount > 0 ? 'text-orange-500' : 'text-gray-400'}
            icon={<ClipboardList className="w-4 h-4 text-orange-500" />}
            iconBg="bg-orange-50"
            valueColor="text-orange-500"
          />
          <KpiCard
            label="出租率"
            value={`${occupancy.rate}%`}
            sub={`${occupancy.occupied} / ${occupancy.total} 間 · 較上月 +${occupancy.rate > 70 ? '7' : '0'}%`}
            subColor="text-gray-400"
            icon={<Home className="w-4 h-4 text-blue-500" />}
            iconBg="bg-blue-50"
          />
          <KpiCard
            label="今日待處理"
            value={`${totalTodos} 件`}
            sub={`收款 ${overdueRecords.length + rentSummary.pendingCount} · 報修 ${pendingMaintenance} · 合約 ${expiringContracts.length}`}
            subColor="text-brand"
            icon={<Clock className="w-4 h-4 text-purple-500" />}
            iconBg="bg-purple-50"
          />
        </div>

        {/* Main content: 2 columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          {/* Rent Progress (2/3) */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">本月收租進度</h2>
              <button onClick={() => navigate('/finance/workbench')} className="text-xs text-brand border border-brand/30 rounded-lg px-3 py-1 hover:bg-brand/5 transition-colors">
                查看收款明細
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-warm rounded-xl p-3 text-center">
                <div className="text-xs text-gray-400 mb-1">應收</div>
                <div className="font-bold text-gray-700">NT${rentSummary.totalRent.toLocaleString()}</div>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-400 mb-1">已收</div>
                <div className="font-bold text-green-600">NT${rentSummary.collectedRent.toLocaleString()}</div>
              </div>
              <div className="bg-orange-50 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-400 mb-1">待收</div>
                <div className="font-bold text-orange-500">NT${pendingAmount.toLocaleString()}</div>
              </div>
            </div>

            <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
              <span>收款率</span>
              <span>{rentSummary.collectionRate}%</span>
            </div>
            <div className="bg-gray-100 rounded-full h-2 mb-1">
              <div className="bg-brand rounded-full h-2 transition-all" style={{ width: `${rentSummary.collectionRate}%` }} />
            </div>
            <div className="text-xs text-gray-400 mb-4">
              已收 {rentSummary.paidCount} / {rentSummary.paidCount + rentSummary.pendingCount + rentSummary.overdueCount} 筆
              {rentSummary.overdueCount > 0 && (
                <span className="text-red-500"> · 逾期 {rentSummary.overdueCount} 筆</span>
              )}
            </div>

            {overdueRecords.length > 0 && (
              <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                  <span className="text-sm text-orange-700">
                    仍有款項需要追蹤，待收金額 NT${rentSummary.overdueAmount.toLocaleString()}，建議優先確認入帳與追蹤逾期戶。
                  </span>
                </div>
                <button onClick={() => navigate('/finance/workbench')} className="flex-shrink-0 ml-3 text-sm font-medium bg-brand text-white rounded-lg px-3 py-1.5">
                  前往工作台
                </button>
              </div>
            )}
          </div>

          {/* Today's Priorities (1/3) */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">今日優先處理</h2>
              <button onClick={() => setShowCalendar(true)} className="text-xs text-brand">查看全部</button>
            </div>
            <div className="space-y-2">
              <PriorityItem
                label="待收款"
                sub={`待入帳 · 待收 NT$${pendingAmount.toLocaleString()}`}
                count={rentSummary.pendingCount + overdueRecords.length}
                badge={overdueRecords.length > 0 ? '逾期中' : undefined}
                badgeColor="bg-red-100 text-red-600"
                onClick={() => navigate('/finance/workbench')}
              />
              <PriorityItem
                label="報修處理中"
                sub={`${pendingMaintenance} 件處理中或待處理`}
                count={pendingMaintenance}
                badge={pendingMaintenance > 0 ? '處理中' : undefined}
                badgeColor="bg-orange-100 text-orange-600"
                onClick={() => navigate('/maintenance')}
              />
              <PriorityItem
                label="合約提醒"
                sub={`30 天內到期 ${expiringContracts.length} 份`}
                count={expiringContracts.length}
                badge={expiringContracts.length === 0 ? '無提醒' : undefined}
                badgeColor="bg-gray-100 text-gray-500"
                onClick={() => navigate('/contracts')}
              />
              <PriorityItem
                label="LINE 通知"
                sub="自動通知模式已啟用"
                count={null}
                badge={autoNotifyEnabled ? '自動模式' : '未設定'}
                badgeColor={autoNotifyEnabled ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}
                onClick={() => navigate('/settings')}
              />
            </div>
          </div>
        </div>

        {/* Analytics: 2 columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Trend Chart (2/3) */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">營運分析</h2>
              <div className="flex gap-1">
                {(['6m', '12m'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setTrendPeriod(p)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${trendPeriod === p ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {p === '6m' ? '近 6 個月' : '近 12 個月'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-4 text-xs text-gray-400 mb-3">
              <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand inline-block rounded" /> 已收金額</span>
              <span className="flex items-center gap-1"><span className="w-4 h-0 inline-block border-t-2 border-dashed border-gray-300" /> 應收金額</span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <Tooltip formatter={(v: number) => `NT$${v.toLocaleString()}`} />
                <Line type="monotone" dataKey="collected" stroke="#4a6741" strokeWidth={2} dot={{ r: 3 }} name="已收金額" />
                <Line type="monotone" dataKey="expected" stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="應收金額" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Insights (1/3) */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">工作洞察</h2>
            <div className="space-y-3">
              <InsightItem
                label={`收款率 ${rentSummary.collectionRate}%`}
                desc={rentSummary.collectionRate < 70 ? '收款率偏低，建議優先處理待入帳與逾期帳戶。' : '收款率良好，繼續維持。'}
                color="bg-brand"
              />
              {pendingAmount > 0 && (
                <InsightItem
                  label={`待收金額 NT$${pendingAmount.toLocaleString()}`}
                  desc="待收金額仍需追蹤，建議至收款工作台確認入帳狀態。"
                  color="bg-orange-400"
                />
              )}
              <InsightItem
                label={`出租率 ${occupancy.rate}%`}
                desc={`${occupancy.occupied}/${occupancy.total} 間已出租。${occupancy.total - occupancy.occupied > 0 ? `尚有 ${occupancy.total - occupancy.occupied} 間空位。` : ''}`}
                color="bg-blue-400"
              />
              <InsightItem
                label={operationSummary.split('，')[0] ?? '本週無待處理事項'}
                desc={operationSummary}
                color="bg-purple-400"
              />
            </div>
          </div>
        </div>
      </div>

      {showCalendar && <CalendarModal onClose={() => setShowCalendar(false)} />}
    </div>
  );
}

function KpiCard({ label, value, sub, subColor, icon, iconBg, valueColor }: {
  label: string; value: string; sub: string; subColor: string;
  icon: React.ReactNode; iconBg: string; valueColor?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center`}>{icon}</div>
      </div>
      <div className={`text-xl font-bold ${valueColor ?? 'text-gray-800'} mb-1`}>{value}</div>
      <div className={`text-xs ${subColor}`}>{sub}</div>
    </div>
  );
}

function PriorityItem({ label, sub, count, badge, badgeColor, onClick }: {
  label: string; sub: string; count: number | null; badge?: string;
  badgeColor: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-warm transition-colors text-left">
      <div>
        <div className="font-medium text-sm text-gray-700">{label}</div>
        <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
      </div>
      <div className="flex items-center gap-2">
        {badge && <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${badgeColor}`}>{badge}</span>}
        {count !== null && (
          <div className="flex items-center gap-0.5 text-sm font-bold text-gray-700">
            {count}
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
    </button>
  );
}

function InsightItem({ label, desc, color }: { label: string; desc: string; color: string }) {
  return (
    <div className="flex gap-3">
      <div className={`w-1 rounded-full flex-shrink-0 ${color}`} />
      <div>
        <div className="text-sm font-medium text-gray-700">{label}</div>
        <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}
