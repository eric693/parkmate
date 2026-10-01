import { useEffect, useState } from 'react';
import { Bell, MessageCircle, Users, UserPlus, Shield, X, Copy, Check, ChevronRight, RefreshCw, Send, Zap, Clock } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import HowTo from '../components/HowTo';
import { FEATURES } from '../lib/features';
import { Link } from 'react-router-dom';

type SettingsTab = 'account' | 'team' | 'notifications';

interface LandlordBinding {
  lineUserId: string | null;
  displayName?: string;
  boundAt?: string;
  bindingCode?: string;
  bindingCodeExpiry?: string;
}

interface TenantBinding {
  id: string;
  name: string;
  phone: string;
  lineUserId: string | null;
  lineDisplayName: string | null;
  lineBoundAt: string | null;
  lineBindingCode: string | null;
  lineBindingCodeExpiry: string | null;
  contracts?: Array<{ unit: { unitNumber: string } }>;
}

const TAB_ITEMS: Array<{ key: SettingsTab; label: string; icon: React.ReactNode }> = [
  { key: 'account', label: '帳號設定', icon: <Bell className="w-4 h-4" /> },
  { key: 'team', label: '團隊成員', icon: <Users className="w-4 h-4" /> },
  { key: 'notifications', label: '通知設定', icon: <Shield className="w-4 h-4" /> },
];

