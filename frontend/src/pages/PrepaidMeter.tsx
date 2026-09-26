import { useEffect, useState } from 'react';
import {
  Zap, Plus, RefreshCw, X, Settings2, AlertTriangle, CalendarClock, History, Check, Pencil, Trash2,
} from 'lucide-react';
import api from '../api/client';
import HowTo from '../components/HowTo';
import SearchBox, { matches } from '../components/SearchBox';
import PrepaidRecordForm from '../components/PrepaidRecordForm';

interface PrepaidUnit {
  unitId: string;
  unitNumber: string;
  propertyName: string;
  tenantName: string | null;
  balance: number;
  threshold: number;
  unitPrice: number | null;
  avgDailySpend: number | null;
  daysLeft: number | null;
  depletionDate: string | null;
  low: boolean;
  alertedAt: string | null;
}

interface Candidate {
  unitId: string;
  unitNumber: string;
  propertyName: string;
  prepaidEnabled: boolean;
  balance: number;
  unitPrice: number | null;
}

export default function PrepaidMeter() {
  const [units, setUnits] = useState<PrepaidUnit[]>([]);
  const [threshold, setThreshold] = useState(300);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [action, setAction] = useState<{ unit: PrepaidUnit; mode: 'topup' | 'usage' } | null>(null);
  const [history, setHistory] = useState<PrepaidUnit | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'LOW' | 'SOON'>('ALL');

  async function fetchData() {
    setLoading(true);
    try {
      const { data } = await api.get('/prepaid');
      setUnits(data.units);
      setThreshold(data.threshold);
    } catch {
      /* 失敗時維持既有畫面 */
    }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  const shownUnits = units.filter((u) =>
    (filter === 'ALL' || (filter === 'LOW' ? u.low : u.daysLeft != null && u.daysLeft <= 7))
    && matches(search, u.propertyName, u.unitNumber, u.tenantName));

  async function runCheck() {
    setChecking(true);
    try {
      const { data } = await api.post('/prepaid/check');
      showToast(data.message);
      fetchData();
    } catch { showToast('巡檢失敗，請稍後再試'); }
    setChecking(false);
  }

  const lowCount = units.filter((u) => u.low).length;

  return (
    <div className="px-6 py-6 max-w-5xl">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-sm px-4 py-2 rounded-xl shadow-lg">{toast}</div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">預付電費</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            儲值制電表的餘額、用量與預估用完日期（告警門檻 NT${threshold.toLocaleString()}）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runCheck}
            disabled={checking}
            className="flex items-center gap-1.5 text-xs text-orange-600 border border-orange-200 rounded-lg px-3 py-1.5 hover:bg-orange-50 transition-colors disabled:opacity-50"
          >
            {checking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            立即巡檢
          </button>
          <button onClick={() => setShowConfig(true)} className="btn-secondary text-sm flex items-center gap-1">
            <Settings2 className="w-4 h-4" />設定電表
          </button>
        </div>
      </div>

      <HowTo module="prepaid" />

      {lowCount > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-700">
            有 <strong>{lowCount}</strong> 間房的電費餘額低於門檻，請通知車主儲值。
          </span>
        </div>
      )}

      {units.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100">
            {([['ALL', '全部'], ['LOW', '餘額不足'], ['SOON', '7 天內用完']] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-3 py-1 rounded-lg text-xs font-medium ${filter === k ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {l}
              </button>
            ))}
          </div>
          <SearchBox value={search} onChange={setSearch} placeholder="搜尋停車場、車位編號、車主" />
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">載入中...</div>
      ) : units.length > 0 && shownUnits.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">沒有符合條件的車位</div>
      ) : units.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <Zap className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <div className="text-gray-400 text-sm">尚未有車位啟用預付電表</div>
          <button onClick={() => setShowConfig(true)} className="btn-primary text-sm mt-4">設定電表</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {shownUnits.map((u) => (
            <div
              key={u.unitId}
              className={`bg-white rounded-2xl border p-4 ${u.low ? 'border-red-200' : 'border-gray-100'}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-semibold text-gray-800 text-sm">
                    {u.propertyName} {u.unitNumber}
                  </div>
                  <div className="text-xs text-gray-400">{u.tenantName ?? '空位'}</div>
                </div>
                {u.low && (
                  <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">餘額不足</span>
                )}
              </div>

              <div className={`text-2xl font-bold mb-1 ${u.low ? 'text-red-600' : 'text-gray-800'}`}>
                NT${u.balance.toLocaleString()}
              </div>

              <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
                <CalendarClock className="w-3.5 h-3.5 text-gray-400" />
                {u.depletionDate ? (
                  <span>預估 {u.depletionDate} 用完（約 {u.daysLeft} 天）</span>
                ) : (
                  <span className="text-gray-300">用電資料不足，尚無法推估</span>
                )}
              </div>

              {u.avgDailySpend !== null && (
                <div className="text-xs text-gray-400 mb-3">
                  日均用電 NT${u.avgDailySpend.toFixed(1)}
                  {u.unitPrice ? ` · 每度 NT$${u.unitPrice}` : ''}
                </div>
              )}

              <div className="flex gap-1.5">
                <button
                  onClick={() => setAction({ unit: u, mode: 'topup' })}
                  className="flex-1 btn-primary text-xs py-1.5 flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />儲值
                </button>
                <button
                  onClick={() => setAction({ unit: u, mode: 'usage' })}
                  className="flex-1 btn-secondary text-xs py-1.5"
                >
                  登錄用電
                </button>
                <button
                  onClick={() => setHistory(u)}
                  className="px-2.5 border border-gray-200 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                  title="流水帳"
                >
                  <History className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showConfig && (
        <ConfigModal
          onClose={() => setShowConfig(false)}
          onSaved={() => { setShowConfig(false); fetchData(); showToast('電表設定已更新'); }}
        />
      )}
      {action && (
        <ActionModal
          unit={action.unit}
          mode={action.mode}
          onClose={() => setAction(null)}
          onDone={(msg) => { setAction(null); fetchData(); showToast(msg); }}
        />
      )}
      {history && <HistoryModal unit={history} onClose={() => setHistory(null)} onChanged={fetchData} />}
    </div>
  );
}

/** 挑選哪些車位走預付電表，並設定每度電價。 */
function ConfigModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/prepaid/candidates').then((r) => setRows(r.data)).catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      await Promise.all(
        rows.map((r) =>
          api.put(`/prepaid/${r.unitId}/config`, {
            prepaidEnabled: r.prepaidEnabled,
            unitPrice: r.unitPrice === null || Number.isNaN(r.unitPrice) ? null : r.unitPrice,
          }),
        ),
      );
      onSaved();
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-lg flex items-center gap-2"><Settings2 className="w-5 h-5 text-brand" />設定預付電表</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          勾選走儲值制的車位。填了每度電價之後，登錄用電可以直接輸入度數自動換算金額。
        </p>

        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={r.unitId} className="flex items-center gap-3 border border-gray-100 rounded-xl px-3 py-2">
              <input
                type="checkbox"
                checked={r.prepaidEnabled}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...r, prepaidEnabled: e.target.checked };
                  setRows(next);
                }}
                className="w-4 h-4 accent-current text-brand"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-700 truncate">{r.propertyName} {r.unitNumber}</div>
                {r.prepaidEnabled && (
                  <div className="text-xs text-gray-400">餘額 NT${r.balance.toLocaleString()}</div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400">每度</span>
                <input
                  type="number"
                  step="0.1"
                  value={r.unitPrice ?? ''}
                  placeholder="—"
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...r, unitPrice: e.target.value === '' ? null : Number(e.target.value) };
                    setRows(next);
                  }}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-16 focus:outline-none focus:border-brand"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">取消</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-1.5 disabled:opacity-50">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}儲存
          </button>
        </div>
      </div>
    </div>
  );
}

/** 儲值或登錄用電。 */
function ActionModal({
  unit, mode, onClose, onDone,
}: { unit: PrepaidUnit; mode: 'topup' | 'usage'; onClose: () => void; onDone: (msg: string) => void }) {
  const [amount, setAmount] = useState('');
  const [kwh, setKwh] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'topup') {
        const { data } = await api.post(`/prepaid/${unit.unitId}/topup`, { amount: Number(amount), note });
        onDone(`已儲值，餘額 NT$${Number(data.balance).toLocaleString()}`);
      } else {
        const { data } = await api.post(`/prepaid/${unit.unitId}/usage`, {
          amount: amount === '' ? undefined : Number(amount),
          kwh: kwh === '' ? undefined : Number(kwh),
          note,
        });
        onDone(`已登錄用電，餘額 NT$${Number(data.balance).toLocaleString()}`);
      }
    } catch (e: any) {
      setError(e?.response?.data?.error ?? '操作失敗，請稍後再試');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-lg">{mode === 'topup' ? '電費儲值' : '登錄用電'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          {unit.propertyName} {unit.unitNumber} · 目前餘額 NT${unit.balance.toLocaleString()}
        </p>

        {mode === 'usage' && (
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">用電度數</label>
            <input
              type="number"
              value={kwh}
              onChange={(e) => setKwh(e.target.value)}
              className="input"
              placeholder={unit.unitPrice ? `每度 NT$${unit.unitPrice}，自動換算金額` : '此車位未設電價，請改填金額'}
              disabled={!unit.unitPrice}
            />
          </div>
        )}

        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {mode === 'topup' ? '儲值金額' : '扣款金額'}
            {mode === 'usage' && <span className="text-xs text-gray-400 font-normal">（填了度數可留空）</span>}
          </label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" placeholder="NT$" />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="選填，例如抄表日期" />
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">取消</button>
          <button onClick={submit} disabled={busy} className="btn-primary flex-1 disabled:opacity-50">
            {busy ? '處理中...' : '確認'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 儲值／用電流水帳。 */
function HistoryModal({ unit, onClose, onChanged }: { unit: PrepaidUnit; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);

  function load() {
    api.get(`/prepaid/${unit.unitId}/records`).then((r) => setData(r.data)).catch(() => {});
  }
  useEffect(load, [unit.unitId]);

  async function remove(r: any) {
    if (!confirm('確定刪除這筆紀錄？之後的餘額與目前餘額會自動重算。')) return;
    await api.delete(`/prepaid-records/${r.id}`);
    load();
    onChanged();
  }

  const LABEL: Record<string, string> = { TOPUP: '儲值', USAGE: '用電', ADJUST: '調整' };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <History className="w-5 h-5 text-brand" />{unit.propertyName} {unit.unitNumber}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {!data ? (
          <div className="text-center py-8 text-gray-400 text-sm">載入中...</div>
        ) : data.records.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">尚無儲值或用電紀錄</div>
        ) : (
          <div className="space-y-1.5">
            {data.records.map((r: any) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-gray-50 py-2 last:border-0">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                    r.type === 'TOPUP' ? 'bg-green-50 text-green-600'
                      : r.type === 'USAGE' ? 'bg-orange-50 text-orange-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {LABEL[r.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-700">
                    {r.type === 'TOPUP' ? '+' : '−'}NT${r.amount.toLocaleString()}
                    {r.kwh ? <span className="text-xs text-gray-400 ml-1">({r.kwh} 度)</span> : null}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {new Date(r.createdAt).toLocaleString('zh-TW')}{r.note ? ` · ${r.note}` : ''}
                  </div>
                </div>
                <div className="text-xs text-gray-400 flex-shrink-0">餘 NT${r.balanceAfter.toLocaleString()}</div>
                <button onClick={() => setEditing(r)} className="p-1 rounded hover:bg-gray-100" aria-label="編輯">
                  <Pencil className="w-3.5 h-3.5 text-gray-400" />
                </button>
                <button onClick={() => remove(r)} className="p-1 rounded hover:bg-red-50" aria-label="刪除">
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}
        {editing && (
          <PrepaidRecordForm
            record={editing}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); load(); onChanged(); }}
          />
        )}
      </div>
    </div>
  );
}
