import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';
import { removeUnit } from '../services/deletionService';

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

  const { unitNumber, floor, type, monthlyRent, description } = req.body;
  if (!unitNumber || !monthlyRent) {
    res.status(400).json({ error: '請填寫車位編號與月租金' });
    return;
  }
  const unit = await prisma.unit.create({
    data: { propertyId, unitNumber, floor: floor ? Number(floor) : null, type, monthlyRent, description },
  });
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
  const { unitNumber, floor, type, monthlyRent, status, description } = req.body;
  const updated = await prisma.unit.update({
    where: { id },
    data: { unitNumber, floor: floor ? Number(floor) : undefined, type, monthlyRent, status, description },
  });
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
