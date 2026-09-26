"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRentRecords = getRentRecords;
exports.confirmPayment = confirmPayment;
exports.markOverdue = markOverdue;
exports.sendReminder = sendReminder;
const app_1 = require("../app");
const lineService_1 = require("../services/lineService");
const dates_1 = require("../utils/dates");
async function getUserUnitIds(userId) {
    const properties = await app_1.prisma.property.findMany({ where: { userId } });
    const propertyIds = properties.map((p) => p.id);
    const units = await app_1.prisma.unit.findMany({ where: { propertyId: { in: propertyIds } } });
    return units.map((u) => u.id);
}
async function getRentRecords(req, res) {
    const { year, month } = req.query;
    const unitIds = await getUserUnitIds(req.userId);
    const contracts = await app_1.prisma.contract.findMany({ where: { unitId: { in: unitIds } } });
    const contractIds = contracts.map((c) => c.id);
    const records = await app_1.prisma.rentRecord.findMany({
        where: {
            contractId: { in: contractIds },
            ...(year ? { year: Number(year) } : {}),
            ...(month ? { month: Number(month) } : {}),
        },
        include: {
            contract: {
                include: {
                    tenant: true,
                    unit: { include: { property: true } },
                },
            },
        },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    res.json(records);
}
async function confirmPayment(req, res) {
    const { id } = req.params;
    const { paidDate, paidAmount, paymentMethod, notes } = req.body;
    const record = await app_1.prisma.rentRecord.findUnique({
        where: { id },
        include: { contract: { include: { unit: { include: { property: true } } } } },
    });
    if (!record || record.contract.unit.property.userId !== req.userId) {
        res.status(404).json({ error: '找不到繳租紀錄' });
        return;
    }
    const paid = Number(paidAmount ?? record.amount);
    const expected = Number(record.amount);
    const status = paid >= expected ? 'PAID' : 'PARTIAL';
    const updated = await app_1.prisma.rentRecord.update({
        where: { id },
        data: {
            paidDate: paidDate ? new Date(paidDate) : new Date(),
            paidAmount: paid,
            status,
            paymentMethod,
            notes,
        },
    });
    res.json(updated);
}
async function markOverdue(req, res) {
    const now = new Date();
    const unitIds = await getUserUnitIds(req.userId);
    const contracts = await app_1.prisma.contract.findMany({ where: { unitId: { in: unitIds }, status: 'ACTIVE' } });
    const contractIds = contracts.map((c) => c.id);
    const updated = await app_1.prisma.rentRecord.updateMany({
        where: {
            contractId: { in: contractIds },
            status: 'PENDING',
            dueDate: { lt: (0, dates_1.startOfTodayTaipei)(now) },
        },
        data: { status: 'OVERDUE' },
    });
    res.json({ updated: updated.count });
}
async function sendReminder(req, res) {
    const { id } = req.params;
    const record = await app_1.prisma.rentRecord.findUnique({
        where: { id },
        include: {
            contract: {
                include: {
                    tenant: true,
                    unit: { include: { property: true } },
                },
            },
        },
    });
    if (!record || record.contract.unit.property.userId !== req.userId) {
        res.status(404).json({ error: '找不到繳租紀錄' });
        return;
    }
    const { tenant, unit } = record.contract;
    const text = `📢 繳租提醒\n您好 ${tenant.name}，${record.year} 年 ${record.month} 月車位 ${unit.unitNumber} 租金 NT$${Number(record.amount).toLocaleString()} ${record.status === 'OVERDUE' ? '已逾期，' : '即將到期，'}請盡快繳納。`;
    const sent = await (0, lineService_1.sendTenantMessage)(tenant.id, text);
    res.json({ sent, message: sent ? '提醒已發送' : '車主未綁定 LINE，提醒未送出' });
}
