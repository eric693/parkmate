import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';
import { sendLandlordMessage } from '../services/lineService';
import { analyzeMaintenance } from '../services/aiService';

async function getUserUnitIds(userId: string): Promise<string[]> {
  const properties = await prisma.property.findMany({ where: { userId } });
  const propertyIds = properties.map((p) => p.id);
  const units = await prisma.unit.findMany({ where: { propertyId: { in: propertyIds } } });
  return units.map((u) => u.id);
}

export async function getMaintenanceRequests(req: AuthRequest, res: Response) {
  const unitIds = await getUserUnitIds(req.userId!);
  const { status } = req.query;

  const requests = await prisma.maintenanceRequest.findMany({
    where: {
      unitId: { in: unitIds },
      ...(status ? { status: status as any } : {}),
    },
    include: {
      unit: { include: { property: true } },
      tenant: true,
    },
    orderBy: [{ priority: 'desc' }, { reportedAt: 'desc' }],
  });
  res.json(requests);
}

export async function createMaintenanceRequest(req: AuthRequest, res: Response) {
  const { unitId, tenantId, title, description, priority } = req.body;
  if (!unitId || !title || !description) {
    res.status(400).json({ error: '請填寫所有必填欄位' }); return;
  }
  const unit = await prisma.unit.findFirst({ where: { id: unitId }, include: { property: true } });
  if (!unit || unit.property.userId !== req.userId!) {
    res.status(404).json({ error: '找不到車位' }); return;
  }

  const request = await prisma.maintenanceRequest.create({
    data: { unitId, tenantId, title, description, priority: priority ?? 'MEDIUM' },
    include: { unit: { include: { property: true } }, tenant: true },
  });

  await sendLandlordMessage(req.userId!, `🔧 新報修通知\n車位：${unit.unitNumber}\n項目：${title}\n優先級：${priority ?? '中'}`);

  res.status(201).json(request);
}

// 業者：對一張報修單做 AI 深度分析（責任歸屬 + 費用估算），結果存入 aiAnalysis
export async function analyzeMaintenanceRequest(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const request = await prisma.maintenanceRequest.findFirst({
    where: { id },
    include: { unit: { include: { property: true } } },
  });
  if (!request || request.unit.property.userId !== req.userId!) {
    res.status(404).json({ error: '找不到報修單' });
    return;
  }
  const analysis = await analyzeMaintenance(request.title, request.description, request.category ?? undefined);
  const updated = await prisma.maintenanceRequest.update({
    where: { id },
    data: { aiAnalysis: analysis as any },
  });
  res.json({ ...analysis, request: updated });
}

export async function updateMaintenanceRequest(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { status, notes, cost } = req.body;

  const request = await prisma.maintenanceRequest.findFirst({
    where: { id },
    include: { unit: { include: { property: true } } },
  });
  if (!request || request.unit.property.userId !== req.userId!) {
    res.status(404).json({ error: '找不到報修單' }); return;
  }

  const updated = await prisma.maintenanceRequest.update({
    where: { id },
    data: {
      status,
      notes,
      cost: cost ? Number(cost) : undefined,
      resolvedAt: status === 'COMPLETED' ? new Date() : undefined,
    },
  });
  res.json(updated);
}
