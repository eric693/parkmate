"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrepaidOverview = getPrepaidOverview;
exports.getPrepaidCandidates = getPrepaidCandidates;
exports.updatePrepaidConfig = updatePrepaidConfig;
exports.postTopUp = postTopUp;
exports.postUsage = postUsage;
exports.postAdjust = postAdjust;
exports.getPrepaidRecords = getPrepaidRecords;
exports.triggerPrepaidCheck = triggerPrepaidCheck;
const app_1 = require("../app");
const prepaidService_1 = require("../services/prepaidService");
/** 確認車位屬於這位業者，避免跨帳號操作。 */
async function ownedUnit(userId, unitId) {
    return app_1.prisma.unit.findFirst({
        where: { id: unitId, property: { userId } },
        include: { property: { select: { name: true } } },
    });
}
async function threshold(userId) {
    const rule = await app_1.prisma.notificationRule.findUnique({
        where: { userId_kind: { userId, kind: 'PREPAID_LOW' } },
    });
    return Number(rule?.threshold ?? 300);
}
/** 預付電表總覽：所有啟用的車位 + 餘額 + 預估用完日期，低餘額排前面。 */
async function getPrepaidOverview(req, res) {
    const userId = req.userId;
    const th = await threshold(userId);
    const units = await app_1.prisma.unit.findMany({
        where: { prepaidEnabled: true, property: { userId } },
        include: {
            property: { select: { id: true, name: true } },
            contracts: { where: { status: 'ACTIVE' }, include: { tenant: { select: { name: true } } } },
        },
    });
    const rows = await Promise.all(units.map(async (u) => {
        const status = await (0, prepaidService_1.getPrepaidStatus)(u.id, th);
        return {
            ...status,
            unitId: u.id,
            unitNumber: u.unitNumber,
            propertyName: u.property.name,
            tenantName: u.contracts[0]?.tenant.name ?? null,
            unitPrice: u.prepaidUnitPrice ? Number(u.prepaidUnitPrice) : null,
            alertedAt: u.prepaidLowAlertedAt,
        };
    }));
    // 快用完的排最前面：先低餘額，再依剩餘天數
    rows.sort((a, b) => {
        if (a.low !== b.low)
            return a.low ? -1 : 1;
        if (a.daysLeft == null)
            return 1;
        if (b.daysLeft == null)
            return -1;
        return a.daysLeft - b.daysLeft;
    });
    res.json({ threshold: th, units: rows });
}
/** 可設為預付電表的車位清單（含尚未啟用的），供設定畫面挑選。 */
async function getPrepaidCandidates(req, res) {
    const units = await app_1.prisma.unit.findMany({
        where: { property: { userId: req.userId } },
        include: { property: { select: { name: true } } },
        orderBy: [{ propertyId: 'asc' }, { unitNumber: 'asc' }],
    });
    res.json(units.map((u) => ({
        unitId: u.id,
        unitNumber: u.unitNumber,
        propertyName: u.property.name,
        prepaidEnabled: u.prepaidEnabled,
        balance: Number(u.prepaidBalance),
        unitPrice: u.prepaidUnitPrice ? Number(u.prepaidUnitPrice) : null,
    })));
}
/** 啟用／停用預付電表，設定每度電價。 */
async function updatePrepaidConfig(req, res) {
    const { unitId } = req.params;
    const unit = await ownedUnit(req.userId, unitId);
    if (!unit) {
        res.status(404).json({ error: '找不到車位' });
        return;
    }
    const { prepaidEnabled, unitPrice } = req.body;
    const updated = await app_1.prisma.unit.update({
        where: { id: unitId },
        data: {
            ...(prepaidEnabled !== undefined ? { prepaidEnabled: Boolean(prepaidEnabled) } : {}),
            ...(unitPrice !== undefined ? { prepaidUnitPrice: unitPrice === null ? null : Number(unitPrice) } : {}),
        },
    });
    res.json({
        unitId: updated.id,
        prepaidEnabled: updated.prepaidEnabled,
        unitPrice: updated.prepaidUnitPrice ? Number(updated.prepaidUnitPrice) : null,
    });
}
async function postTopUp(req, res) {
    const { unitId } = req.params;
    const unit = await ownedUnit(req.userId, unitId);
    if (!unit) {
        res.status(404).json({ error: '找不到車位' });
        return;
    }
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ error: '儲值金額必須大於 0' });
        return;
    }
    const balance = await (0, prepaidService_1.topUp)(unitId, amount, req.body.note, await threshold(req.userId));
    res.json({ balance });
}
async function postUsage(req, res) {
    const { unitId } = req.params;
    const unit = await ownedUnit(req.userId, unitId);
    if (!unit) {
        res.status(404).json({ error: '找不到車位' });
        return;
    }
    const { amount, kwh, note } = req.body;
    try {
        const balance = await (0, prepaidService_1.recordUsage)(unitId, {
            amount: amount === undefined || amount === '' ? undefined : Number(amount),
            kwh: kwh === undefined || kwh === '' ? undefined : Number(kwh),
            note,
        });
        res.json({ balance });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
}
async function postAdjust(req, res) {
    const { unitId } = req.params;
    const unit = await ownedUnit(req.userId, unitId);
    if (!unit) {
        res.status(404).json({ error: '找不到車位' });
        return;
    }
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount === 0) {
        res.status(400).json({ error: '調整金額不可為 0' });
        return;
    }
    const balance = await (0, prepaidService_1.adjustBalance)(unitId, amount, req.body.note);
    res.json({ balance });
}
/** 單一車位的儲值／用電流水帳。 */
async function getPrepaidRecords(req, res) {
    const { unitId } = req.params;
    const unit = await ownedUnit(req.userId, unitId);
    if (!unit) {
        res.status(404).json({ error: '找不到車位' });
        return;
    }
    const records = await app_1.prisma.prepaidRecord.findMany({
        where: { unitId },
        orderBy: { createdAt: 'desc' },
        take: 100,
    });
    const status = await (0, prepaidService_1.getPrepaidStatus)(unitId, await threshold(req.userId));
    res.json({
        unitNumber: unit.unitNumber,
        propertyName: unit.property.name,
        ...status,
        records: records.map((r) => ({
            ...r,
            amount: Number(r.amount),
            kwh: r.kwh ? Number(r.kwh) : null,
            balanceAfter: Number(r.balanceAfter),
        })),
    });
}
/** 立即跑一次低餘額巡檢，用來測試設定是否正確。 */
async function triggerPrepaidCheck(req, res) {
    const result = await (0, prepaidService_1.checkPrepaidBalances)(req.userId, await threshold(req.userId));
    res.json({ message: `已發送 ${result.alerted} 則餘額不足告警`, ...result });
}
