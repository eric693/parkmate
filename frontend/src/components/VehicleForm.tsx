import { useState } from 'react';
import { X } from 'lucide-react';
import api from '../api/client';

export interface VehicleLike {
  id: string;
  plateNumber: string;
  type: 'CAR' | 'MOTORCYCLE' | 'OTHER';
  brand?: string | null;
  color?: string | null;
  notes?: string | null;
}

export const VEHICLE_TYPE = { CAR: '汽車', MOTORCYCLE: '機車', OTHER: '其他' } as const;

/** 新增／編輯車輛。新增需給 tenants（選車主）或 tenantId（固定車主） */
export default function VehicleForm({ vehicle, tenantId, tenants, onClose, onSaved }: {
  vehicle?: VehicleLike;
  tenantId?: string;
  tenants?: { id: string; name: string; phone: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    tenantId: tenantId ?? tenants?.[0]?.id ?? '',
    plateNumber: vehicle?.plateNumber ?? '',
    type: vehicle?.type ?? 'CAR',
    brand: vehicle?.brand ?? '',
    color: vehicle?.color ?? '',
    notes: vehicle?.notes ?? '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (vehicle) await api.put(`/vehicles/${vehicle.id}`, f);
      else await api.post(`/tenants/${f.tenantId}/vehicles`, f);
      onSaved();
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">{vehicle ? '編輯車輛' : '新增車輛'}</h2>
          <button type="button" onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          {!vehicle && !tenantId && (
            <label className="block text-xs text-gray-500">車主
              <select className="input mt-1" value={f.tenantId} onChange={(e) => set('tenantId', e.target.value)} required>
                {(tenants ?? []).length === 0 && <option value="">請先到「車主」新增車主</option>}
                {(tenants ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}・{t.phone}</option>)}
              </select>
            </label>
          )}
          <label className="block text-xs text-gray-500">車牌 *
            <input
              className="input mt-1 uppercase tracking-wider"
              autoCapitalize="characters"
              placeholder="ABC-1234"
              value={f.plateNumber}
              onChange={(e) => set('plateNumber', e.target.value.toUpperCase())}
              required
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(VEHICLE_TYPE) as VehicleLike['type'][]).map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => set('type', k)}
                className={`text-sm rounded-lg py-1.5 border ${f.type === k ? 'bg-brand text-white border-brand' : 'border-gray-200 text-gray-600'}`}
              >
                {VEHICLE_TYPE[k]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-gray-500">廠牌／車型
              <input className="input mt-1" value={f.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Toyota Altis" />
            </label>
            <label className="block text-xs text-gray-500">顏色
              <input className="input mt-1" value={f.color} onChange={(e) => set('color', e.target.value)} placeholder="白" />
            </label>
          </div>
          <label className="block text-xs text-gray-500">備註
            <input className="input mt-1" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
          </label>
          {error && <div className="text-xs text-red-500">{error}</div>}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button type="button" onClick={onClose} className="flex-1 text-sm border border-gray-200 rounded-xl py-2">取消</button>
          <button type="submit" disabled={saving || (!vehicle && !f.tenantId)} className="flex-1 text-sm bg-brand text-white rounded-xl py-2 font-medium disabled:opacity-50">
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </form>
    </div>
  );
}
