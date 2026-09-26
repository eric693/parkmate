import { prisma } from '../app';
import { Prisma } from '@prisma/client';
import { sendTenantMessage, sendLandlordMessage } from './lineService';

// 預付電表：儲值 / 登錄用電 / 餘額預估 / 低餘額告警。
// 餘額一律以「元」為單位；登錄度數時用 unitPrice 換算成金額扣款。

const DEFAULT_THRESHOLD = 300; // 未設定門檻時的預設值（元）
const USAGE_WINDOW_DAYS = 30;  // 估算日均用電的回溯天數

function d(v: Prisma.Decimal | number | null | undefined): number {
  return v == null ? 0 : Number(v);
}

/** 取得某車位的日均用電金額（元/天）。資料不足時回 null。 */
export async function averageDailySpend(unitId: string): Promise<number | null> {
  const since = new Date(Date.now() - USAGE_WINDOW_DAYS * 86400000);
  const records = await prisma.prepaidRecord.findMany({
    where: { unitId, type: 'USAGE', createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
  });
  if (records.length === 0) return null;

  const total = records.reduce((s, r) => s + d(r.amount), 0);
  if (total <= 0) return null;

  // 用「第一筆用電到現在」的實際天數當分母，避免剛啟用就被少量資料放大日均。
  const spanDays = Math.max(1, (Date.now() - records[0].createdAt.getTime()) / 86400000);
  return total / spanDays;
}

export interface PrepaidStatus {
  unitId: string;
  balance: number;
  threshold: number;
  avgDailySpend: number | null;
  /** 依日均用電推估還能撐幾天，資料不足為 null */
  daysLeft: number | null;
  /** 推估用完的日期 (YYYY-MM-DD)，資料不足為 null */
  depletionDate: string | null;
  low: boolean;
}

/** 計算單一車位的預付電費狀態（餘額、預估用完日期、是否低於門檻）。 */
export async function getPrepaidStatus(unitId: string, threshold?: number): Promise<PrepaidStatus> {
  const unit = await prisma.unit.findUniqueOrThrow({ where: { id: unitId } });
  const balance = d(unit.prepaidBalance);
  const th = threshold ?? DEFAULT_THRESHOLD;
  const avg = await averageDailySpend(unitId);

  let daysLeft: number | null = null;
  let depletionDate: string | null = null;
  if (avg && avg > 0) {
    daysLeft = Math.max(0, Math.floor(balance / avg));
    const dt = new Date(Date.now() + daysLeft * 86400000);
    depletionDate = dt.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }); // YYYY-MM-DD（台北日期）
  }

  return { unitId, balance, threshold: th, avgDailySpend: avg, daysLeft, depletionDate, low: balance <= th };
}

/** 儲值。回傳更新後餘額；餘額回到門檻以上會清掉告警旗標，讓下次見底能再發一次。 */
export async function topUp(unitId: string, amount: number, note?: string, threshold = DEFAULT_THRESHOLD) {
  const unit = await prisma.unit.findUniqueOrThrow({ where: { id: unitId } });
  const balanceAfter = d(unit.prepaidBalance) + amount;

  await prisma.prepaidRecord.create({
    data: { unitId, type: 'TOPUP', amount, balanceAfter, note },
  });
  await prisma.unit.update({
    where: { id: unitId },
    data: {
      prepaidBalance: balanceAfter,
      prepaidLowAlertedAt: balanceAfter > threshold ? null : unit.prepaidLowAlertedAt,
    },
  });
  return balanceAfter;
}

/**
 * 登錄用電扣款。可傳金額或度數（度數需車位已設每度電價）。
 * 餘額允許扣成負數——實際電表可能已欠費，硬擋反而讓帳對不起來。
 */
export async function recordUsage(
  unitId: string,
  opts: { amount?: number; kwh?: number; note?: string },
) {
  const unit = await prisma.unit.findUniqueOrThrow({ where: { id: unitId } });

  let amount = opts.amount;
  if (amount == null) {
    if (opts.kwh == null) throw new Error('請提供扣款金額或用電度數');
    const price = d(unit.prepaidUnitPrice);
    if (price <= 0) throw new Error('此車位尚未設定每度電價，無法用度數換算，請改填金額');
    amount = Math.round(opts.kwh * price * 100) / 100;
  }

  const balanceAfter = d(unit.prepaidBalance) - amount;
  await prisma.prepaidRecord.create({
    data: { unitId, type: 'USAGE', amount, kwh: opts.kwh ?? null, balanceAfter, note: opts.note },
  });
  await prisma.unit.update({ where: { id: unitId }, data: { prepaidBalance: balanceAfter } });
  return balanceAfter;
}

/** 人工調整餘額（校正抄表誤差），amount 可正可負。 */
export async function adjustBalance(unitId: string, amount: number, note?: string) {
  const unit = await prisma.unit.findUniqueOrThrow({ where: { id: unitId } });
  const balanceAfter = d(unit.prepaidBalance) + amount;
  await prisma.prepaidRecord.create({
    data: { unitId, type: 'ADJUST', amount: Math.abs(amount), balanceAfter, note },
  });
  await prisma.unit.update({ where: { id: unitId }, data: { prepaidBalance: balanceAfter } });
  return balanceAfter;
}

/**
 * 低餘額巡檢：對某業者名下所有啟用預付電表、且餘額低於門檻的車位發告警。
 * 同一次見底只發一次（prepaidLowAlertedAt），儲值回門檻以上才會重置。
 */
export async function checkPrepaidBalances(
  userId: string,
  threshold = DEFAULT_THRESHOLD,
): Promise<{ alerted: number }> {
  const units = await prisma.unit.findMany({
    where: {
      prepaidEnabled: true,
      prepaidLowAlertedAt: null,
      property: { userId },
    },
    include: {
      property: true,
      contracts: { where: { status: 'ACTIVE' }, include: { tenant: true } },
    },
  });

  const low = units.filter((u) => d(u.prepaidBalance) <= threshold);
  if (low.length === 0) return { alerted: 0 };

  const landlordLines: string[] = ['⚡ 預付電費餘額不足\n'];
  let alerted = 0;

  for (const u of low) {
    const status = await getPrepaidStatus(u.id, threshold);
    const balanceStr = `NT$${status.balance.toLocaleString()}`;
    const forecast =
      status.depletionDate
        ? `預估 ${status.depletionDate}（約 ${status.daysLeft} 天後）用完`
        : '用電資料不足，尚無法推估用完日期';

    landlordLines.push(
      `🏠 ${u.property.name} ${u.unitNumber}\n💰 餘額：${balanceStr}\n📅 ${forecast}`,
    );

    const tenant = u.contracts[0]?.tenant;
    if (tenant) {
      await sendTenantMessage(
        tenant.id,
        `⚡ 電費餘額不足通知\n\n${tenant.name} 您好，\n${u.property.name} ${u.unitNumber} 的預付電費餘額僅剩 ${balanceStr}，已低於 NT$${threshold.toLocaleString()}。\n\n📅 ${forecast}\n\n請儘早儲值，避免斷電，謝謝！`,
      );
    }

    await prisma.unit.update({ where: { id: u.id }, data: { prepaidLowAlertedAt: new Date() } });
    alerted++;
  }

  landlordLines.push(`\n---\n請通知車主儲值。\n⏰ ${new Date().toLocaleString('zh-TW')}`);
  await sendLandlordMessage(userId, landlordLines.join('\n\n'));

  return { alerted };
}
