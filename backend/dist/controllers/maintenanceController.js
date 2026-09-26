"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMaintenanceRequests = getMaintenanceRequests;
exports.createMaintenanceRequest = createMaintenanceRequest;
exports.analyzeMaintenanceRequest = analyzeMaintenanceRequest;
exports.updateMaintenanceRequest = updateMaintenanceRequest;
const app_1 = require("../app");
const lineService_1 = require("../services/lineService");
const aiService_1 = require("../services/aiService");
async function getUserUnitIds(userId) {
    const properties = await app_1.prisma.property.findMany({ where: { userId } });
    const propertyIds = properties.map((p) => p.id);
    const units = await app_1.prisma.unit.findMany({ where: { propertyId: { in: propertyIds } } });
    return units.map((u) => u.id);
}
async function getMaintenanceRequests(req, res) {
    const unitIds = await getUserUnitIds(req.userId);
    const { status } = req.query;
    const requests = await app_1.prisma.maintenanceRequest.findMany({
        where: {
            unitId: { in: unitIds },
            ...(status ? { status: status } : {}),
        },
        include: {
            unit: { include: { property: true } },
            tenant: true,
        },
        orderBy: [{ priority: 'desc' }, { reportedAt: 'desc' }],
    });
    res.json(requests);
}
async function createMaintenanceRequest(req, res) {
    const { unitId, tenantId, title, description, priority } = req.body;
    if (!unitId || !title || !description) {
        res.status(400).json({ error: '請填寫所有必填欄位' });
        return;
    }
    const unit = await app_1.prisma.unit.findFirst({ where: { id: unitId }, include: { property: true } });
    if (!unit || unit.property.userId !== req.userId) {
        res.status(404).json({ error: '找不到車位' });
        return;
    }
    const request = await app_1.prisma.maintenanceRequest.create({
        data: { unitId, tenantId, title, description, priority: priority ?? 'MEDIUM' },
        include: { unit: { include: { property: true } }, tenant: true },
    });
    await (0, lineService_1.sendLandlordMessage)(req.userId, `🔧 新報修通知\n車位：${unit.unitNumber}\n項目：${title}\n優先級：${priority ?? '中'}`);
    res.status(201).json(request);
}
// 業者：對一張報修單做 AI 深度分析（責任歸屬 + 費用估算），結果存入 aiAnalysis
async function analyzeMaintenanceRequest(req, res) {
    const { id } = req.params;
    const request = await app_1.prisma.maintenanceRequest.findFirst({
        where: { id },
        include: { unit: { include: { property: true } } },
    });
    if (!request || request.unit.property.userId !== req.userId) {
        res.status(404).json({ error: '找不到報修單' });
        return;
    }
    const analysis = await (0, aiService_1.analyzeMaintenance)(request.title, request.description, request.category ?? undefined);
    const updated = await app_1.prisma.maintenanceRequest.update({
        where: { id },
        data: { aiAnalysis: analysis },
    });
    res.json({ ...analysis, request: updated });
}
async function updateMaintenanceRequest(req, res) {
    const { id } = req.params;
    const { status, notes, cost } = req.body;
    const request = await app_1.prisma.maintenanceRequest.findFirst({
        where: { id },
        include: { unit: { include: { property: true } } },
    });
    if (!request || request.unit.property.userId !== req.userId) {
        res.status(404).json({ error: '找不到報修單' });
        return;
    }
    const updated = await app_1.prisma.maintenanceRequest.update({
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
