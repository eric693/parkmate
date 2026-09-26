import { Request, Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../middleware/auth';
import { TenantRequest } from '../middleware/tenantAuth';
import { prisma } from '../app';
import { config } from '../config';
import { saveBase64Images } from '../services/uploadService';
import { sendTenantMessage, sendLandlordMessage } from '../services/lineService';

// 點交項目：每筆一個區域/物件，可附多張照片（時間戳存證）
interface HandoverItem {
  id: string;
  area: string;
  description: string;
  condition: string; // GOOD | WORN | DAMAGED
  photos: string[];
  // 搬出點交時，若損壞需扣押金可帶金額
  deductAmount?: number;
}

async function loadOwnedContract(contractId: string, userId: string) {
  return prisma.contract.findFirst({
    where: { id: contractId, unit: { property: { userId } } },
    include: { tenant: true, unit: { include: { property: true } } },
  });
}

// 業者：列出某合約的點交紀錄
export async function getHandovers(req: AuthRequest, res: Response) {
  const { contractId } = req.params;
  const contract = await loadOwnedContract(contractId, req.userId!);
  if (!contract) {
    res.status(404).json({ error: '找不到合約' });
    return;
  }
  const handovers = await prisma.handover.findMany({
    where: { contractId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(handovers);
}

// 業者：建立點交紀錄。items[].photos 為 base64 陣列，寫檔後存路徑。
export async function createHandover(req: AuthRequest, res: Response) {
  const { contractId } = req.params;
  const { type, items, meterReadings, note } = req.body;
  if (!['MOVE_IN', 'MOVE_OUT'].includes(type)) {
    res.status(400).json({ error: 'type 須為 MOVE_IN 或 MOVE_OUT' });
    return;
  }
  const contract = await loadOwnedContract(contractId, req.userId!);
  if (!contract) {
    res.status(404).json({ error: '找不到合約' });
    return;
  }

  const persistedItems: HandoverItem[] = (Array.isArray(items) ? items : []).map((it: any) => ({
    id: it.id ?? crypto.randomBytes(4).toString('hex'),
    area: String(it.area ?? ''),
    description: String(it.description ?? ''),
    condition: ['GOOD', 'WORN', 'DAMAGED'].includes(it.condition) ? it.condition : 'GOOD',
    photos: Array.isArray(it.photos) ? saveBase64Images(it.photos, 'handover', 8) : [],
    deductAmount: it.deductAmount ? Number(it.deductAmount) : undefined,
  }));

  const handover = await prisma.handover.create({
    data: {
      contractId,
      type,
      items: persistedItems as any,
      meterReadings: meterReadings ?? undefined,
      note: note ?? undefined,
    },
  });
  res.status(201).json(handover);
}

// 業者：更新點交（草稿期間補拍照片/修內容）。新照片以 base64 傳入會附加。
export async function updateHandover(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { items, meterReadings, note } = req.body;
  const existing = await prisma.handover.findFirst({
    where: { id, contract: { unit: { property: { userId: req.userId! } } } },
  });
  if (!existing) {
    res.status(404).json({ error: '找不到點交紀錄' });
    return;
  }
  if (existing.status === 'CONFIRMED') {
    res.status(400).json({ error: '已確認的點交不可修改' });
    return;
  }

  let persistedItems = existing.items;
  if (Array.isArray(items)) {
    persistedItems = items.map((it: any) => ({
      id: it.id ?? crypto.randomBytes(4).toString('hex'),
      area: String(it.area ?? ''),
      description: String(it.description ?? ''),
      condition: ['GOOD', 'WORN', 'DAMAGED'].includes(it.condition) ? it.condition : 'GOOD',
      // 既有照片路徑保留，新 base64 寫檔
      photos: [
        ...(Array.isArray(it.photos) ? it.photos.filter((p: string) => p.startsWith('/uploads/')) : []),
        ...saveBase64Images(
          (Array.isArray(it.photos) ? it.photos : []).filter((p: string) => p.startsWith('data:')),
          'handover',
          8,
        ),
      ],
      deductAmount: it.deductAmount ? Number(it.deductAmount) : undefined,
    })) as any;
  }

  const updated = await prisma.handover.update({
    where: { id },
    data: {
      items: persistedItems as any,
      meterReadings: meterReadings ?? existing.meterReadings ?? undefined,
      note: note ?? existing.note ?? undefined,
    },
  });
  res.json(updated);
}

// 業者：送出給車主確認 → 產生 token、狀態轉 PENDING_TENANT、LINE 通知附確認連結
export async function sendHandoverForConfirmation(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const handover = await prisma.handover.findFirst({
    where: { id, contract: { unit: { property: { userId: req.userId! } } } },
    include: { contract: { include: { tenant: true, unit: { include: { property: true } } } } },
  });
  if (!handover) {
    res.status(404).json({ error: '找不到點交紀錄' });
    return;
  }
  const token = crypto.randomBytes(24).toString('hex');
  await prisma.handover.update({
    where: { id },
    data: { status: 'PENDING_TENANT', confirmToken: token },
  });

  const typeLabel = handover.type === 'MOVE_IN' ? '承租點交' : '退租點交';
  const link = `${config.appUrl}/handover/confirm/${token}`;
  await sendTenantMessage(
    handover.contract.tenant.id,
    `${typeLabel}確認\n\n${handover.contract.tenant.name} 您好，業者已建立「${handover.contract.unit.property.name} ${handover.contract.unit.unitNumber}」的${typeLabel}紀錄，請點擊確認：\n${link}`,
  );
  res.json({ ok: true, confirmToken: token, link });
}

// 公開：以 token 取得點交內容（車主確認頁，無需登入）
export async function getHandoverByToken(req: Request, res: Response) {
  const { token } = req.params;
  const handover = await prisma.handover.findUnique({
    where: { confirmToken: token },
    include: { contract: { include: { tenant: { select: { name: true } }, unit: { include: { property: { select: { name: true } } } } } } },
  });
  if (!handover) {
    res.status(404).json({ error: '連結無效或已失效' });
    return;
  }
  res.json(handover);
}

// 公開：車主以 token 確認簽核
export async function confirmHandoverByToken(req: Request, res: Response) {
  const { token } = req.params;
  const { signerName } = req.body;
  const handover = await prisma.handover.findUnique({
    where: { confirmToken: token },
    include: { contract: { include: { unit: { include: { property: true } } } } },
  });
  if (!handover) {
    res.status(404).json({ error: '連結無效或已失效' });
    return;
  }
  if (handover.status === 'CONFIRMED') {
    res.status(400).json({ error: '此點交已確認' });
    return;
  }
  const updated = await finalizeConfirmation(handover, signerName);
  res.json(updated);
}

// 共用：簽核完成 → 狀態 CONFIRMED；若為退租點交且有損壞扣款，連動建立押金扣款
async function finalizeConfirmation(handover: any, signerName?: string) {
  const updated = await prisma.handover.update({
    where: { id: handover.id },
    data: { status: 'CONFIRMED', tenantSignedAt: new Date(), signerName: signerName ?? null, confirmToken: null },
  });

  // 退租點交 → 把損壞且有扣款金額的項目寫進押金扣款
  if (handover.type === 'MOVE_OUT') {
    const items: HandoverItem[] = (handover.items as any) ?? [];
    const deductItems = items.filter((i) => i.condition === 'DAMAGED' && i.deductAmount && i.deductAmount > 0);
    if (deductItems.length > 0) {
      const contract = await prisma.contract.findUnique({ where: { id: handover.contractId } });
      if (contract) {
        const refund = await prisma.depositRefund.upsert({
          where: { contractId: handover.contractId },
          create: {
            contractId: handover.contractId,
            depositAmount: contract.depositAmount,
            totalDeductions: 0,
            refundAmount: contract.depositAmount,
          },
          update: {},
          include: { deductions: true },
        });
        await prisma.depositDeduction.createMany({
          data: deductItems.map((i) => ({
            depositRefundId: refund.id,
            description: `點交損壞：${i.area} ${i.description}`.trim(),
            amount: i.deductAmount!,
            category: 'DAMAGE',
          })),
        });
        // 重算退還金額
        const all = await prisma.depositDeduction.findMany({ where: { depositRefundId: refund.id } });
        const totalDeductions = all.reduce((s, d) => s + Number(d.amount), 0);
        await prisma.depositRefund.update({
          where: { id: refund.id },
          data: {
            totalDeductions,
            refundAmount: Math.max(0, Number(refund.depositAmount) - totalDeductions),
          },
        });
      }
    }
  }

  await sendLandlordMessage(
    handover.contract.unit.property.userId,
    `點交已確認\n\n${handover.contract.unit.property.name} ${handover.contract.unit.unitNumber} 的${handover.type === 'MOVE_IN' ? '承租' : '退租'}點交已由車主確認簽核。`,
  );
  return updated;
}

// 車主端（已登入 portal）：列出自己合約的點交
export async function tenantHandovers(req: TenantRequest, res: Response) {
  const handovers = await prisma.handover.findMany({
    where: { contract: { tenantId: req.tenantId! } },
    include: { contract: { include: { unit: { include: { property: { select: { name: true } } } } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(handovers);
}

// 車主端（已登入 portal）：確認點交
export async function tenantConfirmHandover(req: TenantRequest, res: Response) {
  const { id } = req.params;
  const handover = await prisma.handover.findFirst({
    where: { id, contract: { tenantId: req.tenantId! } },
    include: { contract: { include: { tenant: true, unit: { include: { property: true } } } } },
  });
  if (!handover) {
    res.status(404).json({ error: '找不到點交紀錄' });
    return;
  }
  if (handover.status === 'CONFIRMED') {
    res.status(400).json({ error: '此點交已確認' });
    return;
  }
  const updated = await finalizeConfirmation(handover, handover.contract.tenant.name);
  res.json(updated);
}
