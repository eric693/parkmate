"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeAllocations = computeAllocations;
const app_1 = require("../app");
// 取得停車場內目前有 ACTIVE 合約的車位（分攤對象）
async function activeUnits(propertyId) {
    return app_1.prisma.unit.findMany({
        where: { propertyId, contracts: { some: { status: 'ACTIVE' } } },
    });
}
async function computeAllocations(propertyId, totalAmount, method, inputs) {
    const units = await activeUnits(propertyId);
    if (units.length === 0)
        return [];
    const usageMap = new Map(inputs.map((i) => [i.unitId, i.usage ?? 0]));
    // 計算每間的權重
    const weights = units.map((u) => {
        let w = 1;
        let basis = null;
        if (method === 'AREA') {
            basis = u.areaPing ? Number(u.areaPing) : 0;
            w = basis;
        }
        else if (method === 'HEADCOUNT') {
            basis = u.occupants ?? 1;
            w = basis;
        }
        else if (method === 'USAGE') {
            basis = usageMap.get(u.id) ?? 0;
            w = basis;
        }
        return { unit: u, weight: w, basis };
    });
    const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
    // 權重全為 0（例如坪數未填）→ 退回平均分攤
    const fallbackEven = totalWeight <= 0;
    // 四捨五入到整數，最後一間吸收餘額避免加總不符
    const result = [];
    let allocated = 0;
    weights.forEach((w, idx) => {
        const isLast = idx === weights.length - 1;
        let amount;
        if (isLast) {
            amount = Math.round((totalAmount - allocated) * 100) / 100;
        }
        else {
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
