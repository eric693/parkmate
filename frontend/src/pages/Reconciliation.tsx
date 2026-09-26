import { useEffect, useState } from 'react';
import { Sparkles, Link2, AlertCircle, CheckCircle2 } from 'lucide-react';
import api from '../api/client';
import HowTo from '../components/HowTo';
import SearchBox, { matches } from '../components/SearchBox';

interface Payment {
  id: string;
  amount: number;
  paidAt: string;
  payerName?: string;
  status: string;
  note?: string;
  contract?: { tenant?: { name: string }; unit?: { unitNumber: string; property?: { name: string } } };
}

interface Suggestion {
  rentRecordId: string;
  score: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reasons: string[];
  tenantName: string;
  property: string;
  unit: string;
  period: string;
  amountDue: number;
  outstanding: number;
}

const CONF_LABEL: Record<string, string> = { HIGH: '高信心', MEDIUM: '中信心', LOW: '低信心' };
const CONF_CLASS: Record<string, string> = {
  HIGH: 'bg-green-50 text-green-600 border-green-200',
  MEDIUM: 'bg-amber-50 text-amber-600 border-amber-200',
  LOW: 'bg-gray-50 text-gray-500 border-gray-200',
};

export default function Reconciliation() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion[]>>({});
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const r = await api.get('/payments/unmatched');
    setPayments(r.data);
    setLoading(false);
  }

  async function loadSuggestions(id: string) {
    if (active === id) { setActive(null); return; }
    setActive(id);
    if (!suggestions[id]) {
      const r = await api.get(`/payments/${id}/suggestions`);
      setSuggestions((s) => ({ ...s, [id]: r.data }));
    }
  }

  async function match(paymentId: string, rentRecordId: string) {
    setBusy(true);
    try {
      await api.post(`/payments/${paymentId}/match`, { rentRecordId });
      setActive(null);
      await fetchData();
    } finally {
      setBusy(false);
    }
  }

  async function removePayment(p: Payment) {
    if (!confirm(`確定刪除這筆 NT$${Number(p.amount).toLocaleString()} 的入帳？（例如重複匯入的資料）`)) return;
    try {
      await api.delete(`/payments/${p.id}`);
      fetchData();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? '刪除失敗');
    }
  }

  const shown = payments.filter((p) =>
    matches(search, p.payerName, p.note, p.amount, p.contract?.tenant?.name, p.contract?.unit?.unitNumber, p.contract?.unit?.property?.name));

  return (
    <div className="px-6 py-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">對帳中心</h1>
        <p className="text-xs text-gray-400 mt-0.5">自動比對付款人、金額與期數，一鍵銷帳</p>
      </div>

      <HowTo module="reconcile" />

      {payments.length > 0 && (
        <div className="mb-4 flex">
          <SearchBox value={search} onChange={setSearch} placeholder="搜尋付款人、金額、車位編號、備註" className="max-w-none" />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">載入中...</div>
      ) : payments.length > 0 && shown.length === 0 ? (
        <div className="card text-center py-8 text-gray-400 text-sm">找不到「{search}」的入帳</div>
      ) : payments.length === 0 ? (
        <div className="card text-center py-12">
          <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <div className="text-gray-500 text-sm">目前沒有待人工處理的入帳，對帳乾淨！</div>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((p) => (
            <div key={p.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-800">NT${Number(p.amount).toLocaleString()}</span>
                    <span className="badge-overdue flex items-center gap-1"><AlertCircle className="w-3 h-3" />待對帳</span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    付款人：{p.payerName || '未提供'} · {new Date(p.paidAt).toLocaleDateString('zh-TW')}
                  </div>
                  {p.contract && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      帳號對應：{p.contract.unit?.property?.name} {p.contract.unit?.unitNumber} {p.contract.tenant?.name}
                    </div>
                  )}
                  {p.note && <div className="text-xs text-gray-400 mt-0.5">{p.note}</div>}
                </div>
                <button
                  onClick={() => loadSuggestions(p.id)}
                  className="btn-secondary text-xs flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5 text-brand" />
                  {active === p.id ? '收合' : '智慧建議'}
                </button>
              </div>
              {p.contract && (
                <div className="flex justify-end mt-1">
                  <button onClick={() => removePayment(p)} className="text-xs text-red-400 hover:text-red-600">刪除這筆入帳</button>
                </div>
              )}

              {active === p.id && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                  {!suggestions[p.id] ? (
                    <div className="text-xs text-gray-400 py-2">分析中...</div>
                  ) : suggestions[p.id].length === 0 ? (
                    <div className="text-xs text-gray-400 py-2">找不到合適的銷帳對象，請至租金管理手動處理。</div>
                  ) : (
                    suggestions[p.id].map((s) => (
                      <div key={s.rentRecordId} className="flex items-center justify-between bg-warm rounded-xl px-3 py-2.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-700">
                              {s.property} {s.unit} {s.tenantName}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full border ${CONF_CLASS[s.confidence]}`}>
                              {CONF_LABEL[s.confidence]}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {s.period} 期 · 未繳 NT${s.outstanding.toLocaleString()} · {s.reasons.join('、')}
                          </div>
                        </div>
                        <button
                          onClick={() => match(p.id, s.rentRecordId)}
                          disabled={busy}
                          className="btn-primary text-xs flex items-center gap-1 flex-shrink-0 disabled:opacity-50"
                        >
                          <Link2 className="w-3.5 h-3.5" />銷帳
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
