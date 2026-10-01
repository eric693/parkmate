// 停車位共用的標籤與計算（車位規格、樓層、繳費週期、短租報價）
import type { BillingCycle, SpotType, Unit, VehicleKind } from '../types';

export const VEHICLE_KIND_LABEL: Record<VehicleKind, string> = { CAR: '汽車位', MOTORCYCLE: '機車位', OTHER: '其他' };
export const SPOT_TYPE_LABEL: Record<SpotType, string> = {
  FLAT: '平面',
  MECHANICAL_UPPER: '機械上層',
  MECHANICAL_LOWER: '機械下層',
  OTHER: '其他',
};

export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  MONTHLY: '月繳',
  QUARTERLY: '季繳',
  SEMIANNUAL: '半年繳',
  ANNUAL: '年繳',
  SHORT_TERM: '短租（日租／週租）',
};
export const CYCLE_MONTHS: Record<Exclude<BillingCycle, 'SHORT_TERM'>, number> = {
  MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6, ANNUAL: 12,
};

/** 地下樓層存負數：-1 → B1，2 → 2F */
export function floorLabel(floor?: number | null) {
  if (floor == null) return '';
  return floor < 0 ? `B${-floor}` : `${floor}F`;
}

/** 表單用：-1 → "B1"，2 → "2" */
export function floorInput(floor?: number | null) {
  if (floor == null) return '';
  return floor < 0 ? `B${-floor}` : String(floor);
}

/** 車位規格的短標籤，例如「B1・機械上層・限高 160・充電樁」 */
export function unitSpecLabels(u: Pick<Unit, 'floor' | 'vehicleKind' | 'spotType' | 'maxHeightCm' | 'maxWidthCm' | 'hasCharger' | 'type'>) {
  const out: string[] = [];
  if (u.floor != null) out.push(floorLabel(u.floor));
  if (u.vehicleKind) out.push(VEHICLE_KIND_LABEL[u.vehicleKind]);
  if (u.spotType) out.push(SPOT_TYPE_LABEL[u.spotType]);
  else if (u.type) out.push(u.type); // 舊資料的自由文字
  if (u.maxHeightCm) out.push(`限高 ${u.maxHeightCm}`);
  if (u.maxWidthCm) out.push(`限寬 ${u.maxWidthCm}`);
  if (u.hasCharger) out.push('⚡ 充電樁');
  return out;
}

/** 短租天數（含頭尾） */
export function shortTermDays(start: string, end: string) {
  if (!start || !end) return 0;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
}

/** 依車位日租／週租價估短租總額（與後端 shortTermQuote 相同）；沒設價格回傳 null */
export function shortTermQuote(unit: Pick<Unit, 'dailyRate' | 'weeklyRate'> | undefined, days: number) {
  if (!unit || days <= 0) return null;
  const daily = unit.dailyRate != null && unit.dailyRate !== '' ? Number(unit.dailyRate) : null;
  const weekly = unit.weeklyRate != null && unit.weeklyRate !== '' ? Number(unit.weeklyRate) : null;
  if (weekly != null) {
    const rest = days % 7;
    const restCost = rest === 0 ? 0 : daily != null ? Math.min(rest * daily, weekly) : weekly;
    return Math.floor(days / 7) * weekly + restCost;
  }
  return daily != null ? days * daily : null;
}

/** 合約卡片上的收費說明，例如「季繳 NT$5,400／3 個月」「短租 7 天 NT$1,200」 */
export function billingSummary(c: { billingCycle?: BillingCycle; periodAmount?: number | string | null; monthlyRent: number; startDate: string; endDate: string }) {
  const cycle = c.billingCycle ?? 'MONTHLY';
  if (cycle === 'SHORT_TERM') {
    const total = c.periodAmount != null ? Number(c.periodAmount) : Number(c.monthlyRent);
    return { label: `短租 ${shortTermDays(c.startDate.split('T')[0], c.endDate.split('T')[0])} 天`, amount: total, unit: '總額' };
  }
  const n = CYCLE_MONTHS[cycle];
  const amount = c.periodAmount != null ? Number(c.periodAmount) : Number(c.monthlyRent) * n;
  return { label: BILLING_CYCLE_LABEL[cycle], amount, unit: n === 1 ? '/月' : `/${n} 個月` };
}
