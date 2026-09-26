import { useEffect, useState } from 'react';
import { X, Plus, Camera, Send, CheckCircle2, Trash2, ClipboardCheck } from 'lucide-react';
import api from '../api/client';
import { Contract } from '../types';

interface Item {
  id: string;
  area: string;
  description: string;
  condition: 'GOOD' | 'WORN' | 'DAMAGED';
  photos: string[]; // base64 or /uploads path
  deductAmount?: number;
}
interface Handover {
  id: string;
  type: 'MOVE_IN' | 'MOVE_OUT';
  status: 'DRAFT' | 'PENDING_TENANT' | 'CONFIRMED';
  items: Item[];
  meterReadings?: { electricity?: string; water?: string; gas?: string };
  note?: string;
  tenantSignedAt?: string;
  signerName?: string;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = { MOVE_IN: '承租點交', MOVE_OUT: '退租點交' };
const STATUS_LABEL: Record<string, string> = { DRAFT: '草稿', PENDING_TENANT: '待車主確認', CONFIRMED: '已確認' };
const STATUS_CLASS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-500',
  PENDING_TENANT: 'bg-amber-100 text-amber-600',
  CONFIRMED: 'bg-green-100 text-green-600',
};
const COND_LABEL: Record<string, string> = { GOOD: '良好', WORN: '正常使用痕跡', DAMAGED: '損壞' };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function HandoverModal({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const r = await api.get(`/contracts/${contract.id}/handovers`);
    setHandovers(r.data);
    setLoading(false);
  }

  async function sendForConfirm(id: string) {
    await api.post(`/handovers/${id}/send`);
    fetchData();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-lg flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-brand" />點交相冊</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-gray-400 mb-4">{contract.unit?.property?.name} {contract.unit?.unitNumber} · {contract.tenant?.name}</p>

        {creating ? (
          <CreateForm
            contractId={contract.id}
            onCancel={() => setCreating(false)}
            onSaved={() => { setCreating(false); fetchData(); }}
          />
        ) : (
          <>
            <button onClick={() => setCreating(true)} className="btn-primary text-sm flex items-center gap-1 mb-4">
              <Plus className="w-4 h-4" />新增點交
            </button>

            {loading ? (
              <div className="text-center py-8 text-gray-400 text-sm">載入中...</div>
            ) : handovers.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">尚無點交紀錄。承租、退租時建立點交相冊可避免押金糾紛。</div>
            ) : (
              <div className="space-y-3">
                {handovers.map((h) => (
                  <div key={h.id} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{TYPE_LABEL[h.type]}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CLASS[h.status]}`}>{STATUS_LABEL[h.status]}</span>
                      </div>
                      <span className="text-xs text-gray-400">{new Date(h.createdAt).toLocaleDateString('zh-TW')}</span>
                    </div>

                    {h.items?.length > 0 && (
                      <div className="space-y-1.5 mb-2">
                        {h.items.map((it) => (
                          <div key={it.id} className="bg-warm rounded-lg px-2.5 py-2">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-medium text-gray-700">{it.area}</span>
                              <span className="text-gray-500">{it.description}</span>
                              <span className={`ml-auto ${it.condition === 'DAMAGED' ? 'text-red-500' : 'text-gray-400'}`}>{COND_LABEL[it.condition]}</span>
                              {it.deductAmount ? <span className="text-red-500">扣 NT${it.deductAmount.toLocaleString()}</span> : null}
                            </div>
                            {it.photos?.length > 0 && (
                              <div className="flex gap-1 mt-1.5 flex-wrap">
                                {it.photos.map((p, i) => (
                                  <img key={i} src={p} alt="" className="w-12 h-12 object-cover rounded-md border border-gray-200" />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {h.meterReadings && (h.meterReadings.electricity || h.meterReadings.water || h.meterReadings.gas) && (
                      <div className="text-xs text-gray-500 mb-2">
                        水電錶：電 {h.meterReadings.electricity || '—'} · 水 {h.meterReadings.water || '—'} · 瓦斯 {h.meterReadings.gas || '—'}
                      </div>
                    )}

                    {h.status === 'CONFIRMED' ? (
                      <div className="flex items-center gap-1.5 text-xs text-green-600">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {h.signerName} 已於 {h.tenantSignedAt && new Date(h.tenantSignedAt).toLocaleDateString('zh-TW')} 確認
                      </div>
                    ) : (
                      <button onClick={() => sendForConfirm(h.id)} className="btn-secondary text-xs flex items-center gap-1">
                        <Send className="w-3.5 h-3.5" />{h.status === 'PENDING_TENANT' ? '重新發送確認' : '送車主確認'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CreateForm({ contractId, onCancel, onSaved }: { contractId: string; onCancel: () => void; onSaved: () => void }) {
  const [type, setType] = useState<'MOVE_IN' | 'MOVE_OUT'>('MOVE_IN');
  const [items, setItems] = useState<Item[]>([{ id: crypto.randomUUID(), area: '', description: '', condition: 'GOOD', photos: [] }]);
  const [meter, setMeter] = useState({ electricity: '', water: '', gas: '' });
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  function updateItem(id: string, patch: Partial<Item>) {
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  async function addPhotos(id: string, files: FileList | null) {
    if (!files) return;
    const b64 = await Promise.all(Array.from(files).slice(0, 8).map(fileToBase64));
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, photos: [...it.photos, ...b64].slice(0, 8) } : it)));
  }

  async function submit() {
    setSaving(true);
    try {
      await api.post(`/contracts/${contractId}/handovers`, {
        type,
        items: items.filter((it) => it.area || it.description || it.photos.length),
        meterReadings: meter,
        note,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1">點交類型</label>
        <div className="grid grid-cols-2 gap-2">
          {(['MOVE_IN', 'MOVE_OUT'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`py-2 rounded-xl text-sm font-medium border transition-colors ${type === t ? 'bg-brand text-white border-brand' : 'border-gray-200 text-gray-500'}`}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">點交項目</label>
        {items.map((it) => (
          <div key={it.id} className="border border-gray-100 rounded-xl p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input className="input text-sm" placeholder="區域（如：客廳）" value={it.area} onChange={(e) => updateItem(it.id, { area: e.target.value })} />
              <select className="input text-sm" value={it.condition} onChange={(e) => updateItem(it.id, { condition: e.target.value as Item['condition'] })}>
                <option value="GOOD">良好</option>
                <option value="WORN">正常使用痕跡</option>
                <option value="DAMAGED">損壞</option>
              </select>
            </div>
            <input className="input text-sm" placeholder="物件 / 狀況描述" value={it.description} onChange={(e) => updateItem(it.id, { description: e.target.value })} />
            {type === 'MOVE_OUT' && it.condition === 'DAMAGED' && (
              <input type="number" className="input text-sm" placeholder="扣押金金額（選填）" value={it.deductAmount ?? ''} onChange={(e) => updateItem(it.id, { deductAmount: e.target.value ? Number(e.target.value) : undefined })} />
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {it.photos.map((p, i) => <img key={i} src={p} alt="" className="w-12 h-12 object-cover rounded-md border border-gray-200" />)}
              <label className="w-12 h-12 rounded-md border border-dashed border-gray-300 flex items-center justify-center cursor-pointer text-gray-400 hover:border-brand">
                <Camera className="w-4 h-4" />
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(it.id, e.target.files)} />
              </label>
              {items.length > 1 && (
                <button onClick={() => setItems((arr) => arr.filter((x) => x.id !== it.id))} className="ml-auto text-gray-300 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          onClick={() => setItems((arr) => [...arr, { id: crypto.randomUUID(), area: '', description: '', condition: 'GOOD', photos: [] }])}
          className="text-xs text-brand flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />新增項目
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">水電錶讀數</label>
        <div className="grid grid-cols-3 gap-2">
          <input className="input text-sm" placeholder="電錶" value={meter.electricity} onChange={(e) => setMeter({ ...meter, electricity: e.target.value })} />
          <input className="input text-sm" placeholder="水錶" value={meter.water} onChange={(e) => setMeter({ ...meter, water: e.target.value })} />
          <input className="input text-sm" placeholder="瓦斯" value={meter.gas} onChange={(e) => setMeter({ ...meter, gas: e.target.value })} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">備註</label>
        <textarea className="input text-sm" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">取消</button>
        <button type="button" onClick={submit} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">{saving ? '儲存中...' : '建立點交'}</button>
      </div>
    </div>
  );
}
