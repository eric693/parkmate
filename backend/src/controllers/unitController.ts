import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';
import { removeUnit } from '../services/deletionService';
import { onUnitVacated } from '../services/waitlistService';

const VEHICLE_KINDS = ['CAR', 'MOTORCYCLE', 'OTHER'];
const SPOT_TYPES = ['FLAT', 'MECHANICAL_UPPER', 'MECHANICAL_LOWER', 'OTHER'];

/** 樓層可輸入「B1」「b2」「-1」「3」「3F」；地下樓層存負數。空字串 = 清空。無法辨識回傳 NaN。 */
export function parseFloor(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const t = String(v).trim().toUpperCase();
  const m = /^B(\d+)F?$/.exec(t);
  if (m) return -Number(m[1]);
  const n = /^(-?\d+)F?$/.exec(t);
  if (n) return Number(n[1]);
  return NaN;
}

/** 車位表單的規格欄位。只處理有送來的欄位（undefined = 不改）。 */
function specData(body: any): { data: Record<string, unknown>; error?: string } {
  const data: Record<string, unknown> = {};
  const optInt = (v: unknown) => (v === '' || v === null ? null : Math.round(Number(v)));
  const optMoney = (v: unknown) => (v === '' || v === null ? null : Number(v));

  const floor = parseFloor(body.floor);
  if (Number.isNaN(floor)) return { data, error: '樓層格式不正確，例如 B1、1、2F' };
  if (floor !== undefined) data.floor = floor;

  if (body.vehicleKind !== undefined) {
    if (body.vehicleKind && !VEHICLE_KINDS.includes(body.vehicleKind)) return { data, error: '車位車種不正確' };
    data.vehicleKind = body.vehicleKind || null;
  }
  if (body.spotType !== undefined) {
    if (body.spotType && !SPOT_TYPES.includes(body.spotType)) return { data, error: '車位類型不正確' };
    data.spotType = body.spotType || null;
  }
  for (const k of ['maxHeightCm', 'maxWidthCm'] as const) {
    if (body[k] === undefined) continue;
    const n = optInt(body[k]);
    if (n !== null && !(n > 0)) return { data, error: '限高／限寬需大於 0' };
    data[k] = n;
  }
  for (const k of ['dailyRate', 'weeklyRate'] as const) {
    if (body[k] === undefined) continue;
    const n = optMoney(body[k]);
    if (n !== null && !(n >= 0)) return { data, error: '短租價格不正確' };
    data[k] = n;
  }
  if (typeof body.hasCharger === 'boolean') data.hasCharger = body.hasCharger;
  return { data };
}

export async function getUnits(req: AuthRequest, res: Response) {
  const { propertyId } = req.params;
  const property = await prisma.property.findFirst({ where: { id: propertyId, userId: req.userId! } });
  if (!property) { res.status(404).json({ error: '找不到停車場' }); return; }

  const units = await prisma.unit.findMany({
    where: { propertyId },
    include: {
      contracts: {
        where: { status: 'ACTIVE' },
        include: { tenant: true },
        take: 1,
      },
      maintenanceRequests: {
        where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
        take: 3,
      },
    },
    orderBy: [{ floor: 'asc' }, { unitNumber: 'asc' }],
  });
  res.json(units);
}

export async function createUnit(req: AuthRequest, res: Response) {
  const { propertyId } = req.params;
  const property = await prisma.property.findFirst({ where: { id: propertyId, userId: req.userId! } });
  if (!property) { res.status(404).json({ error: '找不到停車場' }); return; }

  const { unitNumber, type, monthlyRent, description } = req.body;
  if (!unitNumber || !monthlyRent) {
    res.status(400).json({ error: '請填寫車位編號與月租金' });
    return;
  }
  const spec = specData(req.body);
  if (spec.error) { res.status(400).json({ error: spec.error }); return; }
  const unit = await prisma.unit.create({
    data: { propertyId, unitNumber, type: type || null, monthlyRent, description, ...spec.data },
  });
  await onUnitVacated(unit.id); // 新車位一開始是空位，有人候補就通知
  res.status(201).json(unit);
}

export async function updateUnit(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const unit = await prisma.unit.findFirst({
    where: { id },
    include: { property: true },
  });
  if (!unit || unit.property.userId !== req.userId!) {
    res.status(404).json({ error: '找不到車位' }); return;
  }
  const { unitNumber, type, monthlyRent, status, description } = req.body;
  const spec = specData(req.body);
  if (spec.error) { res.status(400).json({ error: spec.error }); return; }
  const updated = await prisma.unit.update({
    where: { id },
    data: { unitNumber, type, monthlyRent, status, description, ...spec.data },
  });
  if (unit.status !== 'VACANT' && updated.status === 'VACANT') await onUnitVacated(id);
  res.json(updated);
}

export async function deleteUnit(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const unit = await prisma.unit.findFirst({ where: { id }, include: { property: true } });
  if (!unit || unit.property.userId !== req.userId!) {
    res.status(404).json({ error: '找不到車位' }); return;
  }
  await removeUnit(id); // 連同合約、租金單、報修、支出、水電分攤、預付電表紀錄
  res.json({ success: true });
}
