import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';
import { config } from '../config';
import { getPaymentProvider } from '../services/payment';
import { getOrCreateVirtualAccount, reconcilePayment, manualMatch, suggestMatches } from '../services/paymentService';

async function getUserContractIds(userId: string): Promise<string[]> {
  const contracts = await prisma.contract.findMany({
    where: { unit: { property: { userId } } },
    select: { id: true },
  });
  return contracts.map((c) => c.id);
}

// 業者：列出所有入帳紀錄
export async function getPayments(req: AuthRequest, res: Response) {
  const contractIds = await getUserContractIds(req.userId!);
  const payments = await prisma.payment.findMany({
    where: {
      OR: [
        { contractId: { in: contractIds } },
        { contractId: null, status: 'UNMATCHED' }, // 查無帳號的孤兒入帳
      ],
    },
    include: {
      contract: { include: { tenant: true, unit: { include: { property: true } } } },
      rentRecord: true,
    },
    orderBy: { paidAt: 'desc' },
  });
  res.json(payments);
}

// 業者：待人工處理的未匹配入帳
export async function getUnmatchedPayments(req: AuthRequest, res: Response) {
  const contractIds = await getUserContractIds(req.userId!);
  const payments = await prisma.payment.findMany({
    where: {
      status: 'UNMATCHED',
      OR: [{ contractId: { in: contractIds } }, { contractId: null }],
    },
    include: { contract: { include: { tenant: true, unit: true } } },
    orderBy: { paidAt: 'desc' },
  });
  res.json(payments);
}

// 業者：人工把一筆入帳銷到指定繳租紀錄
export async function matchPayment(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { rentRecordId } = req.body;
  if (!rentRecordId) {
    res.status(400).json({ error: '請指定繳租紀錄' });
    return;
  }
  try {
    const result = await manualMatch(id, rentRecordId, req.userId!);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? '銷帳失敗' });
  }
}

// 業者：對一筆未匹配入帳取得自動銷帳建議（依姓名/金額/期數評分）
export async function getMatchSuggestions(req: AuthRequest, res: Response) {
  const { id } = req.params;
  try {
    const suggestions = await suggestMatches(id, req.userId!);
    res.json(suggestions);
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? '無法取得建議' });
  }
}

// 業者：取得/建立合約的虛擬帳號
export async function getContractVirtualAccount(req: AuthRequest, res: Response) {
  const { contractId } = req.params;
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, unit: { property: { userId: req.userId! } } },
  });
  if (!contract) {
    res.status(404).json({ error: '找不到合約' });
    return;
  }
  const va = await getOrCreateVirtualAccount(contractId);
  res.json(va);
}

// 金流 webhook（對外，無 JWT）：provider 入帳通知 → 自動對帳
export async function paymentWebhook(req: Request, res: Response) {
  const provider = getPaymentProvider();
  if (!provider.verifyWebhook(req.body, req.headers as any)) {
    res.status(401).json({ error: 'invalid signature' });
    return;
  }
  const normalized = provider.parseWebhook(req.body);
  if (!normalized) {
    res.status(400).json({ error: 'unrecognized payload' });
    return;
  }
  try {
    const result = await reconcilePayment(normalized);
    res.json(result);
  } catch (err: any) {
    console.error('reconcile error:', err);
    res.status(500).json({ error: '對帳失敗' });
  }
}

// 業者（沙盒專用）：模擬一筆車主入帳，用來測試自動對帳全流程
export async function simulatePayment(req: AuthRequest, res: Response) {
  if (!config.payment.isSandbox) {
    res.status(403).json({ error: '僅沙盒模式可模擬入帳' });
    return;
  }
  const { contractId, amount } = req.body;
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, unit: { property: { userId: req.userId! } } },
    include: { tenant: true },
  });
  if (!contract) {
    res.status(404).json({ error: '找不到合約' });
    return;
  }
  const va = await getOrCreateVirtualAccount(contractId);
  const provider = getPaymentProvider();
  const normalized = provider.parseWebhook({
    accountNumber: va.accountNumber,
    amount: Number(amount ?? contract.monthlyRent),
    payerName: contract.tenant.name,
    providerTxnId: `SBX-${contractId}-${Date.now()}`,
  });
  const result = await reconcilePayment(normalized!);
  res.json(result);
}
