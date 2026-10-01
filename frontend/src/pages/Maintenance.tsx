import { useEffect, useState } from 'react';
import { X, Plus, Sparkles, Scale } from 'lucide-react';
import api from '../api/client';
import { MaintenanceRequest, Property } from '../types';
import HowTo from '../components/HowTo';
import { AttachmentButton } from '../components/AttachmentModal';
import { useAttachmentSummary } from '../lib/attachments';
import SearchBox, { matches } from '../components/SearchBox';

type StatusFilter = 'ALL' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

interface Analysis {
  responsibility: 'LANDLORD' | 'TENANT' | 'SHARED' | 'UNCLEAR';
  responsibilityLabel: string;
  costMin: number;
  costMax: number;
  reasoning: string;
  tips: string;
  aiAnalyzed: boolean;
}

const RESP_CLASS: Record<string, string> = {
  LANDLORD: 'bg-blue-50 text-blue-600 border-blue-200',
  TENANT: 'bg-amber-50 text-amber-600 border-amber-200',
  SHARED: 'bg-purple-50 text-purple-600 border-purple-200',
  UNCLEAR: 'bg-gray-50 text-gray-500 border-gray-200',
};

export default function Maintenance() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<MaintenanceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const files = useAttachmentSummary('MAINTENANCE');
  const [search, setSearch] = useState('');
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({});
  const [analyzing, setAnalyzing] = useState<string | null>(null);

  useEffect(() => { fetchAll(); }, [filter]);

  async function analyze(id: string) {
    setAnalyzing(id);
    try {
      const r = await api.post(`/maintenance/${id}/analyze`);
      setAnalyses((a) => ({ ...a, [id]: r.data }));
    } finally {
      setAnalyzing(null);
    }
  }

  async function fetchAll() {
    setLoading(true);
    const [r, p] = await Promise.all([
      api.get(`/maintenance${filter !== 'ALL' ? `?status=${filter}` : ''}`),
      api.get('/properties'),
    ]);
    setRequests(r.data);
    setProperties(p.data);
    setLoading(false);
  }

  const statusLabel = (s: string) => ({ PENDING: '待處理', IN_PROGRESS: '處理中', COMPLETED: '已完成', CANCELLED: '已取消' }[s] ?? s);
  const statusClass = (s: string) => ({ PENDING: 'badge-overdue', IN_PROGRESS: 'badge-pending', COMPLETED: 'badge-paid', CANCELLED: 'badge-vacant' }[s] ?? '');
  const priorityLabel = (p: string) => ({ HIGH: '高', MEDIUM: '中', LOW: '低' }[p] ?? p);
  const priorityClass = (p: string) => ({ HIGH: 'text-red-500', MEDIUM: 'text-orange-500', LOW: 'text-gray-400' }[p] ?? '');

  const counts = {
    ALL: requests.length,
    PENDING: requests.filter(r => r.status === 'PENDING').length,
    IN_PROGRESS: requests.filter(r => r.status === 'IN_PROGRESS').length,
    COMPLETED: requests.filter(r => r.status === 'COMPLETED').length,
  };

  async function updateStatus(id: string, status: string) {
    await api.put(`/maintenance/${id}`, { status });
    fetchAll();
  }

  async function removeRequest(r: MaintenanceRequest) {
    if (!confirm(`確定刪除「${r.unit?.unitNumber ?? ''} ${r.title}」這筆報修？`)) return;
    await api.delete(`/maintenance/${r.id}`);
    fetchAll();
  }

  const shown = requests.filter((r) =>
    matches(search, r.title, r.description, r.notes, r.unit?.unitNumber, r.unit?.property?.name, r.tenant?.name));

  const allUnits = properties.flatMap(p => p.units.map(u => ({ ...u, propertyName: p.name })));

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="page-header items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">報修管理</h1>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm flex items-center gap-1"><Plus className="w-4 h-4" />新增報修</button>
      </div>

      <HowTo module="maintenance" />

      {/* Filter Tabs */}
      <div className="grid grid-cols-4 gap-1 bg-white rounded-xl p-1 mb-4 shadow-sm">
        {(['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === s ? 'bg-brand text-white' : 'text-gray-500'}`}
          >
            {s === 'ALL' ? '全部' : s === 'PENDING' ? '待處理' : s === 'IN_PROGRESS' ? '處理中' : '已完成'}
            <span className="ml-1 opacity-70">({counts[s]})</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex">
        <SearchBox value={search} onChange={setSearch} placeholder="搜尋車位編號、標題、描述、車主" className="max-w-none" />
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">載入中...</div>
      ) : shown.length === 0 ? (
        <div className="card text-center py-8 text-gray-400 text-sm">
          {search ? `找不到「${search}」的報修` : filter === 'ALL' ? '尚無報修紀錄' : `無${filter === 'PENDING' ? '待處理' : filter === 'IN_PROGRESS' ? '處理中' : '已完成'}報修`}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => (
            <div key={r.id} className="card">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{r.unit?.unitNumber}</span>
                    <span className="text-xs text-gray-400">{r.unit?.property?.name}</span>
                    <span className={statusClass(r.status)}>{statusLabel(r.status)}</span>
                    <span className={`text-xs font-medium ${priorityClass(r.priority)}`}>優先{priorityLabel(r.priority)}</span>
                  </div>
                  <div className="font-medium mt-1">{r.title}</div>
                  <div className="text-sm text-gray-500 mt-0.5">{r.description}</div>
                  {r.tenant && <div className="text-xs text-gray-400 mt-1">報修人：{r.tenant.name}</div>}
                  <div className="text-xs text-gray-400">{new Date(r.reportedAt).toLocaleDateString('zh-TW')}</div>
                </div>
                <button
                  onClick={() => analyze(r.id)}
                  disabled={analyzing === r.id}
                  className="btn-secondary text-xs flex items-center gap-1 flex-shrink-0 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 text-brand" />
                  {analyzing === r.id ? '分析中...' : 'AI 分析'}
                </button>
              </div>

              {analyses[r.id] && (
                <div className="mt-2 bg-warm rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="flex items-center gap-1 text-xs font-medium text-gray-600"><Scale className="w-3.5 h-3.5" />修繕責任</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border ${RESP_CLASS[analyses[r.id].responsibility]}`}>
                      {analyses[r.id].responsibilityLabel}
                    </span>
                    <span className="text-xs text-gray-500">
                      估價 NT${analyses[r.id].costMin.toLocaleString()}–{analyses[r.id].costMax.toLocaleString()}
                    </span>
                    {!analyses[r.id].aiAnalyzed && <span className="text-xs text-gray-400">（規則初判）</span>}
                  </div>
                  <div className="text-xs text-gray-600">{analyses[r.id].reasoning}</div>
                  {analyses[r.id].tips && <div className="text-xs text-gray-500 mt-1">💡 {analyses[r.id].tips}</div>}
                </div>
              )}

              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                  {r.status === 'PENDING' && (
                    <button onClick={() => updateStatus(r.id, 'IN_PROGRESS')} className="btn-secondary text-xs flex-1">開始處理</button>
                  )}
                  {r.status === 'IN_PROGRESS' && (
                    <button onClick={() => updateStatus(r.id, 'COMPLETED')} className="btn-primary text-xs flex-1">標記完成</button>
                  )}
                  <span className="ml-auto" />
                  <AttachmentButton
                    entityType="MAINTENANCE"
                    entityId={r.id}
                    title={`報修 ${r.title}・${r.unit?.property?.name ?? ''} ${r.unit?.unitNumber ?? ''}（維修前後照片、報價單、發票）`}
                    count={files.summary[r.id]?.count}
                    onChanged={files.refresh}
                  />
                  <button onClick={() => setEditItem(r)} className="text-xs text-gray-400 hover:text-gray-600 px-2">編輯</button>
                  <button onClick={() => removeRequest(r)} className="text-xs text-red-400 hover:text-red-600 px-2">刪除</button>
                </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddMaintenanceModal
          units={allUnits}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); fetchAll(); }}
        />
      )}
      {editItem && (
        <EditMaintenanceModal
          request={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => { setEditItem(null); fetchAll(); }}
        />
      )}
    </div>
  );
}

