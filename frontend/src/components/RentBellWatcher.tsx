import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, X, Volume2, Zap, CalendarClock, CircleDollarSign } from 'lucide-react';
import api from '../api/client';
import {
  DueItem, UpcomingItem, ElecItem, loadBellSettings, loadAcked, saveAcked, playBell,
  unlockAudioOnGesture, audioBlocked, showSystemNotification, alertQuery,
} from '../lib/rentBell';

const POLL_MS = 5 * 60 * 1000;
const CHECK_MS = 20 * 1000;

type Kind = 'rent' | 'soon' | 'elec';

interface Alert {
  key: string;
  kind: Kind;
  room: string;
  who: string;
  phone: string;
  detail: string;
  amount: number;
}

const SECTION: Record<Kind, { label: string; icon: typeof Zap; color: string }> = {
  rent: { label: '今天要收月租', icon: CircleDollarSign, color: 'text-brand' },
  soon: { label: '月租快到期', icon: CalendarClock, color: 'text-blue-600' },
  elec: { label: '電費快用完', icon: Zap, color: 'text-orange-500' },
};

function toAlerts(dueToday: DueItem[], upcoming: UpcomingItem[], electricity: ElecItem[]): Alert[] {
  return [
    ...dueToday.map((i) => ({
      key: `rent:${i.contractId}`, kind: 'rent' as const,
      room: `${i.propertyName} ${i.unitNumber}`, who: i.tenantName, phone: i.tenantPhone,
      detail: '今天是繳租日', amount: i.amount - i.paidAmount,
    })),
    ...upcoming.map((i) => ({
      key: `soon:${i.contractId}:${i.dueDate}`, kind: 'soon' as const,
      room: `${i.propertyName} ${i.unitNumber}`, who: i.tenantName, phone: i.tenantPhone,
      detail: `${i.dueDate.slice(5).replace('-', '/')} 到期・還有 ${i.daysUntil} 天`, amount: i.amount - i.paidAmount,
    })),
    ...electricity.map((i) => ({
      key: `elec:${i.unitId}`, kind: 'elec' as const,
      room: `${i.propertyName} ${i.unitNumber}`, who: i.tenantName, phone: i.tenantPhone,
      detail: i.depletionDate
        ? `預估 ${i.depletionDate.slice(5).replace('-', '/')} 用完（約 ${i.daysLeft} 天）`
        : `餘額低於 NT$${i.threshold.toLocaleString()}`,
      amount: i.balance,
    })),
  ];
}

/**
 * 掛在 Layout 上，登入後全站常駐。
 * 今天是繳租日／繳租日快到／預付電費快用完，時間到了且業者還沒按「我知道了」
 * → 跳出視窗並響鈴，沒確認就每隔 repeatSeconds 再響一次。
 */
