import { FEATURES } from './features';
// 收費鈴聲：設定、已讀紀錄與響鈴。全部只存在這台裝置的瀏覽器。

export interface BellSettings {
  enabled: boolean;
  /** 當天幾點開始響（台北時間，以裝置時間為準） */
  hour: number;
  minute: number;
  /** 沒按「我知道了」時，每隔幾秒再響一次 */
  repeatSeconds: number;
  /** 繳租日前幾天先提醒，0 = 只在當天響 */
  rentDaysBefore: number;
  /** 預付電費快用完提醒 */
  elecEnabled: boolean;
  /** 預估幾天內用完就提醒（餘額低於門檻也會提醒） */
  elecDaysBefore: number;
}

export interface DueItem {
  contractId: string;
  rentRecordId: string | null;
  propertyName: string;
  unitNumber: string;
  tenantName: string;
  tenantPhone: string;
  amount: number;
  paidAmount: number;
  rentDueDay: number;
}

export interface UpcomingItem {
  contractId: string;
  propertyName: string;
  unitNumber: string;
  tenantName: string;
  tenantPhone: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  daysUntil: number;
}

export interface ElecItem {
  unitId: string;
  propertyName: string;
  unitNumber: string;
  tenantName: string;
  tenantPhone: string;
  balance: number;
  threshold: number;
  daysLeft: number | null;
  depletionDate: string | null;
  low: boolean;
}

/** 提醒 API 的查詢參數，依使用者設定帶入 */
export function alertQuery(s: BellSettings) {
  return `rentDaysBefore=${s.rentDaysBefore}&elecDaysBefore=${s.elecDaysBefore}`;
}

const SETTINGS_KEY = 'rentbell:settings';
const DEFAULTS: BellSettings = {
  enabled: true, hour: 9, minute: 0, repeatSeconds: 60,
  rentDaysBefore: 3, elecEnabled: true, elecDaysBefore: 3,
};

export function loadBellSettings(): BellSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const s = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
    return FEATURES.electricity ? s : { ...s, elecEnabled: false };
  } catch {
    return DEFAULTS;
  }
}

export function saveBellSettings(s: BellSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 無痕視窗寫不進去就算了，本次仍用記憶體中的設定 */
  }
  window.dispatchEvent(new Event('rentbell:settings'));
}

/** 今天已按「我知道了」的提醒 key（rent:/soon:/elec: 開頭） */
export function loadAcked(date: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(`rentbell:ack:${date}`) ?? '[]');
  } catch {
    return [];
  }
}

export function saveAcked(date: string, ids: string[]) {
  try {
    localStorage.setItem(`rentbell:ack:${date}`, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

// ── 響鈴（Web Audio 合成，不需要音檔）────────────────────────────

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** 瀏覽器規定要使用者點過頁面才能出聲，這裡在第一次點擊時解鎖 */
export function unlockAudioOnGesture() {
  const unlock = () => {
    audio()?.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}

export function audioBlocked() {
  return !ctx || ctx.state !== 'running';
}

/** 叮咚鈴聲，連響三次 */
export function playBell() {
  const ac = audio();
  if (!ac) return;
  ac.resume().catch(() => {});
  const start = ac.currentTime + 0.05;
  const notes = [1318.5, 1046.5]; // E6 → C6
  for (let rep = 0; rep < 3; rep++) {
    notes.forEach((freq, i) => {
      const t = start + rep * 1.4 + i * 0.45;
      const osc = ac.createOscillator();
      const overtone = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      overtone.type = 'sine';
      osc.frequency.value = freq;
      overtone.frequency.value = freq * 2.01;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      osc.connect(gain);
      overtone.connect(gain);
      gain.connect(ac.destination);
      osc.start(t);
      overtone.start(t);
      osc.stop(t + 1.2);
      overtone.stop(t + 1.2);
    });
  }
}

/** 系統通知（手機／電腦通知列），需使用者先允許 */
export async function showSystemNotification(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options = { body, icon: '/icon-192.png', tag: 'rentbell', requireInteraction: true, data: { url: '/finance/bell' } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    /* 退回一般 Notification */
  }
  try {
    new Notification(title, options);
  } catch {
    /* 部分行動瀏覽器只允許透過 service worker 發通知 */
  }
}