function AddMaintenanceModal({ units, onClose, onSaved }: {
  units: Array<{ id: string; unitNumber: string; propertyName: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ unitId: '', title: '', description: '', priority: 'MEDIUM' });
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/maintenance', form);
    onSaved();
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">新增報修</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">車位</label>
            <select className="input" value={form.unitId} onChange={e => setForm({ ...form, unitId: e.target.value })} required>
              <option value="">請選擇</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.unitNumber} — {u.propertyName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">報修項目</label>
            <input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">說明</label>
            <textarea className="input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">優先級</label>
            <select className="input" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
              <option value="HIGH">高</option>
              <option value="MEDIUM">中</option>
              <option value="LOW">低</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
            <button type="submit" className="btn-primary flex-1">新增</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditMaintenanceModal({ request, onClose, onSaved }: {
  request: MaintenanceRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ status: request.status, notes: request.notes ?? '', cost: request.cost ? String(request.cost) : '' });
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await api.put(`/maintenance/${request.id}`, form);
    onSaved();
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">更新報修</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">狀態</label>
            <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as MaintenanceRequest['status'] })}>
              <option value="PENDING">待處理</option>
              <option value="IN_PROGRESS">處理中</option>
              <option value="COMPLETED">已完成</option>
              <option value="CANCELLED">已取消</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">費用</label>
            <input type="number" className="input" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">備註</label>
            <textarea className="input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
            <button type="submit" className="btn-primary flex-1">更新</button>
          </div>
        </form>
      </div>
    </div>
  );
}