export default function RentBellWatcher() {
  const navigate = useNavigate();
  const [date, setDate] = useState('');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [pending, setPending] = useState<Alert[]>([]);
  const [blocked, setBlocked] = useState(false);
  const lastRing = useRef(0);
  const notified = useRef('');

  useEffect(() => unlockAudioOnGesture(), []);

  // 抓提醒清單；設定改了（提前天數）要重抓
  useEffect(() => {
    const load = () =>
      api.get(`/rent-alerts/today?${alertQuery(loadBellSettings())}`).then((r) => {
        setDate(r.data.date);
        setAlerts(toAlerts(r.data.dueToday, r.data.upcoming ?? [], r.data.electricity ?? []));
      }).catch(() => {});
    load();
    const t = setInterval(load, POLL_MS);
    window.addEventListener('rentbell:refresh', load);
    window.addEventListener('rentbell:settings', load);
    return () => {
      clearInterval(t);
      window.removeEventListener('rentbell:refresh', load);
      window.removeEventListener('rentbell:settings', load);
    };
  }, []);

  // 判斷要不要響
  useEffect(() => {
    if (!date) return;
    const check = () => {
      const s = loadBellSettings();
      const now = new Date();
      const timeReached = now.getHours() * 60 + now.getMinutes() >= s.hour * 60 + s.minute;
      const acked = loadAcked(date);
      const list = s.enabled && timeReached
        ? alerts.filter((a) => !acked.includes(a.key) && (a.kind !== 'elec' || s.elecEnabled))
        : [];
      setPending(list);
      if (list.length === 0) return;

      const key = `${date}:${list.map((a) => a.key).join(',')}`;
      if (notified.current !== key) {
        notified.current = key;
        const counts = (['rent', 'soon', 'elec'] as Kind[])
          .map((k) => [SECTION[k].label, list.filter((a) => a.kind === k).length] as const)
          .filter(([, n]) => n > 0)
          .map(([l, n]) => `${l} ${n} 間`);
        showSystemNotification(
          counts.join('、'),
          list.map((a) => `${a.room} ${a.who}：${a.detail}`).join('\n'),
        );
      }
      if (Date.now() - lastRing.current >= s.repeatSeconds * 1000) {
        lastRing.current = Date.now();
        playBell();
      }
      setBlocked(audioBlocked());
    };
    check();
    const t = setInterval(check, CHECK_MS);
    window.addEventListener('rentbell:settings', check);
    return () => {
      clearInterval(t);
      window.removeEventListener('rentbell:settings', check);
    };
  }, [date, alerts]);

  function acknowledge() {
    saveAcked(date, [...new Set([...loadAcked(date), ...pending.map((a) => a.key)])]);
    setPending([]);
    lastRing.current = 0;
  }

  if (pending.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="bg-brand text-white px-5 py-4 flex items-center gap-3">
          <BellRing className="w-6 h-6 animate-bounce" />
          <div className="flex-1">
            <div className="font-bold">收費提醒</div>
            <div className="text-xs text-white/80">{date}・共 {pending.length} 項</div>
          </div>
          <button onClick={acknowledge} className="p-1 rounded-lg hover:bg-white/10" aria-label="關閉">
            <X className="w-5 h-5" />
          </button>
        </div>

        {blocked && (
          <button
            onClick={() => playBell()}
            className="w-full flex items-center gap-2 bg-orange-50 text-orange-700 text-xs px-5 py-2 border-b border-orange-100"
          >
            <Volume2 className="w-4 h-4" /> 瀏覽器擋住了聲音，點這裡開啟鈴聲
          </button>
        )}

        <div className="max-h-80 overflow-y-auto">
          {(['rent', 'soon', 'elec'] as Kind[]).map((k) => {
            const rows = pending.filter((a) => a.kind === k);
            if (rows.length === 0) return null;
            const { label, icon: Icon, color } = SECTION[k];
            return (
              <div key={k}>
                <div className={`flex items-center gap-1.5 px-5 pt-3 pb-1 text-xs font-semibold ${color}`}>
                  <Icon className="w-3.5 h-3.5" /> {label}（{rows.length}）
                </div>
                <ul className="divide-y divide-gray-50">
                  {rows.map((a) => (
                    <li key={a.key} className="px-5 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-800 truncate">{a.room}</div>
                        <div className="text-xs text-gray-400 truncate">
                          {a.who}
                          {a.phone && <> · <a href={`tel:${a.phone}`} className="text-brand">{a.phone}</a></>}
                        </div>
                        <div className="text-xs text-gray-500">{a.detail}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-gray-800">NT${a.amount.toLocaleString()}</div>
                        <div className="text-xs text-gray-400">{k === 'elec' ? '剩餘' : '應收'}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={() => { acknowledge(); navigate('/finance/records'); }}
            className="flex-1 text-sm border border-brand text-brand rounded-xl py-2 font-medium hover:bg-brand/5"
          >
            查看紀錄
          </button>
          <button onClick={acknowledge} className="flex-1 text-sm bg-brand text-white rounded-xl py-2 font-medium hover:bg-brand-dark">
            我知道了，停止響鈴
          </button>
        </div>
      </div>
    </div>
  );
}
