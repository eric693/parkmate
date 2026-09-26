import { useEffect, useState } from 'react';
import { X, Plus, Search, MessageCircle, Phone, Mail, Home, CheckCircle2, History, Gauge, Users, Car } from 'lucide-react';
import api from '../api/client';
import { Tenant, Property, Contract, RentRecord } from '../types';
import HowTo from '../components/HowTo';
import VehicleForm, { VehicleLike, VEHICLE_TYPE } from '../components/VehicleForm';

type FilterType = 'all' | 'active' | 'no_contract' | 'line_bound';

interface CreditOverview {
  tenantId: string;
  score: number;
  grade: string;
  onTimeRate: number;
  totalRecords: number;
  crossLandlord: boolean;
}
const GRADE_CLASS: Record<string, string> = {
  'A+': 'bg-green-100 text-green-700',
  A: 'bg-green-100 text-green-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-amber-100 text-amber-700',
  D: 'bg-red-100 text-red-600',
};

export default function Tenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [historyTenant, setHistoryTenant] = useState<Tenant | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [vehicleForm, setVehicleForm] = useState<{ tenantId: string; vehicle?: VehicleLike } | null>(null);
  const [creditTenant, setCreditTenant] = useState<Tenant | null>(null);
  const [credits, setCredits] = useState<Record<string, CreditOverview>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [t, p, c, cr] = await Promise.all([
      api.get('/tenants'),
      api.get('/properties'),
      api.get('/contracts'),
      api.get('/tenant-credit'),
    ]);
    setTenants(t.data);
    setProperties(p.data);
    setContracts(c.data);
    setCredits(Object.fromEntries((cr.data as CreditOverview[]).map((x) => [x.tenantId, x])));
    setLoading(false);
  }

  async function removeVehicle(v: VehicleLike) {
    if (!confirm(`確定刪除車牌 ${v.plateNumber}？`)) return;
    await api.delete(`/vehicles/${v.id}`);
    fetchAll();
  }

  async function deleteTenant(id: string) {
    if (!confirm('確定要刪除此車主？\n會一併刪除這位車主的合約與租金紀錄，無法復原。')) return;
    await api.delete(`/tenants/${id}`);
    fetchAll();
  }

  const filtered = tenants
    .filter((t) => {
      const hasActive = contracts.some((c) => c.tenantId === t.id && c.status === 'ACTIVE');
      if (filter === 'active') return hasActive;
      if (filter === 'no_contract') return !hasActive;
      if (filter === 'line_bound') return !!t.lineUserId;
      return true;
    })
    .filter((t) => {
      if (!search) return true;
      return t.name.includes(search) || t.phone.includes(search) || (t.email ?? '').includes(search) || (t.vehicles ?? []).some((v) => v.plateNumber.includes(search.toUpperCase().replace(/\s/g, '')));
    });

  const filterCounts = {
    all: tenants.length,
    active: tenants.filter((t) => contracts.some((c) => c.tenantId === t.id && c.status === 'ACTIVE')).length,
    no_contract: tenants.filter((t) => !contracts.some((c) => c.tenantId === t.id && c.status === 'ACTIVE')).length,
    line_bound: tenants.filter((t) => !!t.lineUserId).length,
  };

  const allUnits = properties.flatMap((p) => p.units);

  return (
    <div className="px-6 py-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">車主管理</h1>
          <p className="text-xs text-gray-400 mt-0.5">共 {tenants.length} 位車主</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" />新增車主
        </button>
      </div>

      <HowTo module="tenants" />

      {/* Filters + Search */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100">
          {([
            { key: 'all', label: '全部' },
            { key: 'active', label: '承租中' },
            { key: 'no_contract', label: '無合約' },
            { key: 'line_bound', label: 'LINE 已綁定' },
          ] as const).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f.key ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {f.label} ({filterCounts[f.key]})
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            placeholder="搜尋姓名、電話、Email 或車牌"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-xl pl-8 pr-3 py-2 outline-none focus:border-brand bg-white"
          />
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">載入中...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-12 text-gray-400 text-sm">
          {search ? `找不到「${search}」的相關車主` : '尚無車主，請新增'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((tenant) => {
            const activeContract = contracts.find((c) => c.tenantId === tenant.id && c.status === 'ACTIVE');
            const unit = activeContract ? allUnits.find((u) => u.id === activeContract.unitId) : null;
            const property = unit ? properties.find((p) => p.id === unit.propertyId) : null;

            return (
              <div key={tenant.id} className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-brand font-bold text-sm">{tenant.name.charAt(0)}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">{tenant.name}</span>
                        {tenant.lineUserId && (
                          <span className="flex items-center gap-0.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />LINE
                          </span>
                        )}
                        {credits[tenant.id] && credits[tenant.id].totalRecords > 0 && (
                          <button
                            onClick={() => setCreditTenant(tenant)}
                            className={`flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full ${GRADE_CLASS[credits[tenant.id].grade] ?? 'bg-gray-100 text-gray-500'}`}
                          >
                            <Gauge className="w-3 h-3" />信用 {credits[tenant.id].grade}
                            {credits[tenant.id].crossLandlord && <Users className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                        <Phone className="w-3 h-3" />{tenant.phone}
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${activeContract ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {activeContract ? '承租中' : '無合約'}
                  </span>
                </div>

                {tenant.email && (
                  <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
                    <Mail className="w-3 h-3" />{tenant.email}
                  </div>
                )}

                {activeContract && unit && property && (
                  <div className="flex items-center gap-1 text-xs text-gray-500 mb-2 bg-warm rounded-lg px-3 py-1.5">
                    <Home className="w-3 h-3 text-brand" />
                    <span>{property.name} — 車位編號 {unit.unitNumber}</span>
                    <span className="ml-auto text-gray-400">
                      到期：{new Date(activeContract.endDate).toLocaleDateString('zh-TW')}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  <Car className="w-3.5 h-3.5 text-gray-400" />
                  {(tenant.vehicles ?? []).map((v) => (
                    <span key={v.id} className="inline-flex items-center gap-1 text-xs bg-gray-50 border border-gray-100 rounded-lg px-2 py-0.5">
                      <button onClick={() => setVehicleForm({ tenantId: tenant.id, vehicle: v })} className="font-semibold tracking-wide text-gray-700 hover:text-brand">
                        {v.plateNumber}
                      </button>
                      <span className="text-gray-400">{VEHICLE_TYPE[v.type]}</span>
                      <button onClick={() => removeVehicle(v)} className="text-gray-300 hover:text-red-500" aria-label="刪除車輛">×</button>
                    </span>
                  ))}
                  <button onClick={() => setVehicleForm({ tenantId: tenant.id })} className="text-xs text-brand hover:underline">+ 車輛</button>
                </div>

                {tenant.lineDisplayName && (
                  <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
                    <MessageCircle className="w-3 h-3 text-green-500" />LINE：{tenant.lineDisplayName}
                  </div>
                )}

                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                  <button
                    onClick={() => setHistoryTenant(tenant)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:border-brand hover:text-brand transition-colors"
                  >
                    <History className="w-3.5 h-3.5" />繳費紀錄
                  </button>
                  <button
                    onClick={() => setEditTenant(tenant)}
                    className="flex-1 text-xs text-center py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:border-brand hover:text-brand transition-colors"
                  >
                    編輯
                  </button>
                  <button
                    onClick={() => deleteTenant(tenant.id)}
                    className="text-xs px-3 py-1.5 border border-red-100 rounded-lg text-red-400 hover:bg-red-50 transition-colors"
                  >
                    刪除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {vehicleForm && (
        <VehicleForm
          tenantId={vehicleForm.tenantId}
          vehicle={vehicleForm.vehicle}
          onClose={() => setVehicleForm(null)}
          onSaved={() => { setVehicleForm(null); fetchAll(); }}
        />
      )}
      {showAdd && <TenantModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); fetchAll(); }} />}
      {editTenant && <TenantModal tenant={editTenant} onClose={() => setEditTenant(null)} onSaved={() => { setEditTenant(null); fetchAll(); }} />}
      {historyTenant && <TenantHistoryDrawer tenant={historyTenant} onClose={() => setHistoryTenant(null)} />}
      {creditTenant && <CreditModal tenant={creditTenant} onClose={() => setCreditTenant(null)} />}
    </div>
  );
}

function CreditModal({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const [data, setData] = useState<{
    score: number; grade: string; onTimeRate: number; avgDelayDays: number;
    totalRecords: number; crossLandlord: boolean;
    breakdown: { onTime: number; late: number; overdue: number; partial: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/tenants/${tenant.id}/credit`).then((r) => { setData(r.data); setLoading(false); });
  }, [tenant.id]);

  const scoreColor = (s: number) => (s >= 740 ? 'text-green-500' : s >= 670 ? 'text-blue-500' : s >= 580 ? 'text-amber-500' : 'text-red-500');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2"><Gauge className="w-5 h-5 text-brand" />車主信用分</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-gray-400 mb-4">{tenant.name}</p>

        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">計算中...</div>
        ) : data && (
          <>
            <div className="flex items-center gap-4 bg-warm rounded-2xl p-4 mb-4">
              <div className="text-center">
                <div className={`text-4xl font-bold ${scoreColor(data.score)}`}>{data.score}</div>
                <div className={`text-xs font-semibold mt-0.5 inline-block px-2 py-0.5 rounded-full ${GRADE_CLASS[data.grade] ?? 'bg-gray-100 text-gray-500'}`}>等級 {data.grade}</div>
              </div>
              <div className="flex-1 text-xs text-gray-600 space-y-1">
                <div className="flex justify-between"><span className="text-gray-400">準時繳納率</span><span className="font-medium">{Math.round(data.onTimeRate * 100)}%</span></div>
                <div className="flex justify-between"><span className="text-gray-400">平均逾期</span><span className="font-medium">{data.avgDelayDays.toFixed(1)} 天</span></div>
                <div className="flex justify-between"><span className="text-gray-400">納入紀錄</span><span className="font-medium">{data.totalRecords} 筆</span></div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4 text-center">
              <div><div className="text-lg font-bold text-green-500">{data.breakdown.onTime}</div><div className="text-xs text-gray-400">準時</div></div>
              <div><div className="text-lg font-bold text-amber-500">{data.breakdown.late}</div><div className="text-xs text-gray-400">遲繳</div></div>
              <div><div className="text-lg font-bold text-orange-500">{data.breakdown.partial}</div><div className="text-xs text-gray-400">部分</div></div>
              <div><div className="text-lg font-bold text-red-500">{data.breakdown.overdue}</div><div className="text-xs text-gray-400">逾期</div></div>
            </div>

            {data.crossLandlord && (
              <div className="flex items-center gap-1.5 text-xs text-brand bg-brand/5 rounded-lg px-3 py-2">
                <Users className="w-3.5 h-3.5" />此分數已整合該車主在多位業者的繳租歷史
              </div>
            )}
            {data.totalRecords === 0 && (
              <div className="text-xs text-gray-400 text-center">尚無已到期的繳費紀錄，分數為中性基準。</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TenantModal({ tenant, onClose, onSaved }: {
  tenant?: Tenant;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!tenant;
  const [form, setForm] = useState({
    name: tenant?.name ?? '',
    phone: tenant?.phone ?? '',
    email: tenant?.email ?? '',
    idNumber: tenant?.idNumber ?? '',
    emergencyContact: tenant?.emergencyContact ?? '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isEdit) {
      await api.put(`/tenants/${tenant!.id}`, form);
    } else {
      await api.post('/tenants', form);
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">{isEdit ? '編輯車主' : '新增車主'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">姓名 <span className="text-red-400">*</span></label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">電話 <span className="text-red-400">*</span></label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">身分證號</label>
            <input className="input" value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">緊急聯絡人</label>
            <input className="input" value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} placeholder="姓名 / 關係 / 電話" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
            <button type="submit" className="btn-primary flex-1">{isEdit ? '儲存' : '新增'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TenantHistoryDrawer({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const [records, setRecords] = useState<RentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/rent-records').then((r) => {
      const filtered = r.data.filter((rec: RentRecord) =>
        rec.contract?.tenant?.id === tenant.id || rec.contract?.tenantId === tenant.id
      );
      setRecords(filtered.sort((a: RentRecord, b: RentRecord) => {
        if (b.year !== a.year) return b.year - a.year;
        return b.month - a.month;
      }));
      setLoading(false);
    });
  }, [tenant.id]);

  const statusLabel = (s: string) => ({ PAID: '已繳', PENDING: '待繳', OVERDUE: '逾期', PARTIAL: '部分' }[s] ?? s);
  const statusClass = (s: string) => ({
    PAID: 'bg-green-100 text-green-700',
    PENDING: 'bg-blue-50 text-blue-600',
    OVERDUE: 'bg-red-100 text-red-600',
    PARTIAL: 'bg-orange-100 text-orange-600',
  }[s] ?? 'bg-gray-100 text-gray-500');

  const totalPaid = records.filter(r => r.status === 'PAID').reduce((s, r) => s + Number(r.paidAmount ?? r.amount), 0);
  const totalOverdue = records.filter(r => r.status === 'OVERDUE').reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-lg text-gray-800">{tenant.name}</h3>
            <p className="text-xs text-gray-400">繳租歷史記錄</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 px-5 py-3 border-b border-gray-100">
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-0.5">總記錄</div>
            <div className="font-bold text-gray-800">{records.length} 筆</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-0.5">累計已繳</div>
            <div className="font-bold text-brand">NT${totalPaid.toLocaleString()}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-0.5">欠款</div>
            <div className={`font-bold ${totalOverdue > 0 ? 'text-red-500' : 'text-gray-500'}`}>
              NT${totalOverdue.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Records list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">載入中...</div>
          ) : records.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">尚無繳租記錄</div>
          ) : (
            <div className="space-y-2">
              {records.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5 border-b border-gray-50">
                  <div>
                    <div className="text-sm font-medium text-gray-700">
                      {r.year} 年 {r.month} 月
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {r.contract?.unit?.unitNumber && `車位編號 ${r.contract.unit.unitNumber} · `}
                      到期 {new Date(r.dueDate).toLocaleDateString('zh-TW')}
                    </div>
                    {r.paidDate && (
                      <div className="text-xs text-gray-400">
                        繳納 {new Date(r.paidDate).toLocaleDateString('zh-TW')}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-700">
                      NT${Number(r.status === 'PAID' ? (r.paidAmount ?? r.amount) : r.amount).toLocaleString()}
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusClass(r.status)}`}>
                      {statusLabel(r.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
