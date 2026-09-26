"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExpenses = getExpenses;
exports.createExpense = createExpense;
exports.confirmExpense = confirmExpense;
exports.deleteExpense = deleteExpense;
exports.getExpenseTrend = getExpenseTrend;
const app_1 = require("../app");
async function getExpenses(req, res) {
    const { year, month } = req.query;
    const properties = await app_1.prisma.property.findMany({ where: { userId: req.userId } });
    const propertyIds = properties.map((p) => p.id);
    const units = await app_1.prisma.unit.findMany({ where: { propertyId: { in: propertyIds } } });
    const unitIds = units.map((u) => u.id);
    const expenses = await app_1.prisma.expense.findMany({
        where: {
            OR: [
                { propertyId: { in: propertyIds } },
                { unitId: { in: unitIds } },
            ],
            ...(year && month ? {
                date: {
                    gte: new Date(Number(year), Number(month) - 1, 1),
                    lt: new Date(Number(year), Number(month), 1),
                },
            } : {}),
        },
        include: {
            property: { select: { name: true } },
            unit: { select: { unitNumber: true } },
        },
        orderBy: { date: 'desc' },
    });
    res.json(expenses);
}
async function createExpense(req, res) {
    const { propertyId, unitId, category, amount, date, description } = req.body;
    if (!category || !amount || !date) {
        res.status(400).json({ error: '請填寫類別、金額與日期' });
        return;
    }
    if (propertyId) {
        const prop = await app_1.prisma.property.findFirst({ where: { id: propertyId, userId: req.userId } });
        if (!prop) {
            res.status(404).json({ error: '找不到停車場' });
            return;
        }
    }
    const expense = await app_1.prisma.expense.create({
        data: { propertyId, unitId, category, amount: Number(amount), date: new Date(date), description },
    });
    res.status(201).json(expense);
}
async function confirmExpense(req, res) {
    const { id } = req.params;
    const expense = await app_1.prisma.expense.findFirst({
        where: { id },
        include: {
            property: { select: { userId: true } },
            unit: { include: { property: { select: { userId: true } } } },
        },
    });
    if (!expense) {
        res.status(404).json({ error: '找不到支出' });
        return;
    }
    const ownerId = expense.property?.userId ?? expense.unit?.property.userId;
    if (ownerId !== req.userId) {
        res.status(403).json({ error: '無權限' });
        return;
    }
    const updated = await app_1.prisma.expense.update({
        where: { id },
        data: { confirmedAt: expense.confirmedAt ? null : new Date() },
    });
    res.json(updated);
}
async function deleteExpense(req, res) {
    const { id } = req.params;
    const expense = await app_1.prisma.expense.findFirst({
        where: { id },
        include: {
            property: { select: { userId: true } },
            unit: { include: { property: { select: { userId: true } } } },
        },
    });
    if (!expense) {
        res.status(404).json({ error: '找不到支出' });
        return;
    }
    const ownerId = expense.property?.userId ?? expense.unit?.property.userId;
    if (ownerId !== req.userId) {
        res.status(403).json({ error: '無權限' });
        return;
    }
    await app_1.prisma.expense.delete({ where: { id } });
    res.json({ success: true });
}
async function getExpenseTrend(req, res) {
    const properties = await app_1.prisma.property.findMany({ where: { userId: req.userId } });
    const propertyIds = properties.map((p) => p.id);
    const now = new Date();
    const trend = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const expenses = await app_1.prisma.expense.findMany({
            where: {
                propertyId: { in: propertyIds },
                date: { gte: d, lt: next },
            },
        });
        const byCategory = {};
        for (const e of expenses) {
            byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount);
        }
        trend.push({
            month: `${d.getMonth() + 1}月`,
            water: byCategory['WATER'] ?? 0,
            electricity: byCategory['ELECTRICITY'] ?? 0,
            gas: byCategory['GAS'] ?? 0,
            management: byCategory['MANAGEMENT'] ?? 0,
            repair: byCategory['REPAIR'] ?? 0,
            other: byCategory['OTHER'] ?? 0,
        });
    }
    res.json(trend);
}
