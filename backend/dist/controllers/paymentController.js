"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPayments = getPayments;
exports.getUnmatchedPayments = getUnmatchedPayments;
exports.matchPayment = matchPayment;
exports.getMatchSuggestions = getMatchSuggestions;
exports.getContractVirtualAccount = getContractVirtualAccount;
exports.paymentWebhook = paymentWebhook;
exports.simulatePayment = simulatePayment;
const app_1 = require("../app");
const config_1 = require("../config");
const payment_1 = require("../services/payment");
const paymentService_1 = require("../services/paymentService");
async function getUserContractIds(userId) {
    const contracts = await app_1.prisma.contract.findMany({
        where: { unit: { property: { userId } } },
        select: { id: true },
    });
    return contracts.map((c) => c.id);
}
// 業者：列出所有入帳紀錄
async function getPayments(req, res) {
    const contractIds = await getUserContractIds(req.userId);
    const payments = await app_1.prisma.payment.findMany({
        where: {
            OR: [
                { contractId: { in: contractIds } },
                { contractId: null, status: 'UNMATCHED' }, // 查無帳號的孤兒入帳
            ],
        },
        include: {
            contract: { include: { tenant: true, unit: { include: { property: true } } } },
            rentRecord: true,
        },
        orderBy: { paidAt: 'desc' },
    });
    res.json(payments);
}
// 業者：待人工處理的未匹配入帳
async function getUnmatchedPayments(req, res) {
    const contractIds = await getUserContractIds(req.userId);
    const payments = await app_1.prisma.payment.findMany({
        where: {
            status: 'UNMATCHED',
            OR: [{ contractId: { in: contractIds } }, { contractId: null }],
        },
        include: { contract: { include: { tenant: true, unit: true } } },
        orderBy: { paidAt: 'desc' },
    });
    res.json(payments);
}
// 業者：人工把一筆入帳銷到指定繳租紀錄
async function matchPayment(req, res) {
    const { id } = req.params;
    const { rentRecordId } = req.body;
    if (!rentRecordId) {
        res.status(400).json({ error: '請指定繳租紀錄' });
        return;
    }
    try {
        const result = await (0, paymentService_1.manualMatch)(id, rentRecordId, req.userId);
        res.json(result);
    }
    catch (err) {
        res.status(400).json({ error: err.message ?? '銷帳失敗' });
    }
}
// 業者：對一筆未匹配入帳取得自動銷帳建議（依姓名/金額/期數評分）
async function getMatchSuggestions(req, res) {
    const { id } = req.params;
    try {
        const suggestions = await (0, paymentService_1.suggestMatches)(id, req.userId);
        res.json(suggestions);
    }
    catch (err) {
        res.status(400).json({ error: err.message ?? '無法取得建議' });
    }
}
// 業者：取得/建立合約的虛擬帳號
async function getContractVirtualAccount(req, res) {
    const { contractId } = req.params;
    const contract = await app_1.prisma.contract.findFirst({
        where: { id: contractId, unit: { property: { userId: req.userId } } },
    });
    if (!contract) {
        res.status(404).json({ error: '找不到合約' });
        return;
    }
    const va = await (0, paymentService_1.getOrCreateVirtualAccount)(contractId);
    res.json(va);
}
// 金流 webhook（對外，無 JWT）：provider 入帳通知 → 自動對帳
async function paymentWebhook(req, res) {
    const provider = (0, payment_1.getPaymentProvider)();
    if (!provider.verifyWebhook(req.body, req.headers)) {
        res.status(401).json({ error: 'invalid signature' });
        return;
    }
    const normalized = provider.parseWebhook(req.body);
    if (!normalized) {
        res.status(400).json({ error: 'unrecognized payload' });
        return;
    }
    try {
        const result = await (0, paymentService_1.reconcilePayment)(normalized);
        res.json(result);
    }
    catch (err) {
        console.error('reconcile error:', err);
        res.status(500).json({ error: '對帳失敗' });
    }
}
// 業者（沙盒專用）：模擬一筆車主入帳，用來測試自動對帳全流程
async function simulatePayment(req, res) {
    if (!config_1.config.payment.isSandbox) {
        res.status(403).json({ error: '僅沙盒模式可模擬入帳' });
        return;
    }
    const { contractId, amount } = req.body;
    const contract = await app_1.prisma.contract.findFirst({
        where: { id: contractId, unit: { property: { userId: req.userId } } },
        include: { tenant: true },
    });
    if (!contract) {
        res.status(404).json({ error: '找不到合約' });
        return;
    }
    const va = await (0, paymentService_1.getOrCreateVirtualAccount)(contractId);
    const provider = (0, payment_1.getPaymentProvider)();
    const normalized = provider.parseWebhook({
        accountNumber: va.accountNumber,
        amount: Number(amount ?? contract.monthlyRent),
        payerName: contract.tenant.name,
        providerTxnId: `SBX-${contractId}-${Date.now()}`,
    });
    const result = await (0, paymentService_1.reconcilePayment)(normalized);
    res.json(result);
}
