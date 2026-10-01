import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Car, Bike, KeyRound, Phone } from 'lucide-react';
import api from '../api/client';
import HowTo from '../components/HowTo';
import SearchBox from '../components/SearchBox';
import VehicleForm, { VehicleLike, VEHICLE_TYPE } from '../components/VehicleForm';
import { AttachmentButton } from '../components/AttachmentModal';
import { useAttachmentSummary } from '../lib/attachments';

interface Row extends VehicleLike {
  tenant: { id: string; name: string; phone: string };
  spaces: { contractId: string; property: string; space: string; accessCard: string | null; endDate: string; registered: boolean }[];
  paidThisMonth: boolean;
  overdueCount: number;
}

export default function Vehicles() {
  const [rows, setRows] = useState<Row[]>([]);
  const [tenants, setTenants] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [q, setQ] = useState('');
  const [type, setType] = useState<'ALL' | VehicleLike['type']>('ALL');
  const [status, setStatus] = useState<'ALL' | 'OVERDUE' | 'NOSPACE' | 'NOLICENSE'>('ALL');
  const files = useAttachmentSummary('VEHICLE');
  // 有在租車位卻還沒上傳行照：無法核對車籍，轉租或人頭車時沒有依據
  const lacksLicense = (v: Row) => v.spaces.length > 0 && !files.summary[v.id]?.categories.includes('行照');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<VehicleLike | 'new' | null>(null);

  function load(query = q) {
    setLoading(true);
    api.get(`/vehicles${query ? `?q=${encodeURIComponent(query)}` : ''}`).then((r) => setRows(r.data)).finally(() => setLoading(false));
  }
  useEffect(() => { api.get('/tenants').then((r) => setTenants(r.data)); }, []);
  // 打字停 300ms 才查，車牌可只打一部分
  useEffect(() => { const t = setTimeout(() => load(q), 300); return () => clearTimeout(t); }, [q]);

  async function remove(v: Row) {
    if (!confirm(`確定刪除車牌 ${v.plateNumber}？`)) return;
    await api.delete(`/vehicles/${v.id}`);
    load();
  }

  const shown = rows.filter((r) =>
    (type === 'ALL' || r.type === type)
    && (status === 'ALL' || (status === 'OVERDUE' ? r.overdueCount > 0 : status === 'NOLICENSE' ? lacksLicense(r) : r.spaces.length === 0)));

  return (
    <div className="px-6 py-6 max-w-5xl">
      <div className="page-header items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">車牌查詢</h1>
          <p className="text-xs text-gray-400 mt-0.5">輸入車牌就知道是誰的車、停哪個車位、這個月繳了沒</p>
        </div>
        <button onClick={() => setEditing('new')} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" />新增車輛
        </button>
      </div>

      <HowTo module="vehicles" />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <SearchBox value={q} onChange={setQ} placeholder="輸入車牌（可只打部分）、車主姓名或電話" className="max-w-md" />
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100">
          {([['ALL', '全部'], ['CAR', '汽車'], ['MOTORCYCLE', '機車']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setType(k)} className={`px-3 py-1 rounded-lg text-xs font-medium ${type === k ? 'bg-brand text-white' : 'text-gray-500'}`}>{l}</button>
          ))}
        </div>
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100">
          {([['ALL', '全部'], ['OVERDUE', '有欠費'], ['NOSPACE', '沒有車位'], ['NOLICENSE', '缺行照']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setStatus(k)} className={`px-3 py-1 rounded-lg text-xs font-medium ${status === k ? 'bg-brand text-white' : 'text-gray-500'}`}>{l}</button>
          ))}
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-center text-gray-400 py-16 text-sm">載入中...</div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-16 text-gray-400 text-sm">
          {q ? `查無「${q}」這台車（可能是外來車或尚未登記）` : '尚未登記任何車輛'}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {shown.map((v) => {
            const Icon = v.type === 'MOTORCYCLE' ? Bike : Car;
            return (
              <div key={v.id} className={`bg-white rounded-2xl border p-4 ${v.overdueCount > 0 ? 'border-red-200' : 'border-gray-100'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-brand/10 text-brand flex items-center justify-center"><Icon className="w-5 h-5" /></div>
                    <div>
                      <div className="font-bold text-gray-800 tracking-wider text-lg leading-tight">{v.plateNumber}</div>
                      <div className="text-xs text-gray-400">{VEHICLE_TYPE[v.type]}{v.brand ? `・${v.brand}` : ''}{v.color ? `・${v.color}` : ''}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(v)} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="編輯"><Pencil className="w-4 h-4 text-gray-500" /></button>
                    <button onClick={() => remove(v)} className="p-1.5 rounded-lg hover:bg-red-50" aria-label="刪除"><Trash2 className="w-4 h-4 text-red-400" /></button>
                  </div>
                </div>
                <div className="mt-3 text-sm text-gray-700 flex items-center gap-1.5">
                  {v.tenant.name}
                  <Phone className="w-3.5 h-3.5 text-gray-400 ml-1" /><a href={`tel:${v.tenant.phone}`} className="text-brand text-xs">{v.tenant.phone}</a>
                </div>
                {v.spaces.length === 0 ? (
                  <div className="text-xs text-orange-500 mt-1">目前沒有生效中的月租車位</div>
                ) : v.spaces.map((s) => (
                  <div key={s.contractId} className="text-xs text-gray-500 mt-1 flex items-center gap-1.5 flex-wrap">
                    <span className="bg-warm px-2 py-0.5 rounded-lg text-gray-700">{s.property} {s.space}</span>
                    {s.accessCard && <span className="flex items-center gap-0.5"><KeyRound className="w-3 h-3" />{s.accessCard}</span>}
                    <span>到期 {new Date(s.endDate).toLocaleDateString('zh-TW')}</span>
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div>
                    {v.overdueCount > 0
                      ? <span className="badge-overdue">欠繳 {v.overdueCount} 期</span>
                      : v.paidThisMonth ? <span className="badge-paid">本月已繳</span>
                      : v.spaces.length ? <span className="badge-pending">本月未繳</span> : null}
                  </div>
                  <AttachmentButton
                    entityType="VEHICLE"
                    entityId={v.id}
                    title={`車牌 ${v.plateNumber}・${v.tenant.name}`}
                    count={files.summary[v.id]?.count}
                    missing={lacksLicense(v) ? '行照' : undefined}
                    onChanged={files.refresh}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <VehicleForm
          vehicle={editing === 'new' ? undefined : editing}
          tenants={tenants}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
