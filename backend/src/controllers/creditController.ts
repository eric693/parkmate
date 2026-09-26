import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { TenantRequest } from '../middleware/tenantAuth';
import { prisma } from '../app';
import { computeCredit, refreshCreditSnapshot } from '../services/creditService';

// 業者：查單一車主的信用分（即時計算並更新快照）
export async function getTenantCredit(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const tenant = await prisma.tenant.findFirst({ where: { id, userId: req.userId! } });
  if (!tenant) {
    res.status(404).json({ error: '找不到車主' });
    return;
  }
  const result = await refreshCreditSnapshot(id);
  res.json({ tenantId: id, tenantName: tenant.name, ...result });
}

// 業者：所有車主的信用分總覽（用快照，缺則即時算）
export async function getTenantsCreditOverview(req: AuthRequest, res: Response) {
  const tenants = await prisma.tenant.findMany({
    where: { userId: req.userId! },
    include: { creditSnapshot: true },
    orderBy: { createdAt: 'desc' },
  });
  const rows = await Promise.all(
    tenants.map(async (t) => {
      let snap = t.creditSnapshot;
      // 無快照或超過 24 小時 → 重新計算
      if (!snap || Date.now() - snap.computedAt.getTime() > 86400000) {
        const r = await refreshCreditSnapshot(t.id);
        return { tenantId: t.id, tenantName: t.name, score: r.score, grade: r.grade, onTimeRate: r.onTimeRate, totalRecords: r.totalRecords, crossLandlord: r.crossLandlord };
      }
      return { tenantId: t.id, tenantName: t.name, score: snap.score, grade: snap.grade, onTimeRate: snap.onTimeRate, totalRecords: snap.totalRecords, crossLandlord: snap.crossLandlord };
    }),
  );
  rows.sort((a, b) => b.score - a.score);
  res.json(rows);
}

// 車主端：查自己的信用分（可主動向新業者出示）
export async function getMyCredit(req: TenantRequest, res: Response) {
  const result = await computeCredit(req.tenantId!);
  res.json(result);
}
