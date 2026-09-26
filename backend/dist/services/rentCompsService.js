"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferDistrict = inferDistrict;
exports.getComps = getComps;
exports.pricingForUnit = pricingForUnit;
const app_1 = require("../app");
// 在地租金行情：聚合「全平台」的合約租金（跨業者，匿名統計）作為行情基準。
// 資料越多越準 → 自我強化的資料護城河。分群維度：行政區 + 房型。
// 從地址粗略推斷行政區（未填 district 時的後援）
function inferDistrict(address) {
    const m = /(.+?[縣市])?(.+?[區鄉鎮市])/.exec(address);
    if (m)
        return `${m[1] ?? ''}${m[2]}`;
    return null;
}
function median(nums) {
    if (nums.length === 0)
        return 0;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
// 全平台行情快取（避免每次全表掃描）。簡單記憶體快取，TTL 10 分鐘。
let cache = null;
const TTL = 10 * 60 * 1000;
async function buildComps() {
    const contracts = await app_1.prisma.contract.findMany({
        where: { status: { in: ['ACTIVE', 'EXPIRED'] } },
        include: { unit: { include: { property: true } } },
    });
    // key = district|type
    const buckets = new Map();
    for (const c of contracts) {
        const district = c.unit.property.district ?? inferDistrict(c.unit.property.address) ?? '未分區';
        const type = c.unit.type ?? '未分類';
        const key = `${district}|${type}`;
        if (!buckets.has(key))
            buckets.set(key, { rents: [], perPing: [], district, type });
        const b = buckets.get(key);
        const rent = Number(c.monthlyRent);
        b.rents.push(rent);
        if (c.unit.areaPing && Number(c.unit.areaPing) > 0)
            b.perPing.push(rent / Number(c.unit.areaPing));
    }
    return [...buckets.values()].map((b) => ({
        district: b.district,
        type: b.type,
        sampleSize: b.rents.length,
        medianRent: median(b.rents),
        avgRent: Math.round(b.rents.reduce((s, r) => s + r, 0) / b.rents.length),
        minRent: Math.min(...b.rents),
        maxRent: Math.max(...b.rents),
        medianPerPing: b.perPing.length ? median(b.perPing) : null,
    }));
}
async function getComps() {
    if (cache && Date.now() - cache.at < TTL)
        return cache.rows;
    const rows = await buildComps();
    cache = { at: Date.now(), rows };
    return rows;
}
// 針對某車位給定價建議（與在地行情比較）
async function pricingForUnit(unitId) {
    const unit = await app_1.prisma.unit.findUnique({ where: { id: unitId }, include: { property: true } });
    if (!unit)
        return null;
    const district = unit.property.district ?? inferDistrict(unit.property.address) ?? '未分區';
    const type = unit.type ?? '未分類';
    const comps = await getComps();
    // 同區同房型；樣本不足時退回同區所有房型
    let comp = comps.find((c) => c.district === district && c.type === type && c.sampleSize >= 3);
    if (!comp) {
        const sameDistrict = comps.filter((c) => c.district === district);
        if (sameDistrict.length) {
            const rents = sameDistrict.flatMap((c) => Array(c.sampleSize).fill(c.medianRent));
            comp = {
                district, type: '全房型',
                sampleSize: rents.length,
                medianRent: median(rents),
                avgRent: Math.round(rents.reduce((s, r) => s + r, 0) / rents.length),
                minRent: Math.min(...rents), maxRent: Math.max(...rents), medianPerPing: null,
            };
        }
    }
    const yourRent = Number(unit.monthlyRent);
    if (!comp || comp.sampleSize < 3) {
        return {
            district, type, yourRent, marketMedian: 0, marketRange: [0, 0], sampleSize: comp?.sampleSize ?? 0,
            position: 'NO_DATA', deltaPct: 0,
            advice: '此區域資料樣本不足，尚無法提供行情建議。隨著平台資料累積會逐步開放。',
        };
    }
    const deltaPct = Math.round(((yourRent - comp.medianRent) / comp.medianRent) * 100);
    let position = 'INLINE';
    let advice = '';
    if (deltaPct <= -8) {
        position = 'BELOW';
        advice = `租金低於在地行情 ${Math.abs(deltaPct)}%，有調漲空間。中位數約 NT$${comp.medianRent.toLocaleString()}。`;
    }
    else if (deltaPct >= 8) {
        position = 'ABOVE';
        advice = `租金高於在地行情 ${deltaPct}%，若去化不易可考慮調整或強化賣點。中位數約 NT$${comp.medianRent.toLocaleString()}。`;
    }
    else {
        advice = `租金與在地行情相當（中位數約 NT$${comp.medianRent.toLocaleString()}），定價合理。`;
    }
    return {
        district, type, yourRent,
        marketMedian: comp.medianRent,
        marketRange: [comp.minRent, comp.maxRent],
        sampleSize: comp.sampleSize,
        position, deltaPct, advice,
    };
}
