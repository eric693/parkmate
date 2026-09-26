import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';
import { removeProperty } from '../services/deletionService';

export async function getProperties(req: AuthRequest, res: Response) {
  const properties = await prisma.property.findMany({
    where: { userId: req.userId! },
    include: {
      units: {
        include: {
          contracts: {
            where: { status: 'ACTIVE' },
            include: { tenant: true },
            take: 1,
          },
        },
      },
    },
  });
  res.json(properties);
}

export async function createProperty(req: AuthRequest, res: Response) {
  const { name, address, description, purchasePrice } = req.body;
  if (!name || !address) {
    res.status(400).json({ error: '請填寫名稱與地址' });
    return;
  }
  const property = await prisma.property.create({
    data: {
      userId: req.userId!,
      name,
      address,
      description,
      purchasePrice: purchasePrice ? Number(purchasePrice) : null,
    },
  });
  res.status(201).json(property);
}

export async function updateProperty(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { name, address, description, purchasePrice } = req.body;
  const property = await prisma.property.findFirst({ where: { id, userId: req.userId! } });
  if (!property) { res.status(404).json({ error: '找不到停車場' }); return; }
  const updated = await prisma.property.update({
    where: { id },
    data: {
      name,
      address,
      description,
      purchasePrice: purchasePrice !== undefined
        ? (purchasePrice ? Number(purchasePrice) : null)
        : undefined,
    },
  });
  res.json(updated);
}

export async function deleteProperty(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const property = await prisma.property.findFirst({ where: { id, userId: req.userId! } });
  if (!property) { res.status(404).json({ error: '找不到停車場' }); return; }
  await removeProperty(id); // 連同車位、合約、租金單、支出、水電帳單
  res.json({ success: true });
}
