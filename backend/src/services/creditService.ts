import { prisma } from '../app';

// 車主信用分：依繳租紀錄計算，跨業者以身分證字號聚合（同一人在多位業者的歷史合併）。
// 分數區間 300-850（類比聯徵），預設基準 600，依準時率、逾期天數、樣本數調整。

export interface CreditResult {
  score: number;
  grade: string;
  onTimeRate: number;
  avgDelayDays: number;
  totalRecords: number;
  crossLandlord: boolean;
  breakdown: { onTime: number; late: number; overdue: number; partial: number };
}

function grade(score: number): string {
  if (score >= 800) return 'A+';
  if (score >= 740) return 'A';
  if (score >= 670) return 'B';
  if (score >= 580) return 'C';
  return 'D';
}

// 計算單一車主的信用分。會找出所有「同一身分證字號」的 tenant（跨業者）一起納入。
export async function computeCredit(tenantId: string): Promise<CreditResult> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error('找不到車主');

  // 跨業者聚合：相同身分證字號視為同一人
  const peerIds = tenant.idNumber
    ? (await prisma.tenant.findMany({ where: { idNumber: tenant.idNumber }, select: { id: true } })).map((t) => t.id)
    : [tenantId];
  const crossLandlord = peerIds.length > 1;

  const records = await prisma.rentRecord.findMany({
    where: { contract: { tenantId: { in: peerIds } }, status: { in: ['PAID', 'OVERDUE', 'PARTIAL', 'PENDING'] } },
  });

  // 只把「已到期」的帳單納入評分（未到期的 PENDING 不算數）
  const now = new Date();
  const due = records.filter((r) => r.dueDate <= now);
  const totalRecords = due.length;

  const breakdown = { onTime: 0, late: 0, overdue: 0, partial: 0 };
  let delaySum = 0;
  let delayCount = 0;

  for (const r of due) {
    if (r.status === 'PAID') {
      if (r.paidDate && r.paidDate <= r.dueDate) {
        breakdown.onTime++;
      } else {
        breakdown.late++;
        if (r.paidDate) {
          const d = Math.ceil((r.paidDate.getTime() - r.dueDate.getTime()) / 86400000);
          delaySum += Math.max(0, d);
          delayCount++;
        }
      }
    } else if (r.status === 'PARTIAL') {
      breakdown.partial++;
    } else {
      // OVERDUE 或仍 PENDING 但已過期 → 視為逾期未繳
      breakdown.overdue++;
      const d = Math.ceil((now.getTime() - r.dueDate.getTime()) / 86400000);
      delaySum += Math.max(0, d);
      delayCount++;
    }
  }

  const onTimeRate = totalRecords > 0 ? breakdown.onTime / totalRecords : 0;
  const avgDelayDays = delayCount > 0 ? delaySum / delayCount : 0;

  // 計分模型
  let score = 600; // 基準
  if (totalRecords === 0) {
    // 無紀錄：中性偏保守
    return { score: 600, grade: grade(600), onTimeRate: 0, avgDelayDays: 0, totalRecords: 0, crossLandlord, breakdown };
  }
  score += Math.round(onTimeRate * 200); // 準時率最多 +200
  score -= breakdown.overdue * 40; // 每筆逾期未繳 -40
  score -= breakdown.late * 12; // 每筆遲繳 -12
  score -= breakdown.partial * 20; // 每筆部分繳 -20
  score -= Math.round(Math.min(avgDelayDays, 30) * 2); // 平均逾期天數最多 -60
  // 樣本越多越可信，少於 6 筆向基準收斂
  if (totalRecords < 6) {
    score = Math.round(600 + (score - 600) * (totalRecords / 6));
  }
  score = Math.min(850, Math.max(300, score));

  return { score, grade: grade(score), onTimeRate, avgDelayDays, totalRecords, crossLandlord, breakdown };
}

// 計算並寫入快照（供列表快速讀取）
export async function refreshCreditSnapshot(tenantId: string): Promise<CreditResult> {
  const result = await computeCredit(tenantId);
  await prisma.tenantCreditSnapshot.upsert({
    where: { tenantId },
    create: {
      tenantId,
      score: result.score,
      grade: result.grade,
      onTimeRate: result.onTimeRate,
      avgDelayDays: result.avgDelayDays,
      totalRecords: result.totalRecords,
      crossLandlord: result.crossLandlord,
    },
    update: {
      score: result.score,
      grade: result.grade,
      onTimeRate: result.onTimeRate,
      avgDelayDays: result.avgDelayDays,
      totalRecords: result.totalRecords,
      crossLandlord: result.crossLandlord,
      computedAt: new Date(),
    },
  });
  return result;
}
