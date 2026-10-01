import { useEffect, useState } from 'react';
import { X, Plus, Building2, Home, TrendingUp, Users, ListOrdered } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Property, Unit, Tenant, Contract } from '../types';
import HowTo from '../components/HowTo';
import SearchBox, { matches } from '../components/SearchBox';
import { AttachmentButton } from '../components/AttachmentModal';
import { useAttachmentSummary, AttachmentSummary } from '../lib/attachments';
import { SPOT_TYPE_LABEL, VEHICLE_KIND_LABEL, floorInput, unitSpecLabels } from '../lib/parking';
import type { SpotType, VehicleKind } from '../types';

type KindFilter = 'ALL' | VehicleKind | SpotType | 'CHARGER';
const KIND_FILTERS: [KindFilter, string][] = [
  ['ALL', '全部類型'], ['CAR', '汽車位'], ['MOTORCYCLE', '機車位'],
  ['FLAT', '平面'], ['MECHANICAL_UPPER', '機械上層'], ['MECHANICAL_LOWER', '機械下層'], ['CHARGER', '有充電樁'],
];
function matchesKind(u: Unit, k: KindFilter) {
  if (k === 'ALL') return true;
  if (k === 'CHARGER') return !!u.hasCharger;
  if (k === 'CAR' || k === 'MOTORCYCLE') return u.vehicleKind === k;
  return u.spotType === k;
}

