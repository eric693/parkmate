import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';
import { getComps, pricingForUnit } from '../services/rentCompsService';

// 全平台租金行情（匿名統計）
export async function getRentComps(_req: AuthRequest, res: Response) {
  const comps = await getComps();
  // 樣本數 < 3 不對外揭露（避免反推個別物件）
  res.json(comps.filter((c) => c.sampleSize >= 3).sort((a, b) => b.sampleSize - a.sampleSize));
}

// 針對業者某車位的定價建議
export async function getUnitPricing(req: AuthRequest, res: Response) {
  const { unitId } = req.params;
  const unit = await prisma.unit.findFirst({ where: { id: unitId, property: { userId: req.userId! } } });
  if (!unit) {
    res.status(404).json({ error: '找不到車位' });
    return;
  }
  const suggestion = await pricingForUnit(unitId);
  res.json(suggestion);
}
