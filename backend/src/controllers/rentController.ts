import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';
import { sendTenantMessage } from '../services/lineService';
import { startOfTodayTaipei } from '../utils/dates';

async function getUserUnitIds(userId: string): Promise<string[]> {
  const properties = await prisma.property.findMany({ where: { userId } });
  const propertyIds = properties.map((p) => p.id);
  const units = await prisma.unit.findMany({ where: { propertyId: { in: propertyIds } } });
  return units.map((u) => u.id);
}

export async function getRentRecords(req: AuthRequest, res: Response) {
  const { year, month } = req.query;
  const unitIds = await getUserUnitIds(req.userId!);
  const contracts = await prisma.contract.findMany({ where: { unitId: { in: unitIds } } });
  const contractIds = contracts.map((c) => c.id);

  const records = await prisma.rentRecord.findMany({
    where: {
      contractId: { in: contractIds },
      ...(year ? { year: Number(year) } : {}),
      ...(month ? { month: Number(month) } : {}),
    },
    include: {
      contract: {
        include: {
          tenant: true,
          unit: { include: { property: true } },
        },
      },
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });
  res.json(records);
}

export async function confirmPayment(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { paidDate, paidAmount, paymentMethod, notes } = req.body;

  const record = await prisma.rentRecord.findUnique({
    where: { id },
    include: { contract: { include: { unit: { include: { property: true } } } } },
  });
  if (!record || record.contract.unit.property.userId !== req.userId!) {
    res.status(404).json({ error: '找不到繳租紀錄' }); return;
  }

  const paid = Number(paidAmount ?? record.amount);
  const expected = Number(record.amount);
  const status = paid >= expected ? 'PAID' : 'PARTIAL';

  const updated = await prisma.rentRecord.update({
    where: { id },
    data: {
      paidDate: paidDate ? new Date(paidDate) : new Date(),
      paidAmount: paid,
      status,
      paymentMethod,
      notes,
    },
  });
  res.json(updated);
}

export async function markOverdue(req: AuthRequest, res: Response) {
  const now = new Date();
  const unitIds = await getUserUnitIds(req.userId!);
  const contracts = await prisma.contract.findMany({ where: { unitId: { in: unitIds }, status: 'ACTIVE' } });
  const contractIds = contracts.map((c) => c.id);

  const updated = await prisma.rentRecord.updateMany({
    where: {
      contractId: { in: contractIds },
      status: 'PENDING',
      dueDate: { lt: startOfTodayTaipei(now) },
    },
    data: { status: 'OVERDUE' },
  });
  res.json({ updated: updated.count });
}

export async function sendReminder(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const record = await prisma.rentRecord.findUnique({
    where: { id },
    include: {
      contract: {
        include: {
          tenant: true,
          unit: { include: { property: true } },
        },
      },
    },
  });
  if (!record || record.contract.unit.property.userId !== req.userId!) {
    res.status(404).json({ error: '找不到繳租紀錄' }); return;
  }

  const { tenant, unit } = record.contract;
  const text = `📢 繳租提醒\n您好 ${tenant.name}，${record.year} 年 ${record.month} 月車位 ${unit.unitNumber} 租金 NT$${Number(record.amount).toLocaleString()} ${record.status === 'OVERDUE' ? '已逾期，' : '即將到期，'}請盡快繳納。`;
  const sent = await sendTenantMessage(tenant.id, text);
  res.json({ sent, message: sent ? '提醒已發送' : '車主未綁定 LINE，提醒未送出' });
}
