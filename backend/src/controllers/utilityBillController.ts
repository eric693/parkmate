import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';
import { computeAllocations, SplitMethod } from '../services/utilityService';
import { sendTenantMessage } from '../services/lineService';

const SPLIT_METHODS: SplitMethod[] = ['EVEN', 'AREA', 'HEADCOUNT', 'USAGE'];
const CATEGORY_ZH: Record<string, string> = { WATER: '水費', ELECTRICITY: '電費', GAS: '瓦斯費' };

// 試算：給總額與方法，回傳每間房的分攤（不寫入），供業者確認
export async function previewUtilitySplit(req: AuthRequest, res: Response) {
  const { propertyId, totalAmount, method, inputs } = req.body;
  const property = await prisma.property.findFirst({ where: { id: propertyId, userId: req.userId! } });
  if (!property) {
    res.status(404).json({ error: '找不到停車場' });
    return;
  }
  if (!SPLIT_METHODS.includes(method)) {
    res.status(400).json({ error: '分攤方法無效' });
    return;
  }
  const allocations = await computeAllocations(propertyId, Number(totalAmount), method, inputs ?? []);
  res.json({ allocations });
}

// 建立水電單 + 寫入分攤
export async function createUtilityBill(req: AuthRequest, res: Response) {
  const { propertyId, category, periodStart, periodEnd, totalAmount, method, inputs, note } = req.body;
  const property = await prisma.property.findFirst({ where: { id: propertyId, userId: req.userId! } });
  if (!property) {
    res.status(404).json({ error: '找不到停車場' });
    return;
  }
  if (!['WATER', 'ELECTRICITY', 'GAS'].includes(category)) {
    res.status(400).json({ error: '類別須為 WATER/ELECTRICITY/GAS' });
    return;
  }
  if (!SPLIT_METHODS.includes(method)) {
    res.status(400).json({ error: '分攤方法無效' });
    return;
  }

  const allocations = await computeAllocations(propertyId, Number(totalAmount), method, inputs ?? []);
  if (allocations.length === 0) {
    res.status(400).json({ error: '此停車場目前無在住車位可分攤' });
    return;
  }

  const bill = await prisma.utilityBill.create({
    data: {
      propertyId,
      category,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      totalAmount: Number(totalAmount),
      method,
      note: note ?? undefined,
      allocations: {
        create: allocations.map((a) => ({ unitId: a.unitId, amount: a.amount, basis: a.basis ?? undefined })),
      },
    },
    include: { allocations: { include: { unit: true } } },
  });
  res.status(201).json(bill);
}

// 列出水電單
export async function getUtilityBills(req: AuthRequest, res: Response) {
  const { propertyId } = req.query;
  const bills = await prisma.utilityBill.findMany({
    where: {
      property: { userId: req.userId! },
      ...(propertyId ? { propertyId: String(propertyId) } : {}),
    },
    include: { allocations: { include: { unit: true } }, property: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(bills);
}

// 開帳給車主：把分攤金額透過 LINE 通知該車位目前在住車主
export async function billUtilityToTenants(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const bill = await prisma.utilityBill.findFirst({
    where: { id, property: { userId: req.userId! } },
    include: {
      property: { select: { name: true } },
      allocations: {
        include: { unit: { include: { contracts: { where: { status: 'ACTIVE' }, include: { tenant: true } } } } },
      },
    },
  });
  if (!bill) {
    res.status(404).json({ error: '找不到水電單' });
    return;
  }

  const periodStr = `${bill.periodStart.toISOString().split('T')[0]} ~ ${bill.periodEnd.toISOString().split('T')[0]}`;
  let notified = 0;
  for (const a of bill.allocations) {
    const contract = a.unit.contracts[0];
    if (!contract?.tenant) continue;
    const ok = await sendTenantMessage(
      contract.tenant.id,
      `${CATEGORY_ZH[bill.category] ?? '水電費'}通知\n\n${bill.property.name} ${a.unit.unitNumber}\n期間：${periodStr}\n應分攤：NT$${Number(a.amount).toLocaleString()}\n請依業者指定方式繳納，謝謝。`,
    );
    if (ok) notified++;
  }
  await prisma.utilityAllocation.updateMany({ where: { utilityBillId: id }, data: { billed: true } });
  res.json({ ok: true, notified, total: bill.allocations.length });
}
