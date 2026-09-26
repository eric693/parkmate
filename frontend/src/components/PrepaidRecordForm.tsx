import { useState } from 'react';
import { X } from 'lucide-react';
import api from '../api/client';

export interface PrepaidRecordLike {
  id: string;
  type: 'TOPUP' | 'USAGE' | 'ADJUST';
  amount: number | string;
  kwh?: number | string | null;
  note?: string | null;
}

const TITLE = { TOPUP: '儲值', USAGE: '用電扣款', ADJUST: '餘額調整' };

/**
 * 預付電費流水的新增／編輯。
 * 傳 record = 編輯該筆（之後的餘額會自動重算）；不傳則需給 unitId，新增一筆。
 */
export default function PrepaidRecordForm({
  record, unitId, unitLabel, onClose, onSaved,
}: {
  record?: PrepaidRecordLike;
  unitId?: string;
  unitLabel?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<PrepaidRecordLike['type']>(record?.type ?? 'TOPUP');
  const [amount, setAmount] = useState(record ? String(record.amount) : '');
  const [kwh, setKwh] = useState(record?.kwh != null ? String(record.kwh) : '');
  const [note, setNote] = useState(record?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setSaving(true);
    setError('');
    try {
      if (record) {
        await api.put(`/prepaid-records/${record.id}`, { amount, kwh: type === 'USAGE' ? kwh : undefined, note });
      } else if (type === 'TOPUP') {
        await api.post(`/prepaid/${unitId}/topup`, { amount: Number(amount), note });
      } else if (type === 'USAGE') {
        await api.post(`/prepaid/${unitId}/usage`, {
          amount: amount ? Number(amount) : undefined, kwh: kwh ? Number(kwh) : undefined, note,
        });
      } else {
        await api.post(`/prepaid/${unitId}/adjust`, { amount: Number(amount), note });
      }
      onSaved();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">
            {record ? `編輯${TITLE[record.type]}紀錄` : `新增電費紀錄${unitLabel ? `・${unitLabel}` : ''}`}
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          {!record && (
            <div className="flex gap-1.5">
              {(Object.keys(TITLE) as PrepaidRecordLike['type'][]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 text-xs rounded-lg py-1.5 border ${type === t ? 'bg-brand text-white border-brand' : 'border-gray-200 text-gray-600'}`}
                >
                  {TITLE[t]}
                </button>
              ))}
            </div>
          )}
          <label className="block text-xs text-gray-500">
            金額（元）{type === 'ADJUST' && !record && '，減少請填負數'}
            {type === 'USAGE' && !record && '，或只填度數自動換算'}
            <input type="number" className="input mt-1 w-full" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          {type === 'USAGE' && (
            <label className="block text-xs text-gray-500">度數
              <input type="number" className="input mt-1 w-full" value={kwh} onChange={(e) => setKwh(e.target.value)} />
            </label>
          )}
          <label className="block text-xs text-gray-500">備註
            <input className="input mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {record && <p className="text-xs text-gray-400">修改金額後，這筆之後的餘額與車位目前餘額會自動重算。</p>}
          {error && <div className="text-xs text-red-500">{error}</div>}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 text-sm border border-gray-200 rounded-xl py-2">取消</button>
          <button
            onClick={submit}
            disabled={saving || (!amount && !(type === 'USAGE' && kwh))}
            className="flex-1 text-sm bg-brand text-white rounded-xl py-2 font-medium disabled:opacity-50"
          >
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}
