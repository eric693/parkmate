// 停車位月租：車輛（車牌）管理與車牌查詢。
import { Response } from 'express';
import { VehicleType } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';
import { startOfTodayTaipei } from '../utils/dates';

/** 車牌統一格式：去空白、轉大寫，只留英數與連字號（ABC 1234 → ABC-1234 不自動補，照使用者輸入的連字號） */
export const normalizePlate = (v: unknown) => String(v ?? '').toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
const TYPES: VehicleType[] = ['CAR', 'MOTORCYCLE', 'OTHER'];

function vehicleData(body: Record<string, unknown>) {
  return {
    plateNumber: normalizePlate(body.plateNumber),
    type: TYPES.includes(body.type as VehicleType) ? (body.type as VehicleType) : 'CAR',
    brand: (body.brand as string) || null,
    color: (body.color as string) || null,
    notes: (body.notes as string) || null,
  };
}

/**
 * 車輛清單／車牌查詢：附車主、停的車位、本月是否已繳、逾期筆數。
 * q 可用車牌片段（忽略大小寫與空白）、車主姓名或電話查詢。
 */
export async function getVehicles(req: AuthRequest, res: Response) {
  const q = String(req.query.q ?? '').trim();
  const plateQ = normalizePlate(q);
  const vehicles = await prisma.vehicle.findMany({
    where: {
      tenant: { userId: req.userId! },
      ...(q ? {
        OR: [
          ...(plateQ ? [{ plateNumber: { contains: plateQ.replace(/-/g, '') } }, { plateNumber: { contains: plateQ } }] : []),
          { tenant: { name: { contains: q } } },
          { tenant: { phone: { contains: q } } },
        ],
      } : {}),
    },
    include: {
      tenant: {
        include: {
          contracts: {
            where: { status: 'ACTIVE' },
            include: { unit: { include: { property: true } } },
          },
        },
      },
    },
    orderBy: { plateNumber: 'asc' },
  });

  const now = new Date();
  const today = startOfTodayTaipei(now);
  const rows = [];
  for (const v of vehicles) {
    // 優先用登記了這台車的合約，沒有就用車主其他生效中的合約
    const contracts = v.tenant.contracts.filter((c) => c.vehicleId === v.id);
    const active = contracts.length ? contracts : v.tenant.contracts;
    const contractIds = active.map((c) => c.id);
    const [thisMonth, overdue] = await Promise.all([
      prisma.rentRecord.findMany({ where: { contractId: { in: contractIds }, year: now.getFullYear(), month: now.getMonth() + 1 } }),
      prisma.rentRecord.count({ where: { contractId: { in: contractIds }, status: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] }, dueDate: { lt: today } } }),
    ]);
    rows.push({
      id: v.id,
      plateNumber: v.plateNumber,
      type: v.type,
      brand: v.brand,
      color: v.color,
      notes: v.notes,
      tenant: { id: v.tenant.id, name: v.tenant.name, phone: v.tenant.phone },
      spaces: active.map((c) => ({
        contractId: c.id,
        property: c.unit.property.name,
        space: c.unit.unitNumber,
        accessCard: c.accessCard,
        endDate: c.endDate,
        registered: c.vehicleId === v.id,
      })),
      paidThisMonth: thisMonth.length > 0 && thisMonth.every((r) => r.status === 'PAID'),
      overdueCount: overdue,
    });
  }
  res.json(rows);
}

async function ownTenant(userId: string, tenantId: string) {
  return prisma.tenant.findFirst({ where: { id: tenantId, userId } });
}

export async function createVehicle(req: AuthRequest, res: Response) {
  const tenant = await ownTenant(req.userId!, req.params.tenantId);
  if (!tenant) { res.status(404).json({ error: '找不到車主' }); return; }
  const data = vehicleData(req.body);
  if (data.plateNumber.length < 2) { res.status(400).json({ error: '請填寫車牌' }); return; }
  const dup = await prisma.vehicle.findFirst({ where: { plateNumber: data.plateNumber, tenant: { userId: req.userId! } }, include: { tenant: true } });
  if (dup) { res.status(409).json({ error: `車牌 ${data.plateNumber} 已登記在 ${dup.tenant.name} 名下` }); return; }
  res.status(201).json(await prisma.vehicle.create({ data: { ...data, tenantId: tenant.id } }));
}

export async function updateVehicle(req: AuthRequest, res: Response) {
  const v = await prisma.vehicle.findFirst({ where: { id: req.params.id, tenant: { userId: req.userId! } } });
  if (!v) { res.status(404).json({ error: '找不到車輛' }); return; }
  const data = vehicleData({ ...v, ...req.body });
  if (data.plateNumber.length < 2) { res.status(400).json({ error: '請填寫車牌' }); return; }
  const dup = await prisma.vehicle.findFirst({ where: { plateNumber: data.plateNumber, id: { not: v.id }, tenant: { userId: req.userId! } }, include: { tenant: true } });
  if (dup) { res.status(409).json({ error: `車牌 ${data.plateNumber} 已登記在 ${dup.tenant.name} 名下` }); return; }
  res.json(await prisma.vehicle.update({ where: { id: v.id }, data }));
}

export async function deleteVehicle(req: AuthRequest, res: Response) {
  const v = await prisma.vehicle.findFirst({ where: { id: req.params.id, tenant: { userId: req.userId! } } });
  if (!v) { res.status(404).json({ error: '找不到車輛' }); return; }
  await prisma.vehicle.delete({ where: { id: v.id } }); // 合約上的登記車輛會自動清空
  res.json({ ok: true });
}
