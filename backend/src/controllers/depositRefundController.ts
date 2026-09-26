import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';
import { sendTenantMessage } from '../services/lineService';

async function verifyContractOwner(contractId: string, userId: string) {
  return prisma.contract.findFirst({
    where: { id: contractId, unit: { property: { userId } } },
    include: {
      unit: { include: { property: true } },
      tenant: true,
    },
  });
}

export async function getDepositRefund(req: AuthRequest, res: Response) {
  const { contractId } = req.params;
  const contract = await verifyContractOwner(contractId, req.userId!);
  if (!contract) { res.status(404).json({ error: '找不到合約' }); return; }

  const refund = await prisma.depositRefund.findUnique({
    where: { contractId },
    include: { deductions: { orderBy: { id: 'asc' } } },
  });
  res.json(refund ?? null);
}

export async function upsertDepositRefund(req: AuthRequest, res: Response) {
  const { contractId } = req.params;
  const contract = await verifyContractOwner(contractId, req.userId!);
  if (!contract) { res.status(404).json({ error: '找不到合約' }); return; }

  const { deductions = [], notes, status } = req.body;

  const totalDeductions = (deductions as { amount: number }[]).reduce(
    (s, d) => s + Number(d.amount), 0
  );
  const depositAmount = Number(contract.depositAmount);
  const refundAmount = Math.max(0, depositAmount - totalDeductions);

  const existing = await prisma.depositRefund.findUnique({ where: { contractId } });

  let refund;
  if (existing) {
    // Replace deductions
    await prisma.depositDeduction.deleteMany({ where: { depositRefundId: existing.id } });
    refund = await prisma.depositRefund.update({
      where: { contractId },
      data: {
        totalDeductions,
        refundAmount,
        notes: notes ?? existing.notes,
        status: status ?? existing.status,
        deductions: {
          create: (deductions as { description: string; amount: number; category?: string }[]).map((d) => ({
            description: d.description,
            amount: d.amount,
            category: d.category ?? 'OTHER',
          })),
        },
      },
      include: { deductions: true },
    });
  } else {
    refund = await prisma.depositRefund.create({
      data: {
        contractId,
        depositAmount,
        totalDeductions,
        refundAmount,
        notes,
        status: status ?? 'PENDING',
        deductions: {
          create: (deductions as { description: string; amount: number; category?: string }[]).map((d) => ({
            description: d.description,
            amount: d.amount,
            category: d.category ?? 'OTHER',
          })),
        },
      },
      include: { deductions: true },
    });
  }

  res.json(refund);
}

export async function confirmRefund(req: AuthRequest, res: Response) {
  const { contractId } = req.params;
  const contract = await verifyContractOwner(contractId, req.userId!);
  if (!contract) { res.status(404).json({ error: '找不到合約' }); return; }

  const refund = await prisma.depositRefund.findUnique({ where: { contractId } });
  if (!refund) { res.status(404).json({ error: '尚未建立退押紀錄' }); return; }

  const updated = await prisma.depositRefund.update({
    where: { contractId },
    data: { status: 'COMPLETED', refundDate: new Date() },
    include: { deductions: true },
  });
  res.json(updated);
}

export async function notifyTenantRefund(req: AuthRequest, res: Response) {
  const { contractId } = req.params;
  const contract = await verifyContractOwner(contractId, req.userId!);
  if (!contract) { res.status(404).json({ error: '找不到合約' }); return; }

  const refund = await prisma.depositRefund.findUnique({
    where: { contractId },
    include: { deductions: { orderBy: { id: 'asc' } } },
  });
  if (!refund) { res.status(404).json({ error: '尚未建立退押紀錄' }); return; }

  const tenant = contract.tenant;
  const unitNum = contract.unit.unitNumber;
  const propName = contract.unit.property.name;

  const deductionLines = refund.deductions.length > 0
    ? refund.deductions.map((d) => `  • ${d.description}：-NT$${Number(d.amount).toLocaleString()}`).join('\n')
    : '  （無扣款項目）';

  const text = [
    `📋 押金退還明細`,
    ``,
    `您好 ${tenant.name}，`,
    `${propName} ${unitNum} 押金結算如下：`,
    ``,
    `💰 原始押金：NT$${Number(refund.depositAmount).toLocaleString()}`,
    ``,
    `📝 扣款明細：`,
    deductionLines,
    ``,
    `━━━━━━━━━━━━━━`,
    `🔴 扣款合計：NT$${Number(refund.totalDeductions).toLocaleString()}`,
    `🟢 應退金額：NT$${Number(refund.refundAmount).toLocaleString()}`,
    refund.status === 'COMPLETED' ? `\n✅ 已於 ${new Date(refund.refundDate!).toLocaleDateString('zh-TW')} 完成退款` : `\n⏳ 退款處理中，請稍候`,
    refund.notes ? `\n備註：${refund.notes}` : '',
  ].filter((l) => l !== undefined).join('\n');

  const sent = await sendTenantMessage(tenant.id, text);

  await prisma.depositRefund.update({
    where: { contractId },
    data: { notifiedAt: new Date() },
  });

  res.json({ sent, message: sent ? '已透過 LINE 發送明細給車主' : '車主尚未綁定 LINE，請手動告知' });
}
