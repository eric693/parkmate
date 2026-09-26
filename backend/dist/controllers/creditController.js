"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTenantCredit = getTenantCredit;
exports.getTenantsCreditOverview = getTenantsCreditOverview;
exports.getMyCredit = getMyCredit;
const app_1 = require("../app");
const creditService_1 = require("../services/creditService");
// 業者：查單一車主的信用分（即時計算並更新快照）
async function getTenantCredit(req, res) {
    const { id } = req.params;
    const tenant = await app_1.prisma.tenant.findFirst({ where: { id, userId: req.userId } });
    if (!tenant) {
        res.status(404).json({ error: '找不到車主' });
        return;
    }
    const result = await (0, creditService_1.refreshCreditSnapshot)(id);
    res.json({ tenantId: id, tenantName: tenant.name, ...result });
}
// 業者：所有車主的信用分總覽（用快照，缺則即時算）
async function getTenantsCreditOverview(req, res) {
    const tenants = await app_1.prisma.tenant.findMany({
        where: { userId: req.userId },
        include: { creditSnapshot: true },
        orderBy: { createdAt: 'desc' },
    });
    const rows = await Promise.all(tenants.map(async (t) => {
        let snap = t.creditSnapshot;
        // 無快照或超過 24 小時 → 重新計算
        if (!snap || Date.now() - snap.computedAt.getTime() > 86400000) {
            const r = await (0, creditService_1.refreshCreditSnapshot)(t.id);
            return { tenantId: t.id, tenantName: t.name, score: r.score, grade: r.grade, onTimeRate: r.onTimeRate, totalRecords: r.totalRecords, crossLandlord: r.crossLandlord };
        }
        return { tenantId: t.id, tenantName: t.name, score: snap.score, grade: snap.grade, onTimeRate: snap.onTimeRate, totalRecords: snap.totalRecords, crossLandlord: snap.crossLandlord };
    }));
    rows.sort((a, b) => b.score - a.score);
    res.json(rows);
}
// 車主端：查自己的信用分（可主動向新業者出示）
async function getMyCredit(req, res) {
    const result = await (0, creditService_1.computeCredit)(req.tenantId);
    res.json(result);
}
