import { Prisma, Unit, WaitlistEntry } from '@prisma/client';
import { prisma } from '../app';
import { sendLandlordMessage, sendTenantMessage } from './lineService';

export const SPOT_TYPE_LABELS: Record<string, string> = {
  FLAT: '平面',
  MECHANICAL_UPPER: '機械上層',
  MECHANICAL_LOWER: '機械下層',
  OTHER: '其他',
};

/** 地下樓層存負數：-1 → B1，2 → 2F */
export function floorLabel(floor: number | null | undefined) {
  if (floor == null) return '';
  return floor < 0 ? `B${-floor}` : `${floor}F`;
}

type MatchUnit = Pick<Unit, 'propertyId' | 'vehicleKind' | 'spotType' | 'hasCharger' | 'maxHeightCm'>;

/** 候補條件是否符合這個車位。沒填的條件視為不挑。 */
export function entryMatchesUnit(entry: WaitlistEntry, unit: MatchUnit) {
  if (entry.propertyId && entry.propertyId !== unit.propertyId) return false;
  if (entry.vehicleKind && unit.vehicleKind && entry.vehicleKind !== unit.vehicleKind) return false;
  if (entry.spotType && unit.spotType && entry.spotType !== unit.spotType) return false;
  if (entry.needCharger && !unit.hasCharger) return false;
  if (entry.vehicleHeightCm && unit.maxHeightCm && entry.vehicleHeightCm > unit.maxHeightCm) return false;
  return true;
}

/** 通知某位候補者有空位：有綁 LINE 就直接傳給他，並把狀態改成「已通知」。 */
export async function notifyEntry(entry: WaitlistEntry, unitId: string) {
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, include: { property: true } });
  if (!unit) return { sentToTenant: false };

  let sentToTenant = false;
  if (entry.tenantId) {
    const spec = [floorLabel(unit.floor), unit.spotType ? SPOT_TYPE_LABELS[unit.spotType] : '', unit.hasCharger ? '有充電樁' : '']
      .filter(Boolean).join('・');
    sentToTenant = await sendTenantMessage(
      entry.tenantId,
      `🅿️ 候補車位空出來了\n\n${entry.name} 您好！\n您登記候補的車位有空位：\n\n📍 ${unit.property.name} ${unit.unitNumber}${spec ? `（${spec}）` : ''}\n💰 月租 NT$${Number(unit.monthlyRent).toLocaleString()}\n\n有意承租請盡快與業者聯繫，名額依回覆順序保留，謝謝！`,
    );
  }
  await prisma.waitlistEntry.update({
    where: { id: entry.id },
    data: { status: 'NOTIFIED', notifiedAt: new Date(), notifiedUnitId: unitId },
  });
  return { sentToTenant };
}

/**
 * 車位變成空位時呼叫：找出條件符合、排最前面的候補者通知他，
 * 並傳一則 LINE 給業者（含第一順位聯絡方式與後面還有幾位）。
 * 失敗只記 log，不影響原本的操作（終止合約、改車位狀態等）。
 */
export async function onUnitVacated(unitId: string) {
  try {
    const unit = await prisma.unit.findUnique({ where: { id: unitId }, include: { property: true } });
    if (!unit || unit.status !== 'VACANT') return;

    const waiting = await prisma.waitlistEntry.findMany({
      where: { userId: unit.property.userId, status: 'WAITING' },
      orderBy: { createdAt: 'asc' },
    });
    const matched = waiting.filter((e) => entryMatchesUnit(e, unit));
    if (matched.length === 0) return;

    const [first, ...rest] = matched;
    const { sentToTenant } = await notifyEntry(first, unitId);

    await sendLandlordMessage(
      unit.property.userId,
      `🅿️ 車位空出，有人候補\n\n${unit.property.name} ${unit.unitNumber} 已空出。\n\n第一順位：${first.name}・${first.phone}\n${sentToTenant ? '✅ 已用 LINE 通知對方' : '⚠️ 對方沒有綁定 LINE，請電話聯繫'}${rest.length ? `\n\n後面還有 ${rest.length} 位符合條件的候補。` : ''}`,
    );
  } catch (err) {
    console.error('[waitlist] 空位通知失敗', err);
  }
}

/** 候補者可以承租的空位（給畫面「符合的空位」用） */
export async function vacantUnitsFor(userId: string, entries: WaitlistEntry[]) {
  const units = await prisma.unit.findMany({
    where: { status: 'VACANT', property: { userId } },
    include: { property: { select: { name: true } } },
    orderBy: [{ propertyId: 'asc' }, { unitNumber: 'asc' }],
  });
  const result: Record<string, typeof units> = {};
  for (const e of entries) result[e.id] = units.filter((u) => entryMatchesUnit(e, u));
  return result;
}

export function waitlistData(body: any, userId: string): Prisma.WaitlistEntryUncheckedCreateInput {
  const intOrNull = (v: unknown) => (v === undefined || v === null || v === '' ? null : Math.round(Number(v)));
  return {
    userId,
    name: String(body.name ?? '').trim(),
    phone: String(body.phone ?? '').trim(),
    propertyId: body.propertyId || null,
    tenantId: body.tenantId || null,
    vehicleKind: body.vehicleKind || null,
    spotType: body.spotType || null,
    needCharger: Boolean(body.needCharger),
    vehicleHeightCm: intOrNull(body.vehicleHeightCm),
    notes: body.notes || null,
  };
}
