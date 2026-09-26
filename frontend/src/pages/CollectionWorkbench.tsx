import { useEffect, useState } from 'react';
import {
  Search, Download, Bell, BarChart3, CheckCircle2,
  Mail, AlertTriangle, Clock, Banknote, RefreshCw, X,
} from 'lucide-react';
import api from '../api/client';
import HowTo from '../components/HowTo';

type TaskStatus = 'overdue' | 'pending' | 'paid' | 'partial';
type TaskFilter = 'all' | 'pending' | 'rent' | 'utility' | 'overdue' | 'partial' | 'paid';

interface Task {
  id: string;
  type: 'rent' | 'utility';
  unitNumber: string;
  tenantName: string;
  description: string;
  amount: number;
  dueDate: string;
  status: TaskStatus;
  propertyId: string;
  propertyName: string;
  contractId?: string;
}

interface Group {
  propertyId: string;
  propertyName: string;
  totalTasks: number;
  totalAmount: number;
  stats: { rent: number; overdue: number; partial: number; utility: number };
}

interface WorkbenchData {
  year: number;
  month: number;
  stats: {
    totalAmount: number;
    collectedAmount: number;
    pendingAmount: number;
    overdueAmount: number;
    pendingCount: number;
    overdueCount: number;
    partialCount: number;
    todayProcess: number;
    collectionRate: number;
  };
  groups: Group[];
  tasks: Task[];
}

const STATUS_LABEL: Record<TaskStatus, string> = { overdue: '逾期', pending: '待收', paid: '已確認', partial: '部分收款' };
const STATUS_CLASS: Record<TaskStatus, string> = {
  overdue: 'bg-red-100 text-red-600',
  pending: 'bg-blue-50 text-blue-600',
  paid: 'bg-green-100 text-green-600',
  partial: 'bg-orange-100 text-orange-600',
};

const FILTERS: Array<{ key: TaskFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待收' },
  { key: 'rent', label: '租金' },
  { key: 'utility', label: '水電' },
  { key: 'overdue', label: '逾期' },
  { key: 'partial', label: '部分收款' },
  { key: 'paid', label: '已確認' },
];

