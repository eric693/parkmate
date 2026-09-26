import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';

export async function getVacantUnits(req: AuthRequest, res: Response) {
  const properties = await prisma.property.findMany({
    where: { userId: req.userId! },
    include: {
      units: {
        where: { status: 'VACANT' },
        include: { listings: { orderBy: { listedAt: 'desc' } } },
      },
    },
  });

  const units = properties.flatMap((p) =>
    p.units.map((u) => ({
      ...u,
      propertyName: p.name,
      propertyAddress: p.address,
    }))
  );

  res.json(units);
}

export async function addListing(req: AuthRequest, res: Response) {
  const { unitId } = req.params;
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, property: { userId: req.userId! } },
  });
  if (!unit) { res.status(404).json({ error: '找不到車位' }); return; }

  const { platform, url, notes, expiresAt } = req.body;
  if (!platform) { res.status(400).json({ error: '請選擇刊登平台' }); return; }

  const listing = await prisma.listingRecord.create({
    data: {
      unitId,
      platform,
      url: url || null,
      notes: notes || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      status: 'ACTIVE',
    },
  });
  res.status(201).json(listing);
}

export async function updateListing(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const listing = await prisma.listingRecord.findFirst({
    where: { id, unit: { property: { userId: req.userId! } } },
  });
  if (!listing) { res.status(404).json({ error: '找不到刊登紀錄' }); return; }

  const updated = await prisma.listingRecord.update({
    where: { id },
    data: {
      status: req.body.status ?? listing.status,
      url: req.body.url ?? listing.url,
      notes: req.body.notes ?? listing.notes,
    },
  });
  res.json(updated);
}

export async function deleteListing(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const listing = await prisma.listingRecord.findFirst({
    where: { id, unit: { property: { userId: req.userId! } } },
  });
  if (!listing) { res.status(404).json({ error: '找不到刊登紀錄' }); return; }
  await prisma.listingRecord.delete({ where: { id } });
  res.json({ ok: true });
}
