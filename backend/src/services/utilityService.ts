import { prisma } from '../app';

// 水電費分攤：把一張總單拆給該停車場目前有「在住合約」的車位。
// 方法：EVEN 平均 / AREA 坪數 / HEADCOUNT 人頭 / USAGE 自訂用量。

export type SplitMethod = 'EVEN' | 'AREA' | 'HEADCOUNT' | 'USAGE';

export interface AllocationInput {
  unitId: string;
  usage?: number; // method=USAGE 時的用量值（度數/噸數）
}

export interface ComputedAllocation {
  unitId: string;
  unitNumber: string;
  amount: number;
  basis: number | null;
}

// 取得停車場內目前有 ACTIVE 合約的車位（分攤對象）
async function activeUnits(propertyId: string) {
  return prisma.unit.findMany({
    where: { propertyId, contracts: { some: { status: 'ACTIVE' } } },
  });
}

export async function computeAllocations(
  propertyId: string,
  totalAmount: number,
  method: SplitMethod,
  inputs: AllocationInput[],
): Promise<ComputedAllocation[]> {
  const units = await activeUnits(propertyId);
  if (units.length === 0) return [];

  const usageMap = new Map(inputs.map((i) => [i.unitId, i.usage ?? 0]));

  // 計算每間的權重
  const weights = units.map((u) => {
    let w = 1;
    let basis: number | null = null;
    if (method === 'AREA') {
      basis = u.areaPing ? Number(u.areaPing) : 0;
      w = basis;
    } else if (method === 'HEADCOUNT') {
      basis = u.occupants ?? 1;
      w = basis;
    } else if (method === 'USAGE') {
      basis = usageMap.get(u.id) ?? 0;
      w = basis;
    }
    return { unit: u, weight: w, basis };
  });

  const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
  // 權重全為 0（例如坪數未填）→ 退回平均分攤
  const fallbackEven = totalWeight <= 0;

  // 四捨五入到整數，最後一間吸收餘額避免加總不符
  const result: ComputedAllocation[] = [];
  let allocated = 0;
  weights.forEach((w, idx) => {
    const isLast = idx === weights.length - 1;
    let amount: number;
    if (isLast) {
      amount = Math.round((totalAmount - allocated) * 100) / 100;
    } else {
      const share = fallbackEven ? totalAmount / weights.length : (totalAmount * w.weight) / totalWeight;
      amount = Math.round(share * 100) / 100;
      allocated += amount;
    }
    result.push({
      unitId: w.unit.id,
      unitNumber: w.unit.unitNumber,
      amount,
      basis: fallbackEven ? null : w.basis,
    });
  });
  return result;
}
