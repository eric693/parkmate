import { useEffect, useState } from 'react';
import { X, Plus, ListOrdered, Phone, BellRing, ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Property, Tenant, WaitlistEntry } from '../types';
import SearchBox, { matches } from '../components/SearchBox';
import HowTo from '../components/HowTo';
import { SPOT_TYPE_LABEL, VEHICLE_KIND_LABEL } from '../lib/parking';

const STATUS_LABEL: Record<WaitlistEntry['status'], string> = {
  WAITING: '排隊中',
  NOTIFIED: '已通知',
  FULFILLED: '已承租',
  CANCELLED: '已取消',
};
const STATUS_CLASS: Record<WaitlistEntry['status'], string> = {
  WAITING: 'bg-blue-50 text-blue-600',
  NOTIFIED: 'bg-orange-50 text-orange-600',
  FULFILLED: 'bg-green-50 text-green-600',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

type Filter = 'active' | 'done' | 'all';

/** 候補名單：車位滿了先登記，空出時系統依登記順序自動通知第一位符合條件的人。 */
export default function Waitlist() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<WaitlistEntry | 'new' | null>(null);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [w, p, t] = await Promise.all([api.get('/waitlist'), api.get('/properties'), api.get('/tenants')]);
    setEntries(w.data);
    setProperties(p.data);
    setTenants(t.data);
    setLoading(false);
  }

  async function setStatus(e: WaitlistEntry, status: WaitlistEntry['status']) {
    await api.put(`/waitlist/${e.id}`, { status });
    fetchAll();
  }

  async function remove(e: WaitlistEntry) {
    if (!confirm(`確定刪除 ${e.name} 的候補紀錄？`)) return;
    await api.delete(`/waitlist/${e.id}`);
    fetchAll();
  }

  async function notify(e: WaitlistEntry, unitId: string) {
    const { data } = await api.post(`/waitlist/${e.id}/notify`, { unitId });
    setMessage(data.sentToTenant ? `已用 LINE 通知 ${e.name}` : `${e.name} 沒有綁定 LINE，已標記為「已通知」，請電話聯繫 ${e.phone}`);
    fetchAll();
  }

  const active = entries.filter((e) => e.status === 'WAITING' || e.status === 'NOTIFIED');
  // 排隊順位：只算還在排的人，依登記時間
  const rank = new Map(entries.filter((e) => e.status === 'WAITING').map((e, i) => [e.id, i + 1]));
  const shown = entries
    .filter((e) => (filter === 'all' ? true : filter === 'active' ? active.includes(e) : !active.includes(e)))
    .filter((e) => matches(search, e.name, e.phone, e.property?.name, e.notes));

  return (
    <div className="px-6 py-6 max-w-4xl">
      <div className="page-header items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/properties')} className="text-gray-400 hover:text-gray-600" aria-label="返回車位">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">候補名單</h1>
            <p className="text-xs text-gray-400 mt-0.5">車位空出時，依登記順序自動通知第一位條件符合的人（有綁 LINE 直接推播，同時通知您）</p>
          </div>
        </div>
        <button onClick={() => setEditing('new')} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" />登記候補
        </button>
      </div>

      <HowTo module="waitlist" />

      {message && (
        <div className="bg-green-50 text-green-700 text-sm rounded-xl px-4 py-2.5 mb-4 flex items-center justify-between">
          {message}
          <button onClick={() => setMessage('')} className="text-green-500"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100">
          {([['active', `候補中 ${active.length}`], ['done', '已結束'], ['all', '全部']] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === k ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {l}
            </button>
          ))}
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder="搜尋姓名、電話、停車場" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">載入中...</div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-16">
          <ListOrdered className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <div className="text-gray-500 font-medium mb-1">{entries.length === 0 ? '目前沒有人候補' : '沒有符合的候補紀錄'}</div>
          {entries.length === 0 && <div className="text-xs text-gray-400">車位滿了的時候，把想租的人登記在這裡</div>}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((e) => {
            const wants = [
              e.property?.name ?? '任一停車場',
              e.vehicleKind ? VEHICLE_KIND_LABEL[e.vehicleKind] : '',
              e.spotType ? SPOT_TYPE_LABEL[e.spotType] : '',
              e.needCharger ? '需要充電樁' : '',
              e.vehicleHeightCm ? `車高 ${e.vehicleHeightCm} 公分` : '',
            ].filter(Boolean);
            const isActive = e.status === 'WAITING' || e.status === 'NOTIFIED';
            return (
              <div key={e.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {rank.has(e.id) && <span className="text-xs font-bold text-brand bg-brand/10 rounded-full w-6 h-6 flex items-center justify-center">{rank.get(e.id)}</span>}
                    <span className="font-semibold text-gray-800">{e.name}</span>
                    <a href={`tel:${e.phone}`} className="text-xs text-gray-500 flex items-center gap-1 hover:text-brand"><Phone className="w-3 h-3" />{e.phone}</a>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASS[e.status]}`}>{STATUS_LABEL[e.status]}</span>
                    {e.tenant && (
                      <span className="text-xs text-gray-400">{e.tenant.lineBound ? 'LINE 已綁定' : '未綁 LINE'}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">登記 {new Date(e.createdAt).toLocaleDateString('zh-TW')}</div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-2">
                  {wants.map((w) => <span key={w} className="text-xs text-gray-600 bg-warm rounded px-2 py-0.5">{w}</span>)}
                </div>
                {e.notes && <p className="text-xs text-gray-400 mb-2">備註：{e.notes}</p>}

                {e.status === 'NOTIFIED' && (
                  <div className="text-xs text-orange-600 bg-orange-50 rounded-lg px-2.5 py-1.5 mb-2 w-fit">
                    {e.notifiedAt && new Date(e.notifiedAt).toLocaleDateString('zh-TW')} 已通知空位
                    {e.notifiedUnit && `：${e.notifiedUnit.property.name} ${e.notifiedUnit.unitNumber}`}，等待回覆
                  </div>
                )}

                {isActive && e.matchingUnits.length > 0 && (
                  <div className="text-xs mb-2">
                    <span className="text-gray-500">目前符合的空位：</span>
                    <span className="inline-flex flex-wrap gap-1.5 align-middle">
                      {e.matchingUnits.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => confirm(`通知 ${e.name}：${u.propertyName} ${u.unitNumber} 有空位？`) && notify(e, u.id)}
                          className="flex items-center gap-1 border border-brand/30 text-brand rounded-lg px-2 py-0.5 hover:bg-brand/5"
                          title="通知這位候補者"
                        >
                          <BellRing className="w-3 h-3" />{u.propertyName} {u.unitNumber}
                        </button>
                      ))}
                    </span>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  {isActive && (
                    <button onClick={() => setStatus(e, 'FULFILLED')} className="text-xs px-3 py-1.5 border border-green-200 rounded-lg text-green-600 hover:bg-green-50">已承租</button>
                  )}
                  {e.status === 'NOTIFIED' && (
                    <button onClick={() => setStatus(e, 'WAITING')} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50" title="這次不租，保留原本順位">這次不租，繼續排</button>
                  )}
                  {isActive && (
                    <button onClick={() => setStatus(e, 'CANCELLED')} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">取消候補</button>
                  )}
                  {!isActive && (
                    <button onClick={() => setStatus(e, 'WAITING')} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">重新排隊</button>
                  )}
                  <div className="ml-auto flex gap-1">
                    <button onClick={() => setEditing(e)} className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:border-brand hover:text-brand" aria-label="編輯"><Pencil className="w-3 h-3" /></button>
                    <button onClick={() => remove(e)} className="text-xs px-2 py-1.5 border border-red-100 rounded-lg text-red-400 hover:bg-red-50" aria-label="刪除"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <WaitlistForm
          entry={editing === 'new' ? undefined : editing}
          properties={properties}
          tenants={tenants}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchAll(); }}
        />
      )}
    </div>
  );
}

function WaitlistForm({ entry, properties, tenants, onClose, onSaved }: {
  entry?: WaitlistEntry;
  properties: Property[];
  tenants: Tenant[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    tenantId: entry?.tenantId ?? '',
    name: entry?.name ?? '',
    phone: entry?.phone ?? '',
    propertyId: entry?.propertyId ?? '',
    vehicleKind: entry?.vehicleKind ?? '',
    spotType: entry?.spotType ?? '',
    needCharger: entry?.needCharger ?? false,
    vehicleHeightCm: entry?.vehicleHeightCm != null ? String(entry.vehicleHeightCm) : '',
    notes: entry?.notes ?? '',
  });
  const [error, setError] = useState('');
  const set = (k: keyof typeof form, v: string | boolean) => setForm({ ...form, [k]: v });

  // 選了已建檔車主就帶入姓名電話（綁 LINE 的才能自動通知）
  function pickTenant(id: string) {
    const t = tenants.find((x) => x.id === id);
    setForm({ ...form, tenantId: id, name: t?.name ?? form.name, phone: t?.phone ?? form.phone });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (entry) await api.put(`/waitlist/${entry.id}`, form);
      else await api.post('/waitlist', form);
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? '儲存失敗');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">{entry ? '編輯候補' : '登記候補'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">已建檔車主</label>
            <select className="input" value={form.tenantId} onChange={(e) => pickTenant(e.target.value)}>
              <option value="">不是車主／新客人</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.phone}{t.lineUserId ? '（LINE）' : ''}</option>)}
            </select>
            <div className="text-xs text-gray-400 mt-1">有綁 LINE 的車主，空位時會自動收到通知；其他人系統會提醒您打電話</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="block text-sm font-medium mb-1">姓名 <span className="text-red-400">*</span></label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required /></div>
            <div><label className="block text-sm font-medium mb-1">電話 <span className="text-red-400">*</span></label><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} required /></div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">想租的停車場</label>
            <select className="input" value={form.propertyId} onChange={(e) => set('propertyId', e.target.value)}>
              <option value="">任一停車場都可以</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium mb-1">車種</label>
              <select className="input" value={form.vehicleKind} onChange={(e) => set('vehicleKind', e.target.value)}>
                <option value="">不限</option>
                {Object.entries(VEHICLE_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">車位類型</label>
              <select className="input" value={form.spotType} onChange={(e) => set('spotType', e.target.value)}>
                <option value="">不限</option>
                {Object.entries(SPOT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 items-end">
            <div>
              <label className="block text-sm font-medium mb-1">車高（公分）</label>
              <input type="number" min="1" className="input" value={form.vehicleHeightCm} onChange={(e) => set('vehicleHeightCm', e.target.value)} placeholder="比對機械車位限高" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
              <input type="checkbox" className="accent-brand" checked={form.needCharger} onChange={(e) => set('needCharger', e.target.checked)} />
              需要充電樁
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">備註</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="例：只要月租 3,000 以內、想從 11 月開始" />
          </div>
          {error && <div className="text-sm text-red-500">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
            <button type="submit" className="btn-primary flex-1">{entry ? '儲存' : '登記'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
