// 租金日期工具。伺服器跑在 UTC，但業務日以台北時間為準。

const TZ = 'Asia/Taipei';

/**
 * 某年某月的繳租到期日。沿用既有資料慣例存成 UTC 午夜（= 台北當天 08:00）。
 * 繳租日超過當月天數（29～31 號遇到小月）時取當月最後一天，避免 new Date() 自動跳到下個月。
 */
export function rentDueDate(year: number, month: number, rentDueDay: number) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(Math.max(rentDueDay, 1), lastDay)));
}

/** 台北時間今天 00:00 的時間點。到期日早於它才算逾期（到期當天不算）。 */
export function startOfTodayTaipei(now: Date = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return new Date(`${ymd}T00:00:00+08:00`);
}