export default function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState<SettingsTab>('account');
  const [landlordBinding, setLandlordBinding] = useState<LandlordBinding>({ lineUserId: null });
  const [tenantBindings, setTenantBindings] = useState<TenantBinding[]>([]);
  const [generatedCode, setGeneratedCode] = useState<{ code: string; expiry: string } | null>(null);
  const [tenantCodes, setTenantCodes] = useState<Record<string, { code: string; expiry: string }>>({});
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [b, t] = await Promise.all([
      api.get('/line/binding'),
      api.get('/line/tenants'),
    ]);
    setLandlordBinding(b.data);
    setTenantBindings(t.data);
    setLoading(false);
  }

  async function generateLandlordCode() {
    const res = await api.post('/line/binding/generate');
    setGeneratedCode({ code: res.data.code, expiry: res.data.expiry });
    fetchAll();
  }

  async function unbindLandlord() {
    if (!confirm('確定要解除 LINE 綁定？')) return;
    await api.delete('/line/binding');
    fetchAll();
  }

  async function generateTenantCode(tenantId: string) {
    const res = await api.post(`/tenants/${tenantId}/line-code`);
    setTenantCodes(prev => ({ ...prev, [tenantId]: { code: res.data.code, expiry: res.data.expiry } }));
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isLandlordBound = landlordBinding.lineUserId && !landlordBinding.lineUserId.startsWith('pending_');

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="page-header items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">設定</h1>
        <Link to="/accounts" className="flex items-center gap-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:border-brand hover:text-brand">
          <Shield className="w-3.5 h-3.5" />帳號權限<ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <HowTo module="settings" />

      {/* Tab navigation */}
      <div className="flex gap-1 bg-white rounded-xl p-1 mb-6 shadow-sm border border-gray-100">
        {TAB_ITEMS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: 帳號設定 */}
      {tab === 'account' && (
        <div className="space-y-4">
          {/* Account Info */}
          <div className="card">
            <h2 className="font-semibold text-gray-700 mb-3">帳號資訊</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                <span className="text-gray-500">姓名</span>
                <span className="font-medium text-gray-800">{user?.name}</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-gray-500">Email</span>
                <span className="font-medium text-gray-800">{user?.email}</span>
              </div>
            </div>
          </div>

          {/* Landlord LINE Binding */}
          <div className="card">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <Bell className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-700">業者 LINE 綁定</h2>
                <p className="text-xs text-gray-400 mt-0.5">綁定後，付款提醒、合約到期提醒與系統通知都會直接送到 LINE</p>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-4 text-gray-400 text-sm">載入中...</div>
            ) : isLandlordBound ? (
              <div className="bg-green-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-green-600 font-medium text-sm">已完成綁定</span>
                </div>
                {landlordBinding.displayName && (
                  <p className="text-sm text-gray-600">LINE 名稱：{landlordBinding.displayName}</p>
                )}
                {landlordBinding.boundAt && (
                  <p className="text-xs text-gray-400 mt-0.5">綁定時間：{new Date(landlordBinding.boundAt).toLocaleString('zh-TW')}</p>
                )}
                <div className="flex gap-2 mt-3">
                  <button onClick={generateLandlordCode} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />重新產生綁定碼
                  </button>
                  <button onClick={unbindLandlord} className="btn-danger text-xs px-3 py-1.5">解除綁定</button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500 mb-3">尚未綁定 LINE，點擊下方按鈕產生綁定碼</p>
                <button onClick={generateLandlordCode} className="btn-primary text-sm w-full">產生綁定碼</button>
              </div>
            )}

            {generatedCode && (
              <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-yellow-800 mb-1">您的綁定碼</p>
                <div className="flex items-center justify-center gap-3 my-3">
                  <div className="text-3xl font-bold tracking-widest text-brand font-mono">{generatedCode.code}</div>
                  <button onClick={() => copyCode(generatedCode.code)} className="p-1.5 rounded-lg bg-white border border-yellow-200 hover:border-brand transition-colors">
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-500" />}
                  </button>
                </div>
                <p className="text-xs text-yellow-700 text-center">請將此綁定碼傳送至 LINE Bot</p>
                <p className="text-xs text-gray-400 text-center mt-1">
                  有效期限：{new Date(generatedCode.expiry).toLocaleString('zh-TW')}
                </p>
                <LineInstructions />
              </div>
            )}
          </div>

          {/* Tenant LINE Bindings */}
          <div className="card">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-700">車主 LINE 綁定</h2>
                <p className="text-xs text-gray-400 mt-0.5">車主先加入 LINE Bot 並輸入邀請碼後，系統會自動配對</p>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-4 text-gray-400 text-sm">載入中...</div>
            ) : tenantBindings.length === 0 ? (
              <div className="text-center py-4 text-gray-400 text-sm">尚無車主</div>
            ) : (
              <div className="space-y-3">
                {tenantBindings.map((t) => {
                  const unitNumber = t.contracts?.[0]?.unit?.unitNumber;
                  const code = tenantCodes[t.id];
                  return (
                    <div key={t.id} className="border border-gray-100 rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{t.name}</span>
                            {unitNumber && <span className="text-xs text-gray-400">{unitNumber}</span>}
                            {t.lineUserId ? (
                              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                <Check className="w-3 h-3" />已綁定
                              </span>
                            ) : (
                              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">尚未綁定</span>
                            )}
                          </div>
                          {t.lineDisplayName && <p className="text-xs text-gray-400 mt-0.5">LINE：{t.lineDisplayName}</p>}
                        </div>
                        {!t.lineUserId && (
                          <button onClick={() => generateTenantCode(t.id)} className="btn-secondary text-xs px-2 py-1 flex items-center gap-1">
                            <UserPlus className="w-3 h-3" />產生邀請碼
                          </button>
                        )}
                      </div>
                      {code && (
                        <div className="mt-2 bg-blue-50 rounded-lg p-2 flex items-center justify-between">
                          <div>
                            <p className="text-xs text-blue-700">邀請碼：<span className="font-bold font-mono text-base tracking-widest">{code.code}</span></p>
                            <p className="text-xs text-gray-400">有效至 {new Date(code.expiry).toLocaleString('zh-TW')}</p>
                          </div>
                          <button onClick={() => copyCode(code.code)} className="p-1 rounded bg-white border border-blue-100">
                            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: 團隊成員 */}
      {tab === 'team' && (
        <TeamMembersTab user={user} tenantCount={tenantBindings.length} />
      )}

      {/* Tab: 通知設定 */}
      {tab === 'notifications' && (
        <NotificationsTab />
      )}
    </div>
  );
}

function TeamMembersTab({ user }: { user: any; tenantCount: number }) {
  const admin = user?.role !== 'STAFF';
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-400 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />目前登入
          </span>
          <span className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full font-medium">{admin ? '管理員' : '員工'}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-bold">{user?.name?.charAt(0)}</span>
          </div>
          <div>
            <div className="font-semibold text-gray-800">{user?.name}</div>
            <div className="text-xs text-gray-400">登入帳號：{user?.email}</div>
          </div>
        </div>
      </div>

      <Link to="/accounts" className="card flex items-center justify-between hover:bg-warm transition-colors">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Users className="w-4 h-4 text-brand" />
            <span className="font-semibold text-gray-700">{admin ? '帳號權限與團隊成員' : '我的帳號'}</span>
          </div>
          <p className="text-xs text-gray-400">
            {admin ? '修改您的名稱、登入帳號（Email）與密碼；新增員工帳號並設定權限' : '修改您的名稱、登入帳號與密碼'}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300" />
      </Link>
    </div>
  );
}

const KIND_DESC: Record<string, { desc: string; audience: string }> = {
  RENT_GENERATE:   { desc: '依進行中的合約產生當月租金單', audience: '不發通知' },
  RENT_DUE:        { desc: '租金到期前與到期當天提醒', audience: '車主' },
  RENT_OVERDUE:    { desc: '標記逾期並持續催繳', audience: '車主' },
  OVERDUE_DIGEST:  { desc: '把所有逾期車位彙整成一則', audience: '業者' },
  CONTRACT_EXPIRY: { desc: '合約到期前提醒續約', audience: '業者 + 車主' },
  PREPAID_LOW:     { desc: '預付電表餘額低於門檻時告警', audience: '業者 + 車主' },
};

interface Rule {
  kind: string;
  label: string;
  enabled: boolean;
  hour: number;
  minute: number;
  daysBefore: number[];
  intervalDays: number | null;
  dayOfMonth: number | null;
  threshold: number | null;
  remindOnDue: boolean;
  lastRunAt: string | null;
}

function NotificationsTab() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.get('/notification-rules')
      .then((r) => setRules(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  function patch(kind: string, changes: Partial<Rule>) {
    setRules((rs) => rs.map((r) => (r.kind === kind ? { ...r, ...changes } : r)));
  }

  async function save(kind: string) {
    const rule = rules.find((r) => r.kind === kind);
    if (!rule) return;
    setBusy(kind);
    try {
      const { data } = await api.put(`/notification-rules/${kind}`, {
        enabled: rule.enabled,
        hour: rule.hour,
        minute: rule.minute,
        daysBefore: rule.daysBefore,
        intervalDays: rule.intervalDays,
        dayOfMonth: rule.dayOfMonth,
        threshold: rule.threshold,
        remindOnDue: rule.remindOnDue,
      });
      patch(kind, data);
      showToast(`「${rule.label}」已儲存`);
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? '儲存失敗，請稍後再試');
    }
    setBusy(null);
  }

  async function trigger(kind: string) {
    setBusy(kind + ':run');
    try {
      const { data } = await api.post(`/notification-rules/${kind}/trigger`);
      showToast(data.message);
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? '執行失敗，請稍後再試');
    }
    setBusy(null);
  }

  function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
      <button
        onClick={() => onChange(!value)}
        className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${value ? 'bg-brand' : 'bg-gray-200'}`}
      >
        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    );
  }

  if (loading) return <div className="text-center py-10 text-gray-400 text-sm">載入中...</div>;

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-sm px-4 py-2 rounded-xl shadow-lg">{toast}</div>
      )}

      <div className="card bg-brand/5 border-brand/20">
        <div className="flex items-center gap-2 mb-1">
          <Bell className="w-4 h-4 text-brand" />
          <span className="text-sm font-semibold text-brand">排程通知</span>
        </div>
        <p className="text-xs text-gray-600 leading-relaxed">
          每種通知的執行時間與參數都可以獨立調整（台北時間），改完按該區塊的「儲存」即生效，
          不必重啟系統。車主須先完成 LINE 綁定才收得到。
        </p>
      </div>

      {rules.filter((rule) => FEATURES.electricity || rule.kind !== 'PREPAID_LOW').map((rule) => {
        const meta = KIND_DESC[rule.kind] ?? { desc: '', audience: '' };
        const isMonthly = rule.kind === 'RENT_GENERATE';
        return (
          <div key={rule.kind} className="card">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-700 text-sm">{rule.label}</h3>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{meta.audience}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{meta.desc}</p>
              </div>
              <Toggle value={rule.enabled} onChange={(v) => patch(rule.kind, { enabled: v })} />
            </div>

            <div className={`space-y-3 ${!rule.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
              {/* 執行時間 */}
              <div className="flex items-center gap-2 flex-wrap border border-gray-100 rounded-xl p-3">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-500">{isMonthly ? '每月' : '每天'}</span>
                {isMonthly && (
                  <>
                    <select
                      value={rule.dayOfMonth ?? 1}
                      onChange={(e) => patch(rule.kind, { dayOfMonth: Number(e.target.value) })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-brand"
                    >
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>{d} 日</option>
                      ))}
                    </select>
                  </>
                )}
                <select
                  value={rule.hour}
                  onChange={(e) => patch(rule.kind, { hour: Number(e.target.value) })}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-brand"
                >
                  {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')} 時</option>
                  ))}
                </select>
                <select
                  value={rule.minute}
                  onChange={(e) => patch(rule.kind, { minute: Number(e.target.value) })}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-brand"
                >
                  {[0, 10, 15, 20, 30, 40, 45, 50].map((m) => (
                    <option key={m} value={m}>{String(m).padStart(2, '0')} 分</option>
                  ))}
                </select>
                <span className="text-sm text-gray-400">執行</span>
              </div>

              {/* 到期前幾天（單選） */}
              {rule.kind === 'RENT_DUE' && (
                <>
                  <div className="flex items-center gap-2 border border-gray-100 rounded-xl p-3">
                    <span className="text-sm text-gray-500">到期前</span>
                    <select
                      value={rule.daysBefore[0] ?? 3}
                      onChange={(e) => patch(rule.kind, { daysBefore: [Number(e.target.value)] })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-brand"
                    >
                      {[1, 2, 3, 5, 7, 10, 14].map((d) => <option key={d} value={d}>{d} 天</option>)}
                    </select>
                    <span className="text-sm text-gray-500">發送提醒</span>
                  </div>
                  <div className="flex items-center justify-between border border-gray-100 rounded-xl p-3">
                    <div>
                      <div className="text-sm font-medium text-gray-700">到期當天再提醒一次</div>
                      <div className="text-xs text-gray-400">到期當天早上再發一則</div>
                    </div>
                    <Toggle value={rule.remindOnDue} onChange={(v) => patch(rule.kind, { remindOnDue: v })} />
                  </div>
                </>
              )}

              {/* 逾期重發間隔 */}
              {rule.kind === 'RENT_OVERDUE' && (
                <div className="flex items-center gap-2 border border-gray-100 rounded-xl p-3">
                  <span className="text-sm text-gray-500">逾期後每</span>
                  <select
                    value={rule.intervalDays ?? 3}
                    onChange={(e) => patch(rule.kind, { intervalDays: Number(e.target.value) })}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-brand"
                  >
                    {[1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d} 天</option>)}
                  </select>
                  <span className="text-sm text-gray-500">重送一次（逾期第 1 天必發）</span>
                </div>
              )}

              {/* 合約到期：多個提前天數 */}
              {rule.kind === 'CONTRACT_EXPIRY' && (
                <div className="border border-gray-100 rounded-xl p-3">
                  <div className="text-sm text-gray-500 mb-2">在到期前這些天數各發一次</div>
                  <div className="flex flex-wrap gap-1.5">
                    {[60, 45, 30, 21, 14, 7, 3, 1].map((d) => {
                      const on = rule.daysBefore.includes(d);
                      return (
                        <button
                          key={d}
                          onClick={() =>
                            patch(rule.kind, {
                              daysBefore: on
                                ? rule.daysBefore.filter((x) => x !== d)
                                : [...rule.daysBefore, d].sort((a, b) => b - a),
                            })
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                            on ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {d} 天
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-orange-500 mt-2">
                    走到最小的那個天數時，合約會自動轉為「已到期」、車位轉為「空位」。
                  </p>
                </div>
              )}

              {/* 預付電費門檻 */}
              {rule.kind === 'PREPAID_LOW' && (
                <div className="flex items-center gap-2 flex-wrap border border-gray-100 rounded-xl p-3">
                  <span className="text-sm text-gray-500">餘額低於</span>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-400">NT$</span>
                    <input
                      type="number"
                      value={rule.threshold ?? 300}
                      onChange={(e) => patch(rule.kind, { threshold: Number(e.target.value) })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-24 focus:outline-none focus:border-brand"
                    />
                  </div>
                  <span className="text-sm text-gray-500">時告警（同一次見底只發一次，儲值回門檻以上才重置）</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => trigger(rule.kind)}
                  disabled={busy === rule.kind + ':run'}
                  className="flex items-center gap-1.5 px-3 py-2 border border-brand text-brand rounded-xl text-sm font-medium hover:bg-brand/5 transition-colors disabled:opacity-50"
                >
                  {busy === rule.kind + ':run' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  立即執行一次
                </button>
                <button
                  onClick={() => save(rule.kind)}
                  disabled={busy === rule.kind}
                  className="flex-1 btn-primary text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {busy === rule.kind ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  儲存
                </button>
              </div>

              {rule.lastRunAt && (
                <p className="text-xs text-gray-300">
                  上次執行：{new Date(rule.lastRunAt).toLocaleString('zh-TW')}
                </p>
              )}
            </div>
          </div>
        );
      })}

      <div className="card bg-brand/5 border-brand/20">
        <div className="flex items-center gap-2 mb-2">
          <MessageCircle className="w-4 h-4 text-brand" />
          <span className="text-sm font-semibold text-brand">LINE Bot 使用說明</span>
        </div>
        <ol className="text-xs text-gray-600 space-y-1.5 list-decimal list-inside">
          <li>開啟 LINE，搜尋並加入 <strong>LINE 官方帳號</strong></li>
          <li>在聊天室輸入您在「帳號設定」中產生的 8 位綁定碼</li>
          <li>收到確認訊息後即完成綁定，自動通知即時生效</li>
        </ol>
      </div>
    </div>
  );
}

function LineInstructions() {
  return (
    <div className="mt-3 border-t border-yellow-200 pt-3">
      <p className="text-xs font-medium text-yellow-800 mb-1">使用步驟：</p>
      <ol className="text-xs text-yellow-700 space-y-1 list-decimal list-inside">
        <li>開啟 LINE，搜尋並加入 LINE 官方帳號</li>
        <li>在聊天室輸入上方的 8 位綁定碼</li>
        <li>收到確認訊息後即完成綁定</li>
      </ol>
    </div>
  );
}
