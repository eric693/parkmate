import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';

export async function getExpenses(req: AuthRequest, res: Response) {
  const { year, month } = req.query;
  const properties = await prisma.property.findMany({ where: { userId: req.userId! } });
  const propertyIds = properties.map((p) => p.id);
  const units = await prisma.unit.findMany({ where: { propertyId: { in: propertyIds } } });
  const unitIds = units.map((u) => u.id);

  const expenses = await prisma.expense.findMany({
    where: {
      OR: [
        { propertyId: { in: propertyIds } },
        { unitId: { in: unitIds } },
      ],
      ...(year && month ? {
        date: {
          gte: new Date(Number(year), Number(month) - 1, 1),
          lt: new Date(Number(year), Number(month), 1),
        },
      } : {}),
    },
    include: {
      property: { select: { name: true } },
      unit: { select: { unitNumber: true } },
    },
    orderBy: { date: 'desc' },
  });
  res.json(expenses);
}

export async function createExpense(req: AuthRequest, res: Response) {
  const { propertyId, unitId, category, amount, date, description } = req.body;
  if (!category || !amount || !date) {
    res.status(400).json({ error: '請填寫類別、金額與日期' }); return;
  }

  if (propertyId) {
    const prop = await prisma.property.findFirst({ where: { id: propertyId, userId: req.userId! } });
    if (!prop) { res.status(404).json({ error: '找不到停車場' }); return; }
  }

  const expense = await prisma.expense.create({
    data: { propertyId, unitId, category, amount: Number(amount), date: new Date(date), description },
  });
  res.status(201).json(expense);
}

export async function confirmExpense(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const expense = await prisma.expense.findFirst({
    where: { id },
    include: {
      property: { select: { userId: true } },
      unit: { include: { property: { select: { userId: true } } } },
    },
  });
  if (!expense) { res.status(404).json({ error: '找不到支出' }); return; }
  const ownerId = expense.property?.userId ?? expense.unit?.property.userId;
  if (ownerId !== req.userId!) { res.status(403).json({ error: '無權限' }); return; }
  const updated = await prisma.expense.update({
    where: { id },
    data: { confirmedAt: expense.confirmedAt ? null : new Date() },
  });
  res.json(updated);
}

export async function deleteExpense(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const expense = await prisma.expense.findFirst({
    where: { id },
    include: {
      property: { select: { userId: true } },
      unit: { include: { property: { select: { userId: true } } } },
    },
  });
  if (!expense) { res.status(404).json({ error: '找不到支出' }); return; }
  const ownerId = expense.property?.userId ?? expense.unit?.property.userId;
  if (ownerId !== req.userId!) { res.status(403).json({ error: '無權限' }); return; }
  await prisma.expense.delete({ where: { id } });
  res.json({ success: true });
}

export async function getExpenseTrend(req: AuthRequest, res: Response) {
  const properties = await prisma.property.findMany({ where: { userId: req.userId! } });
  const propertyIds = properties.map((p) => p.id);

  const now = new Date();
  const trend = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);

    const expenses = await prisma.expense.findMany({
      where: {
        propertyId: { in: propertyIds },
        date: { gte: d, lt: next },
      },
    });

    const byCategory: Record<string, number> = {};
    for (const e of expenses) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount);
    }

    trend.push({
      month: `${d.getMonth() + 1}月`,
      water: byCategory['WATER'] ?? 0,
      electricity: byCategory['ELECTRICITY'] ?? 0,
      gas: byCategory['GAS'] ?? 0,
      management: byCategory['MANAGEMENT'] ?? 0,
      repair: byCategory['REPAIR'] ?? 0,
      other: byCategory['OTHER'] ?? 0,
    });
  }

  res.json(trend);
}