export default function Properties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [editUnit, setEditUnit] = useState<Unit | null>(null);
  const [editProperty, setEditProperty] = useState<Property | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VACANT' | 'OCCUPIED'>('ALL');
  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const propertyFiles = useAttachmentSummary('PROPERTY');
  const unitFiles = useAttachmentSummary('UNIT');
  const navigate = useNavigate();

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => {
    if (properties.length > 0 && !selectedProperty) setSelectedProperty(properties[0]);
  }, [properties]);

  async function fetchAll() {
    setLoading(true);
    const [p, c] = await Promise.all([
      api.get('/properties'),
      api.get('/contracts'),
    ]);
    setProperties(p.data);
    setContracts(c.data);
    setLoading(false);
  }

  async function deleteProperty(id: string) {
    if (!confirm('確定刪除此停車場？\n底下所有車位、合約、租金紀錄、支出、水電帳單與報修都會一併刪除，無法復原。')) return;
    await api.delete(`/properties/${id}`);
    setSelectedProperty(null);
    fetchAll();
  }

  // 搜尋：停車場名／地址命中則整棟顯示；否則只留車位編號、類型或車主符合的車位
  const tenantOf = (unitId: string) => contracts.find((c) => c.unitId === unitId && c.status === 'ACTIVE')?.tenant;
  const shownProperties = properties
    .map((p) => {
      const propHit = matches(search, p.name, p.address);
      const units = p.units.filter((u) =>
        (statusFilter === 'ALL' || u.status === statusFilter)
        && matchesKind(u, kindFilter)
        && (propHit || matches(search, u.unitNumber, ...unitSpecLabels(u), tenantOf(u.id)?.name, tenantOf(u.id)?.phone)));
      return { ...p, units };
    })
    .filter((p) => p.units.length > 0 || (statusFilter === 'ALL' && kindFilter === 'ALL' && matches(search, p.name, p.address)));

  // 各類型空位數（有設定規格的車位才統計）
  const allUnits = properties.flatMap((p) => p.units);
  const vacancyByKind = KIND_FILTERS.filter(([k]) => k !== 'ALL')
    .map(([k, label]) => {
      const of = allUnits.filter((u) => matchesKind(u, k));
      return { k, label, total: of.length, vacant: of.filter((u) => u.status === 'VACANT').length };
    })
    .filter((x) => x.total > 0);

  const units = selectedProperty?.units ?? [];
  const totalUnits = properties.reduce((s, p) => s + p.units.length, 0);
  const occupiedUnits = properties.reduce((s, p) => s + p.units.filter((u) => u.status === 'OCCUPIED').length, 0);
  const totalRent = properties.reduce((s, p) => s + p.units.filter((u) => u.status === 'OCCUPIED').reduce((ss, u) => ss + Number(u.monthlyRent), 0), 0);

  return (
    <div className="px-6 py-6 max-w-4xl">
      {/* Header */}
      <div className="page-header items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">車位管理</h1>
          <p className="text-xs text-gray-400 mt-0.5">管理停車場與車位資訊</p>
        </div>
        <button onClick={() => setShowAddProperty(true)} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" />新增停車場
        </button>
      </div>

      <HowTo module="properties" />

      {/* Overall stats */}
      {totalUnits > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-brand" />
              <span className="text-xs text-gray-400">停車場 / 車位</span>
            </div>
            <div className="text-lg font-bold text-gray-800">{properties.length} 棟 / {totalUnits} 間</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Home className="w-4 h-4 text-green-500" />
              <span className="text-xs text-gray-400">出租率</span>
            </div>
            <div className="text-lg font-bold text-gray-800">
              {totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0}%
              <span className="text-xs text-gray-400 font-normal ml-1">{occupiedUnits}/{totalUnits} 間</span>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-gray-400">月收租總額</span>
            </div>
            <div className="text-lg font-bold text-brand">NT${totalRent.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="flex gap-2 mb-5">
        <button onClick={() => navigate('/tenants')} className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:border-brand hover:text-brand transition-colors">
          <Users className="w-3.5 h-3.5" />管理車主
        </button>
        <button onClick={() => navigate('/contracts')} className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:border-brand hover:text-brand transition-colors">
          管理合約
        </button>
        <button onClick={() => navigate('/properties/waitlist')} className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:border-brand hover:text-brand transition-colors">
          <ListOrdered className="w-3.5 h-3.5" />候補名單
        </button>
      </div>

      {vacancyByKind.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3 mb-5">
          <div className="text-xs text-gray-400 mb-2">各類型空位（點選可篩選）</div>
          <div className="flex flex-wrap gap-2">
            {vacancyByKind.map((x) => (
              <button
                key={x.k}
                onClick={() => { setKindFilter(kindFilter === x.k ? 'ALL' : x.k); setStatusFilter('VACANT'); }}
                className={`text-xs rounded-lg px-2.5 py-1.5 border transition-colors ${kindFilter === x.k ? 'border-brand bg-brand/5 text-brand' : 'border-gray-200 text-gray-600 hover:border-brand'}`}
              >
                {x.label} <span className={`font-semibold ${x.vacant > 0 ? 'text-green-600' : 'text-gray-400'}`}>{x.vacant}</span>
                <span className="text-gray-400">/{x.total}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {properties.length > 0 && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100">
            {([['ALL', '全部車位'], ['VACANT', '空位'], ['OCCUPIED', '已出租']] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setStatusFilter(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === k ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {l}
              </button>
            ))}
          </div>
          <select className="input !w-auto text-xs py-1.5" value={kindFilter} onChange={(e) => setKindFilter(e.target.value as KindFilter)}>
            {KIND_FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <SearchBox value={search} onChange={setSearch} placeholder="搜尋停車場、地址、車位編號、車主" />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">載入中...</div>
      ) : properties.length > 0 && shownProperties.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">找不到符合的停車場或車位</div>
      ) : properties.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-16">
          <Building2 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <div className="text-gray-500 font-medium mb-1">尚未建立任何停車場</div>
          <div className="text-xs text-gray-400 mb-4">新增第一個停車場以開始管理您的房源</div>
          <button onClick={() => setShowAddProperty(true)} className="btn-primary text-sm">新增停車場</button>
        </div>
      ) : (
        <div className="space-y-4">
          {shownProperties.map((property) => (
            <PropertyCard
              key={property.id}
              property={property}
              contracts={contracts}
              isSelected={selectedProperty?.id === property.id}
              onSelect={() => setSelectedProperty(property)}
              onDelete={() => deleteProperty(property.id)}
              onEdit={() => setEditProperty(properties.find((p) => p.id === property.id) ?? null)}
              onAddUnit={() => { setSelectedProperty(property); setShowAddUnit(true); }}
              onEditUnit={(unit) => { setSelectedProperty(property); setEditUnit(unit); }}
              onRefresh={fetchAll}
              files={{ property: propertyFiles.summary, units: unitFiles.summary }}
              onFilesChanged={() => { propertyFiles.refresh(); unitFiles.refresh(); }}
            />
          ))}
        </div>
      )}

      {showAddProperty && <AddPropertyModal onClose={() => setShowAddProperty(false)} onSaved={fetchAll} />}
      {editProperty && <AddPropertyModal property={editProperty} onClose={() => setEditProperty(null)} onSaved={fetchAll} />}
      {showAddUnit && selectedProperty && (
        <UnitFormModal
          propertyId={selectedProperty.id}
          onClose={() => setShowAddUnit(false)}
          onSaved={() => { setShowAddUnit(false); fetchAll(); }}
        />
      )}
      {editUnit && (
        <UnitFormModal
          unit={editUnit}
          onClose={() => setEditUnit(null)}
          onSaved={() => { setEditUnit(null); fetchAll(); }}
        />
      )}
    </div>
  );
}

function PropertyCard({
  property, contracts, isSelected, onSelect, onDelete, onEdit, onAddUnit, onEditUnit, onRefresh, files, onFilesChanged
}: {
  files: { property: AttachmentSummary; units: AttachmentSummary };
  onFilesChanged: () => void;
  onEdit: () => void;
  property: Property;
  contracts: Contract[];
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onAddUnit: () => void;
  onEditUnit: (unit: Unit) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const units = property.units;
  const occupied = units.filter((u) => u.status === 'OCCUPIED').length;
  const totalRent = units.filter((u) => u.status === 'OCCUPIED').reduce((s, u) => s + Number(u.monthlyRent), 0);

  async function deleteUnit(unitId: string) {
    if (!confirm('確定刪除此車位？\n這間房的合約、租金紀錄、報修、電費紀錄都會一併刪除，無法復原。')) return;
    await api.delete(`/units/${unitId}`);
    onRefresh();
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Property header */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-5 py-4 cursor-pointer hover:bg-warm/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-[12rem]">
          <div className="w-9 h-9 bg-brand/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Building2 className="w-4 h-4 text-brand" />
          </div>
          <div>
            <div className="font-semibold text-gray-800">{property.name}</div>
            <div className="text-xs text-gray-400 mt-0.5">{property.address}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-right ml-auto">
          <div>
            <div className="text-xs text-gray-400">承租 {occupied}/{units.length} 間</div>
            {totalRent > 0 && <div className="text-xs font-medium text-brand">NT${totalRent.toLocaleString()}/月</div>}
          </div>
          <div className="flex gap-1 items-center">
            <AttachmentButton
              compact
              entityType="PROPERTY"
              entityId={property.id}
              title={`停車場 ${property.name}（場地照片、與地主的租約、平面圖等）`}
              count={files.property[property.id]?.count}
              onChanged={onFilesChanged}
            />
            <button
              onClick={(e) => { e.stopPropagation(); onAddUnit(); }}
              className="whitespace-nowrap text-xs px-2 py-1 bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors"
            >
              + 車位
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="whitespace-nowrap text-xs px-2 py-1 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              編輯
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="whitespace-nowrap text-xs px-2 py-1 text-red-400 border border-red-100 rounded-lg hover:bg-red-50 transition-colors"
            >
              刪除
            </button>
          </div>
          <span className={`text-gray-400 text-sm transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
        </div>
      </div>

      {/* Units */}
      {expanded && (
        <div className="border-t border-gray-100">
          {units.length === 0 ? (
            <div className="px-5 py-6 text-center text-gray-400 text-sm">
              尚無車位，<button onClick={onAddUnit} className="text-brand hover:underline">新增第一間車位</button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {units.map((unit) => {
                const activeContract = contracts.find((c) => c.unitId === unit.id && c.status === 'ACTIVE');
                return (
                  <div key={unit.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 md:px-5 py-3 hover:bg-warm/30 transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-[12rem]">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${unit.status === 'OCCUPIED' ? 'bg-green-400' : 'bg-gray-300'}`} />
                      <div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium text-gray-700 text-sm whitespace-nowrap">{unit.unitNumber}</span>
                          {unitSpecLabels(unit).map((l) => (
                            <span key={l} className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5 whitespace-nowrap">{l}</span>
                          ))}
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${unit.status === 'OCCUPIED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {unit.status === 'OCCUPIED' ? '已出租' : '空位'}
                          </span>
                        </div>
                        {activeContract?.tenant && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            車主：{activeContract.tenant.name} · {activeContract.tenant.phone}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-auto">
                      <div className="text-right whitespace-nowrap">
                        <div className="font-semibold text-gray-700 text-sm">NT${Number(unit.monthlyRent).toLocaleString()}</div>
                        {activeContract && (
                          <div className="text-xs text-gray-400">到期 {new Date(activeContract.endDate).toLocaleDateString('zh-TW')}</div>
                        )}
                      </div>
                      <div className="flex gap-1 items-center">
                        <AttachmentButton
                          compact
                          entityType="UNIT"
                          entityId={unit.id}
                          title={`車位 ${property.name} ${unit.unitNumber}`}
                          count={files.units[unit.id]?.count}
                          onChanged={onFilesChanged}
                        />
                        <button onClick={() => onEditUnit(unit)} className="whitespace-nowrap text-xs px-2 py-1 border border-gray-200 rounded-lg text-gray-500 hover:border-brand hover:text-brand transition-colors">
                          編輯
                        </button>
                        <button onClick={() => deleteUnit(unit.id)} className="whitespace-nowrap text-xs px-2 py-1 border border-red-100 rounded-lg text-red-400 hover:bg-red-50 transition-colors">
                          刪除
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddPropertyModal({ property, onClose, onSaved }: { property?: Property; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: property?.name ?? '', address: property?.address ?? '', description: property?.description ?? '',
  });
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (property) await api.put(`/properties/${property.id}`, form);
    else await api.post('/properties', form);
    onSaved(); onClose();
  }
  return (
    <Modal title={property ? '編輯停車場' : '新增停車場'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div><label className="block text-sm font-medium mb-1">停車場名稱 <span className="text-red-400">*</span></label><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
        <div><label className="block text-sm font-medium mb-1">地址 <span className="text-red-400">*</span></label><input className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} required /></div>
        <div><label className="block text-sm font-medium mb-1">說明</label><textarea className="input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
        <div className="flex gap-2"><button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button><button type="submit" className="btn-primary flex-1">{property ? '儲存' : '新增'}</button></div>
      </form>
    </Modal>
  );
}

/** 新增／編輯車位。編輯時給 unit，新增時給 propertyId。 */
function UnitFormModal({ unit, propertyId, onClose, onSaved }: { unit?: Unit; propertyId?: string; onClose: () => void; onSaved: () => void }) {
  const str = (v: unknown) => (v == null ? '' : String(v));
  const [form, setForm] = useState({
    unitNumber: unit?.unitNumber ?? '',
    floor: floorInput(unit?.floor),
    vehicleKind: unit?.vehicleKind ?? 'CAR',
    spotType: unit?.spotType ?? (unit ? '' : 'FLAT'),
    maxHeightCm: str(unit?.maxHeightCm),
    maxWidthCm: str(unit?.maxWidthCm),
    hasCharger: unit?.hasCharger ?? false,
    monthlyRent: str(unit?.monthlyRent),
    dailyRate: str(unit?.dailyRate),
    weeklyRate: str(unit?.weeklyRate),
    type: unit?.type ?? '',
  });
  const [error, setError] = useState('');
  const set = (k: keyof typeof form, v: string | boolean) => setForm({ ...form, [k]: v });
  const mechanical = form.spotType === 'MECHANICAL_UPPER' || form.spotType === 'MECHANICAL_LOWER';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (unit) await api.put(`/units/${unit.id}`, form);
      else await api.post(`/properties/${propertyId}/units`, form);
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? '儲存失敗');
    }
  }
  return (
    <Modal title={unit ? '編輯車位' : '新增車位'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div><label className="block text-sm font-medium mb-1">車位編號 <span className="text-red-400">*</span></label><input className="input" value={form.unitNumber} onChange={e => set('unitNumber', e.target.value)} required /></div>
          <div>
            <label className="block text-sm font-medium mb-1">樓層</label>
            <input className="input" value={form.floor} onChange={e => set('floor', e.target.value)} placeholder="B1、1、2" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium mb-1">車種</label>
            <select className="input" value={form.vehicleKind} onChange={e => set('vehicleKind', e.target.value)}>
              {Object.entries(VEHICLE_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">車位類型</label>
            <select className="input" value={form.spotType} onChange={e => set('spotType', e.target.value)}>
              <option value="">未設定</option>
              {Object.entries(SPOT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </div>
        {unit?.type && !form.spotType && (
          <div className="text-xs text-gray-400 -mt-1">舊資料的類型文字：「{unit.type}」，請改選上方的車位類型</div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div><label className="block text-sm font-medium mb-1">限高（公分）</label><input type="number" min="1" className="input" value={form.maxHeightCm} onChange={e => set('maxHeightCm', e.target.value)} placeholder={mechanical ? '例：160' : '選填'} /></div>
          <div><label className="block text-sm font-medium mb-1">限寬（公分）</label><input type="number" min="1" className="input" value={form.maxWidthCm} onChange={e => set('maxWidthCm', e.target.value)} placeholder="選填" /></div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" className="accent-brand" checked={form.hasCharger} onChange={e => set('hasCharger', e.target.checked)} />
          有電動車充電樁
        </label>
        <div><label className="block text-sm font-medium mb-1">月租金 <span className="text-red-400">*</span></label><input type="number" className="input" value={form.monthlyRent} onChange={e => set('monthlyRent', e.target.value)} required /></div>
        <div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="block text-sm font-medium mb-1">日租價</label><input type="number" min="0" className="input" value={form.dailyRate} onChange={e => set('dailyRate', e.target.value)} placeholder="選填" /></div>
            <div><label className="block text-sm font-medium mb-1">週租價</label><input type="number" min="0" className="input" value={form.weeklyRate} onChange={e => set('weeklyRate', e.target.value)} placeholder="選填" /></div>
          </div>
          <div className="text-xs text-gray-400 mt-1">開短租合約時用來自動估算總額</div>
        </div>
        {error && <div className="text-sm text-red-500">{error}</div>}
        <div className="flex gap-2"><button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button><button type="submit" className="btn-primary flex-1">{unit ? '儲存' : '新增'}</button></div>
      </form>
    </Modal>
  );
}
