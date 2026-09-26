"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHandovers = getHandovers;
exports.createHandover = createHandover;
exports.updateHandover = updateHandover;
exports.sendHandoverForConfirmation = sendHandoverForConfirmation;
exports.getHandoverByToken = getHandoverByToken;
exports.confirmHandoverByToken = confirmHandoverByToken;
exports.tenantHandovers = tenantHandovers;
exports.tenantConfirmHandover = tenantConfirmHandover;
const crypto_1 = __importDefault(require("crypto"));
const app_1 = require("../app");
const config_1 = require("../config");
const uploadService_1 = require("../services/uploadService");
const lineService_1 = require("../services/lineService");
async function loadOwnedContract(contractId, userId) {
    return app_1.prisma.contract.findFirst({
        where: { id: contractId, unit: { property: { userId } } },
        include: { tenant: true, unit: { include: { property: true } } },
    });
}
// 業者：列出某合約的點交紀錄
async function getHandovers(req, res) {
    const { contractId } = req.params;
    const contract = await loadOwnedContract(contractId, req.userId);
    if (!contract) {
        res.status(404).json({ error: '找不到合約' });
        return;
    }
    const handovers = await app_1.prisma.handover.findMany({
        where: { contractId },
        orderBy: { createdAt: 'desc' },
    });
    res.json(handovers);
}
// 業者：建立點交紀錄。items[].photos 為 base64 陣列，寫檔後存路徑。
async function createHandover(req, res) {
    const { contractId } = req.params;
    const { type, items, meterReadings, note } = req.body;
    if (!['MOVE_IN', 'MOVE_OUT'].includes(type)) {
        res.status(400).json({ error: 'type 須為 MOVE_IN 或 MOVE_OUT' });
        return;
    }
    const contract = await loadOwnedContract(contractId, req.userId);
    if (!contract) {
        res.status(404).json({ error: '找不到合約' });
        return;
    }
    const persistedItems = (Array.isArray(items) ? items : []).map((it) => ({
        id: it.id ?? crypto_1.default.randomBytes(4).toString('hex'),
        area: String(it.area ?? ''),
        description: String(it.description ?? ''),
        condition: ['GOOD', 'WORN', 'DAMAGED'].includes(it.condition) ? it.condition : 'GOOD',
        photos: Array.isArray(it.photos) ? (0, uploadService_1.saveBase64Images)(it.photos, 'handover', 8) : [],
        deductAmount: it.deductAmount ? Number(it.deductAmount) : undefined,
    }));
    const handover = await app_1.prisma.handover.create({
        data: {
            contractId,
            type,
            items: persistedItems,
            meterReadings: meterReadings ?? undefined,
            note: note ?? undefined,
        },
    });
    res.status(201).json(handover);
}
// 業者：更新點交（草稿期間補拍照片/修內容）。新照片以 base64 傳入會附加。
async function updateHandover(req, res) {
    const { id } = req.params;
    const { items, meterReadings, note } = req.body;
    const existing = await app_1.prisma.handover.findFirst({
        where: { id, contract: { unit: { property: { userId: req.userId } } } },
    });
    if (!existing) {
        res.status(404).json({ error: '找不到點交紀錄' });
        return;
    }
    if (existing.status === 'CONFIRMED') {
        res.status(400).json({ error: '已確認的點交不可修改' });
        return;
    }
    let persistedItems = existing.items;
    if (Array.isArray(items)) {
        persistedItems = items.map((it) => ({
            id: it.id ?? crypto_1.default.randomBytes(4).toString('hex'),
            area: String(it.area ?? ''),
            description: String(it.description ?? ''),
            condition: ['GOOD', 'WORN', 'DAMAGED'].includes(it.condition) ? it.condition : 'GOOD',
            // 既有照片路徑保留，新 base64 寫檔
            photos: [
                ...(Array.isArray(it.photos) ? it.photos.filter((p) => p.startsWith('/uploads/')) : []),
                ...(0, uploadService_1.saveBase64Images)((Array.isArray(it.photos) ? it.photos : []).filter((p) => p.startsWith('data:')), 'handover', 8),
            ],
            deductAmount: it.deductAmount ? Number(it.deductAmount) : undefined,
        }));
    }
    const updated = await app_1.prisma.handover.update({
        where: { id },
        data: {
            items: persistedItems,
            meterReadings: meterReadings ?? existing.meterReadings ?? undefined,
            note: note ?? existing.note ?? undefined,
        },
    });
    res.json(updated);
}
// 業者：送出給車主確認 → 產生 token、狀態轉 PENDING_TENANT、LINE 通知附確認連結
async function sendHandoverForConfirmation(req, res) {
    const { id } = req.params;
    const handover = await app_1.prisma.handover.findFirst({
        where: { id, contract: { unit: { property: { userId: req.userId } } } },
        include: { contract: { include: { tenant: true, unit: { include: { property: true } } } } },
    });
    if (!handover) {
        res.status(404).json({ error: '找不到點交紀錄' });
        return;
    }
    const token = crypto_1.default.randomBytes(24).toString('hex');
    await app_1.prisma.handover.update({
        where: { id },
        data: { status: 'PENDING_TENANT', confirmToken: token },
    });
    const typeLabel = handover.type === 'MOVE_IN' ? '承租點交' : '退租點交';
    const link = `${config_1.config.appUrl}/handover/confirm/${token}`;
    await (0, lineService_1.sendTenantMessage)(handover.contract.tenant.id, `${typeLabel}確認\n\n${handover.contract.tenant.name} 您好，業者已建立「${handover.contract.unit.property.name} ${handover.contract.unit.unitNumber}」的${typeLabel}紀錄，請點擊確認：\n${link}`);
    res.json({ ok: true, confirmToken: token, link });
}
// 公開：以 token 取得點交內容（車主確認頁，無需登入）
async function getHandoverByToken(req, res) {
    const { token } = req.params;
    const handover = await app_1.prisma.handover.findUnique({
        where: { confirmToken: token },
        include: { contract: { include: { tenant: { select: { name: true } }, unit: { include: { property: { select: { name: true } } } } } } },
    });
    if (!handover) {
        res.status(404).json({ error: '連結無效或已失效' });
        return;
    }
    res.json(handover);
}
// 公開：車主以 token 確認簽核
async function confirmHandoverByToken(req, res) {
    const { token } = req.params;
    const { signerName } = req.body;
    const handover = await app_1.prisma.handover.findUnique({
        where: { confirmToken: token },
        include: { contract: { include: { unit: { include: { property: true } } } } },
    });
    if (!handover) {
        res.status(404).json({ error: '連結無效或已失效' });
        return;
    }
    if (handover.status === 'CONFIRMED') {
        res.status(400).json({ error: '此點交已確認' });
        return;
    }
    const updated = await finalizeConfirmation(handover, signerName);
    res.json(updated);
}
// 共用：簽核完成 → 狀態 CONFIRMED；若為退租點交且有損壞扣款，連動建立押金扣款
async function finalizeConfirmation(handover, signerName) {
    const updated = await app_1.prisma.handover.update({
        where: { id: handover.id },
        data: { status: 'CONFIRMED', tenantSignedAt: new Date(), signerName: signerName ?? null, confirmToken: null },
    });
    // 退租點交 → 把損壞且有扣款金額的項目寫進押金扣款
    if (handover.type === 'MOVE_OUT') {
        const items = handover.items ?? [];
        const deductItems = items.filter((i) => i.condition === 'DAMAGED' && i.deductAmount && i.deductAmount > 0);
        if (deductItems.length > 0) {
            const contract = await app_1.prisma.contract.findUnique({ where: { id: handover.contractId } });
            if (contract) {
                const refund = await app_1.prisma.depositRefund.upsert({
                    where: { contractId: handover.contractId },
                    create: {
                        contractId: handover.contractId,
                        depositAmount: contract.depositAmount,
                        totalDeductions: 0,
                        refundAmount: contract.depositAmount,
                    },
                    update: {},
                    include: { deductions: true },
                });
                await app_1.prisma.depositDeduction.createMany({
                    data: deductItems.map((i) => ({
                        depositRefundId: refund.id,
                        description: `點交損壞：${i.area} ${i.description}`.trim(),
                        amount: i.deductAmount,
                        category: 'DAMAGE',
                    })),
                });
                // 重算退還金額
                const all = await app_1.prisma.depositDeduction.findMany({ where: { depositRefundId: refund.id } });
                const totalDeductions = all.reduce((s, d) => s + Number(d.amount), 0);
                await app_1.prisma.depositRefund.update({
                    where: { id: refund.id },
                    data: {
                        totalDeductions,
                        refundAmount: Math.max(0, Number(refund.depositAmount) - totalDeductions),
                    },
                });
            }
        }
    }
    await (0, lineService_1.sendLandlordMessage)(handover.contract.unit.property.userId, `點交已確認\n\n${handover.contract.unit.property.name} ${handover.contract.unit.unitNumber} 的${handover.type === 'MOVE_IN' ? '承租' : '退租'}點交已由車主確認簽核。`);
    return updated;
}
// 車主端（已登入 portal）：列出自己合約的點交
async function tenantHandovers(req, res) {
    const handovers = await app_1.prisma.handover.findMany({
        where: { contract: { tenantId: req.tenantId } },
        include: { contract: { include: { unit: { include: { property: { select: { name: true } } } } } } },
        orderBy: { createdAt: 'desc' },
    });
    res.json(handovers);
}
// 車主端（已登入 portal）：確認點交
async function tenantConfirmHandover(req, res) {
    const { id } = req.params;
    const handover = await app_1.prisma.handover.findFirst({
        where: { id, contract: { tenantId: req.tenantId } },
        include: { contract: { include: { tenant: true, unit: { include: { property: true } } } } },
    });
    if (!handover) {
        res.status(404).json({ error: '找不到點交紀錄' });
        return;
    }
    if (handover.status === 'CONFIRMED') {
        res.status(400).json({ error: '此點交已確認' });
        return;
    }
    const updated = await finalizeConfirmation(handover, handover.contract.tenant.name);
    res.json(updated);
}
