import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';
import { notifyEntry, vacantUnitsFor, waitlistData } from '../services/waitlistService';

const STATUSES = ['WAITING', 'NOTIFIED', 'FULFILLED', 'CANCELLED'];
const VEHICLE_KINDS = ['CAR', 'MOTORCYCLE', 'OTHER'];
const SPOT_TYPES = ['FLAT', 'MECHANICAL_UPPER', 'MECHANICAL_LOWER', 'OTHER'];

/** 檢查表單資料：必填欄位、選項值，以及停車場／車主是不是這位業者的 */
async function validate(data: ReturnType<typeof waitlistData>, userId: string) {
  if (!data.name || !data.phone) return '請填寫姓名與電話';
  if (data.vehicleKind && !VEHICLE_KINDS.includes(data.vehicleKind)) return '車種不正確';
  if (data.spotType && !SPOT_TYPES.includes(data.spotType)) return '車位類型不正確';
  if (data.vehicleHeightCm != null && !(data.vehicleHeightCm > 0)) return '車高需大於 0';
  if (data.propertyId && !(await prisma.property.findFirst({ where: { id: data.propertyId, userId } }))) return '找不到停車場';
  if (data.tenantId && !(await prisma.tenant.findFirst({ where: { id: data.tenantId, userId } }))) return '找不到車主';
  return null;
}

export async function getWaitlist(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const entries = await prisma.waitlistEntry.findMany({
    where: { userId },
    include: {
      property: { select: { id: true, name: true } },
      tenant: { select: { id: true, name: true, lineUserId: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const active = entries.filter((e) => e.status === 'WAITING' || e.status === 'NOTIFIED');
  const matches = await vacantUnitsFor(userId, active);
  const notifiedUnitIds = entries.map((e) => e.notifiedUnitId).filter((id): id is string => !!id);
  const notifiedUnits = await prisma.unit.findMany({
    where: { id: { in: notifiedUnitIds } },
    select: { id: true, unitNumber: true, property: { select: { name: true } } },
  });

  res.json(entries.map((e) => ({
    ...e,
    tenant: e.tenant ? { id: e.tenant.id, name: e.tenant.name, lineBound: !!e.tenant.lineUserId } : null,
    notifiedUnit: notifiedUnits.find((u) => u.id === e.notifiedUnitId) ?? null,
    matchingUnits: (matches[e.id] ?? []).map((u) => ({
      id: u.id, unitNumber: u.unitNumber, propertyName: u.property.name, monthlyRent: u.monthlyRent,
    })),
  })));
}

export async function createWaitlistEntry(req: AuthRequest, res: Response) {
  const data = waitlistData(req.body, req.userId!);
  const error = await validate(data, req.userId!);
  if (error) { res.status(400).json({ error }); return; }
  const entry = await prisma.waitlistEntry.create({ data });
  res.status(201).json(entry);
}

export async function updateWaitlistEntry(req: AuthRequest, res: Response) {
  const existing = await prisma.waitlistEntry.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) { res.status(404).json({ error: '找不到候補紀錄' }); return; }

  const { status } = req.body;
  if (status !== undefined && !STATUSES.includes(status)) { res.status(400).json({ error: '狀態不正確' }); return; }

  // 只改狀態（例如「已承租」「放棄，回到排隊」）時不需要整份表單
  const onlyStatus = Object.keys(req.body).every((k) => k === 'status');
  let data: Record<string, unknown> = {};
  if (!onlyStatus) {
    const { userId: _u, ...fields } = waitlistData(req.body, req.userId!);
    const error = await validate({ ...fields, userId: req.userId! }, req.userId!);
    if (error) { res.status(400).json({ error }); return; }
    data = fields;
  }
  if (status) {
    data.status = status;
    // 回到排隊時清掉上次通知的車位，順位仍以登記時間為準
    if (status === 'WAITING') { data.notifiedAt = null; data.notifiedUnitId = null; }
  }
  const entry = await prisma.waitlistEntry.update({ where: { id: existing.id }, data });
  res.json(entry);
}

export async function deleteWaitlistEntry(req: AuthRequest, res: Response) {
  const existing = await prisma.waitlistEntry.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) { res.status(404).json({ error: '找不到候補紀錄' }); return; }
  await prisma.waitlistEntry.delete({ where: { id: existing.id } });
  res.json({ success: true });
}

/** 手動通知候補者某個空位 */
export async function notifyWaitlistEntry(req: AuthRequest, res: Response) {
  const entry = await prisma.waitlistEntry.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!entry) { res.status(404).json({ error: '找不到候補紀錄' }); return; }
  const unit = await prisma.unit.findFirst({ where: { id: String(req.body.unitId ?? ''), property: { userId: req.userId! } } });
  if (!unit) { res.status(404).json({ error: '找不到車位' }); return; }
  const result = await notifyEntry(entry, unit.id);
  res.json(result);
}
