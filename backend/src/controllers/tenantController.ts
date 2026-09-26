import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';
import crypto from 'crypto';
import { removeTenant } from '../services/deletionService';

export async function getTenants(req: AuthRequest, res: Response) {
  const tenants = await prisma.tenant.findMany({
    where: { userId: req.userId! },
    include: {
      contracts: {
        where: { status: 'ACTIVE' },
        include: { unit: { include: { property: true } } },
        take: 1,
      },
      vehicles: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(tenants);
}

export async function createTenant(req: AuthRequest, res: Response) {
  const { name, phone, email, idNumber, emergencyContact } = req.body;
  if (!name || !phone) {
    res.status(400).json({ error: '請填寫姓名與電話' });
    return;
  }
  const tenant = await prisma.tenant.create({
    data: { userId: req.userId!, name, phone, email, idNumber, emergencyContact },
  });
  res.status(201).json(tenant);
}

export async function updateTenant(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const tenant = await prisma.tenant.findFirst({ where: { id, userId: req.userId! } });
  if (!tenant) { res.status(404).json({ error: '找不到車主' }); return; }
  const { name, phone, email, idNumber, emergencyContact } = req.body;
  const updated = await prisma.tenant.update({
    where: { id },
    data: { name, phone, email, idNumber, emergencyContact },
  });
  res.json(updated);
}

export async function deleteTenant(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const tenant = await prisma.tenant.findFirst({ where: { id, userId: req.userId! } });
  if (!tenant) { res.status(404).json({ error: '找不到車主' }); return; }
  await removeTenant(id); // 連同該車主的合約與租金單
  res.json({ success: true });
}

export async function generateTenantBindingCode(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const tenant = await prisma.tenant.findFirst({ where: { id, userId: req.userId! } });
  if (!tenant) { res.status(404).json({ error: '找不到車主' }); return; }
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.tenant.update({
    where: { id },
    data: { lineBindingCode: code, lineBindingCodeExpiry: expiry },
  });
  res.json({ code, expiry });
}