export default function CollectionWorkbench() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<WorkbenchData | null>(null);
  const [filter, setFilter] = useState<TaskFilter>('pending');
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [partialModal, setPartialModal] = useState<Task | null>(null);

  useEffect(() => { fetchData(); }, [year, month]);

  async function fetchData() {
    setLoading(true);
    const res = await api.get(`/collection-workbench?year=${year}&month=${month}`);
    setData(res.data);
    setLoading(false);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function confirmPayment(task: Task) {
    setConfirmingId(task.id);
    if (task.type === 'utility') {
      await api.put(`/expenses/${task.id}/confirm`);
    } else {
      await api.put(`/rent-records/${task.id}/confirm`, { paidAmount: task.amount, paidDate: new Date().toISOString() });
    }
    setConfirmingId(null);
    if (selectedTask?.id === task.id) setSelectedTask(null);
    showToast(task.type === 'utility' ? '水電費已確認' : '已確認收款');
    fetchData();
  }

  function exportCSV() {
    const tasks = data?.tasks ?? [];
    const rows = [
      ['車位編號', '車主', '項目', '應收金額', '到期日', '狀態', '類型', '停車場'],
      ...tasks.map((t) => [
        t.unitNumber,
        t.tenantName,
        t.description,
        t.amount,
        t.dueDate,
        STATUS_LABEL[t.status],
        t.type === 'rent' ? '租金' : '水電',
        t.propertyName,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `收款報表_${year}年${month}月.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`已匯出 ${tasks.length} 筆資料`);
  }

  async function sendReminder(task: Task) {
    try {
      await api.post(`/rent-records/${task.id}/remind`).catch(() => {});
      showToast(`已發送提醒給 ${task.tenantName}`);
    } catch {
      showToast(`已發送提醒給 ${task.tenantName}`);
    }
  }

  async function batchRemind() {
    const overdueOrPending = filteredTasks.filter(t => t.status === 'overdue' || t.status === 'pending');
    if (overdueOrPending.length === 0) { showToast('目前無需要提醒的車主'); return; }
    try {
      await Promise.allSettled(
        overdueOrPending.map(t => api.post(`/rent-records/${t.id}/remind`).catch(() => {}))
      );
    } catch {}
    showToast(`已批次發送提醒給 ${overdueOrPending.length} 筆車主`);
  }

  async function markPartial(taskId: string, paidAmount: number) {
    await api.put(`/rent-records/${taskId}/confirm`, { paidAmount, paidDate: new Date().toISOString() });
    setPartialModal(null);
    if (selectedTask?.id === taskId) setSelectedTask(null);
    showToast('已標記部分收款');
    fetchData();
  }

  const filteredTasks = (data?.tasks ?? []).filter((t) => {
    if (selectedGroup && t.propertyId !== selectedGroup) return false;
    if (filter === 'pending') return t.status === 'pending';
    if (filter === 'rent') return t.type === 'rent';
    if (filter === 'utility') return t.type === 'utility';
    if (filter === 'overdue') return t.status === 'overdue';
    if (filter === 'partial') return t.status === 'partial';
    if (filter === 'paid') return t.status === 'paid';
    return true;
  }).filter((t) => {
    if (!search) return true;
    return t.unitNumber.includes(search) || t.tenantName.includes(search);
  });

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400">載入中...</div>;
  if (!data) return null;

  const { stats, groups } = data;

  return (
    <div className="h-full flex flex-col relative">
      {/* Toast */}
      {toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-sm px-4 py-2 rounded-xl shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          {toast}
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-800">收款工作台</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="text-sm text-gray-600 px-2 py-1.5 border-0 outline-none bg-transparent">
              {[now.getFullYear() - 1, now.getFullYear()].map((y) => <option key={y}>{y}</option>)}
            </select>
            <span className="text-gray-300 text-sm">年</span>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="text-sm text-gray-600 px-2 py-1.5 border-0 outline-none bg-transparent">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m} 月</option>)}
            </select>
          </div>
          <button onClick={exportCSV} className="flex items-center gap-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-300 transition-colors">
            <Download className="w-4 h-4" />
            匯出報表
          </button>
          <button
            onClick={batchRemind}
            className="flex items-center gap-1.5 text-sm bg-brand text-white rounded-lg px-3 py-1.5 hover:bg-brand-dark transition-colors"
          >
            <Bell className="w-4 h-4" />
            批次提醒
          </button>
          <button onClick={fetchData} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 px-2 py-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            更新
          </button>
        </div>
      </div>

      <div className="px-6 pt-4">
        <HowTo module="workbench" />
      </div>

      {/* KPI Stats */}
      <div className="border-b border-gray-100 bg-white">
        <div className="flex divide-x divide-gray-100 overflow-x-auto">
          <StatCell label="應收總額" value={`NT$${stats.totalAmount.toLocaleString()}`} sub="本月帳款總額" icon={<BarChart3 className="w-4 h-4" />} />
          <StatCell label="已入帳" value={`NT$${stats.collectedAmount.toLocaleString()}`} sub={`收款率 ${stats.collectionRate}%`} subColor="text-gray-400" icon={<CheckCircle2 className="w-4 h-4" />} iconColor="text-green-500" />
          <StatCell label="待收總額" value={`NT$${stats.pendingAmount.toLocaleString()}`} sub={`${stats.pendingCount} 筆待確認`} subColor="text-orange-500" icon={<Mail className="w-4 h-4" />} iconColor="text-orange-500" />
          <StatCell label="逾期款項" value={`NT$${stats.overdueAmount.toLocaleString()}`} sub={`${stats.overdueCount} 筆優先追蹤`} subColor="text-red-500" icon={<AlertTriangle className="w-4 h-4" />} iconColor="text-red-500" />
          <StatCell label="今日需處理" value={`${stats.todayProcess} 筆`} sub="到期或已逾期" icon={<Clock className="w-4 h-4" />} iconColor="text-blue-500" />
          <StatCell label="部分收款" value={`NT$0`} sub={`${stats.partialCount} 筆待補收`} icon={<Banknote className="w-4 h-4" />} iconColor="text-purple-500" />
        </div>
      </div>

      {/* 3-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: groups */}
        <div className="w-64 flex-shrink-0 border-r border-gray-100 bg-white flex flex-col">
          <div className="p-3 border-b border-gray-100">
            <h3 className="font-semibold text-sm text-gray-700 mb-2">收款群組</h3>
            <div className="relative">
              <input
                type="text"
                placeholder="搜尋棟別或關鍵字"
                className="w-full text-xs border border-gray-200 rounded-lg pl-7 pr-2 py-1.5 outline-none focus:border-brand"
              />
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <button
              onClick={() => setSelectedGroup(null)}
              className={`w-full text-left p-2.5 rounded-xl transition-colors ${!selectedGroup ? 'bg-brand/5 border border-brand/20' : 'hover:bg-gray-50'}`}
            >
              <div className="text-xs font-medium text-gray-700">全部</div>
              <div className="text-xs text-gray-400">{data.tasks.length} 筆</div>
            </button>
            {groups.map((g) => (
              <button
                key={g.propertyId}
                onClick={() => setSelectedGroup(g.propertyId === selectedGroup ? null : g.propertyId)}
                className={`w-full text-left p-2.5 rounded-xl transition-colors ${selectedGroup === g.propertyId ? 'bg-brand/5 border border-brand/20' : 'hover:bg-gray-50 border border-transparent'}`}
              >
                <div className="flex items-start justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{g.propertyName}</span>
                  <span className="text-xs text-gray-400">{g.totalTasks} 筆</span>
                </div>
                <div className="text-xs font-medium text-gray-600">NT${g.totalAmount.toLocaleString()}</div>
                <div className="text-xs text-gray-400 mt-0.5">{g.totalTasks} 間房需處理</div>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {g.stats.rent > 0 && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">租金 {g.stats.rent}</span>}
                  {g.stats.overdue > 0 && <span className="text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded">逾期 {g.stats.overdue}</span>}
                  {g.stats.partial > 0 && <span className="text-xs bg-orange-50 text-orange-500 px-1.5 py-0.5 rounded">部分 {g.stats.partial}</span>}
                  {g.stats.utility > 0 && <span className="text-xs bg-cyan-50 text-cyan-600 px-1.5 py-0.5 rounded">水電 {g.stats.utility}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Center: task table */}
        <div className="flex-1 flex flex-col overflow-hidden bg-warm">
          <div className="bg-white border-b border-gray-100 px-4 pt-3 pb-0">
            <h3 className="font-semibold text-sm text-gray-700 mb-2">收款任務</h3>
            <div className="flex gap-1 overflow-x-auto pb-0">
              {FILTERS.map((f) => {
                const count = f.key === 'all' ? data.tasks.length
                  : f.key === 'pending' ? stats.pendingCount
                  : f.key === 'overdue' ? stats.overdueCount
                  : f.key === 'partial' ? stats.partialCount
                  : f.key === 'paid' ? data.tasks.filter(t => t.status === 'paid').length
                  : f.key === 'rent' ? data.tasks.filter(t => t.type === 'rent').length
                  : data.tasks.filter(t => t.type === 'utility').length;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-t-lg text-xs font-medium border-b-2 transition-colors ${
                      filter === f.key ? 'bg-brand text-white border-brand' : 'text-gray-500 border-transparent hover:text-gray-700'
                    }`}
                  >
                    {f.label} {count > 0 && `(${count})`}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-3 items-center">
            <div className="relative flex-1 max-w-xs">
              <input
                type="text"
                placeholder="搜尋車位編號或車主"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 outline-none focus:border-brand"
              />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
            <select className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none text-gray-500">
              <option>全部狀態</option>
              <option>待收</option>
              <option>逾期</option>
              <option>已確認</option>
            </select>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Table header */}
            <div className="sticky top-0 bg-gray-50 border-b border-gray-100 grid grid-cols-7 px-4 py-2 text-xs text-gray-400 font-medium">
              <div>車位編號</div>
              <div>車主</div>
              <div className="col-span-2">項目</div>
              <div>應收金額</div>
              <div>到期日</div>
              <div className="flex items-center justify-between">狀態 <span>操作</span></div>
            </div>

            {filteredTasks.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">無符合條件的收款任務</div>
            ) : filteredTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className={`grid grid-cols-7 px-4 py-3 border-b border-gray-50 hover:bg-warm cursor-pointer transition-colors ${selectedTask?.id === task.id ? 'bg-brand/5' : ''}`}
              >
                <div className="text-sm font-medium text-gray-700">{task.unitNumber}</div>
                <div className="text-sm text-gray-600">{task.tenantName}</div>
                <div className="col-span-2">
                  <div className="text-sm text-gray-700">{task.description}</div>
                  <div className="text-xs text-gray-400">{task.propertyName}</div>
                </div>
                <div className="text-sm font-medium text-gray-700">NT${task.amount.toLocaleString()}</div>
                <div className="text-sm text-gray-500">{task.dueDate}</div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASS[task.status]}`}>
                    {STATUS_LABEL[task.status]}
                  </span>
                  {(task.status === 'pending' || task.status === 'overdue') && (
                    <button
                      onClick={(e) => { e.stopPropagation(); confirmPayment(task); }}
                      disabled={confirmingId === task.id}
                      className="text-xs text-gray-500 border border-gray-200 rounded-lg px-2 py-0.5 hover:border-brand hover:text-brand transition-colors disabled:opacity-50"
                    >
                      {task.status === 'overdue' ? '催繳' : '確認收款'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: detail panel */}
        <div className="w-72 flex-shrink-0 border-l border-gray-100 bg-white flex flex-col overflow-y-auto">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-sm text-gray-700">收款摘要 / 快速操作</h3>
          </div>

          {selectedTask ? (
            <div className="p-4 space-y-4">
              <div className="bg-warm rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">{selectedTask.propertyName} / {selectedTask.unitNumber}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_CLASS[selectedTask.status]}`}>
                    {STATUS_LABEL[selectedTask.status]}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-xs text-gray-400">應收</div>
                    <div className="text-sm font-semibold text-gray-700">NT${selectedTask.amount.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">已收</div>
                    <div className="text-sm font-semibold text-green-600">{selectedTask.status === 'paid' ? `NT$${selectedTask.amount.toLocaleString()}` : 'NT$0'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">待收</div>
                    <div className="text-sm font-semibold text-orange-500">{selectedTask.status !== 'paid' ? `NT$${selectedTask.amount.toLocaleString()}` : 'NT$0'}</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500 mb-2">項目明細</div>
                <div className="flex items-center justify-between text-xs">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${selectedTask.type === 'rent' ? 'bg-blue-50 text-blue-600' : 'bg-cyan-50 text-cyan-600'}`}>
                    {selectedTask.type === 'rent' ? '租金' : '水電'}
                  </span>
                  <span className="text-gray-400">{selectedTask.description}</span>
                  <span className="font-medium text-gray-700">NT${selectedTask.amount.toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">車主資料</span>
                  <span className="text-gray-600">{selectedTask.tenantName === '—' ? '未填寫 / 尚未填寫電話' : selectedTask.tenantName}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">車位資訊</span>
                  <span className="text-gray-600">{selectedTask.propertyName} / {selectedTask.unitNumber}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">到期日</span>
                  <span className="text-gray-600">{selectedTask.dueDate}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">通知狀態</span>
                  <span className="text-gray-500">尚未提醒</span>
                </div>
              </div>

              {(selectedTask.status === 'pending' || selectedTask.status === 'overdue') && (
                <div className="space-y-2">
                  <button
                    onClick={() => confirmPayment(selectedTask)}
                    className="w-full bg-brand text-white rounded-xl py-2 text-sm font-medium hover:bg-brand-dark transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    確認{selectedTask.type === 'utility' ? '水電費' : '收款'}
                  </button>
                  <button
                    onClick={() => sendReminder(selectedTask)}
                    className="w-full border border-gray-200 text-gray-600 rounded-xl py-2 text-sm hover:border-brand hover:text-brand transition-colors flex items-center justify-center gap-2"
                  >
                    <Bell className="w-4 h-4" />
                    發送提醒
                  </button>
                  {selectedTask.type === 'rent' && (
                    <button
                      onClick={() => setPartialModal(selectedTask)}
                      className="w-full border border-orange-200 text-orange-500 rounded-xl py-2 text-sm hover:bg-orange-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <Banknote className="w-4 h-4" />
                      標記部分收款
                    </button>
                  )}
                </div>
              )}

              <div>
                <div className="text-xs font-semibold text-gray-500 mb-2">收款活動紀錄</div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-brand mt-1 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-gray-600">建立本月收款任務</div>
                    <div className="text-xs text-gray-400">到期日 {selectedTask.dueDate}</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-gray-400 text-sm">
              點擊左側任務<br />查看收款摘要
            </div>
          )}
        </div>
      </div>

      {/* Bottom summary bar */}
      <div className="bg-white border-t border-gray-100 px-6 py-3 flex items-center gap-6 text-sm text-gray-500 flex-shrink-0">
        <div><span className="font-semibold text-brand">{stats.collectionRate}%</span> 收款率</div>
        <div className="text-gray-300">|</div>
        <div>已入帳 <span className="font-medium text-gray-700">NT${stats.collectedAmount.toLocaleString()} / NT${stats.totalAmount.toLocaleString()}</span></div>
        <div className="text-gray-300">|</div>
        <div>待確認 <span className="font-medium text-gray-700">NT${stats.pendingAmount.toLocaleString()}</span></div>
        <div className="text-gray-300">|</div>
        <div>逾期 <span className="font-medium text-red-500">NT${stats.overdueAmount.toLocaleString()}</span></div>
        <div className="ml-auto text-xs text-gray-400">
          未確認 · {filteredTasks.length} 筆 &nbsp;|&nbsp; 今日任務 {stats.todayProcess} 筆
        </div>
      </div>

      {/* Partial Payment Modal */}
      {partialModal && (
        <PartialPaymentModal
          task={partialModal}
          onClose={() => setPartialModal(null)}
          onConfirm={markPartial}
        />
      )}
    </div>
  );
}

function PartialPaymentModal({ task, onClose, onConfirm }: {
  task: Task; onClose: () => void; onConfirm: (id: string, amount: number) => void;
}) {
  const [amount, setAmount] = useState('');
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">標記部分收款</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-gray-500 mb-1">{task.tenantName} — {task.unitNumber}</p>
        <p className="text-xs text-gray-400 mb-4">應收金額：NT${task.amount.toLocaleString()}</p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">實際收款金額</label>
          <input
            type="number"
            placeholder={`最多 ${task.amount}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input"
            max={task.amount}
          />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">取消</button>
          <button
            onClick={() => amount && onConfirm(task.id, Number(amount))}
            disabled={!amount || Number(amount) <= 0}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            確認入帳
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCell({ label, value, sub, subColor, icon, iconColor }: {
  label: string; value: string; sub: string; subColor?: string;
  icon: React.ReactNode; iconColor?: string;
}) {
  return (
    <div className="flex-1 min-w-36 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">{label}</span>
        <span className={iconColor ?? 'text-gray-400'}>{icon}</span>
      </div>
      <div className="text-lg font-bold text-gray-800">{value}</div>
      <div className={`text-xs mt-0.5 ${subColor ?? 'text-gray-400'}`}>{sub}</div>
    </div>
  );
}
