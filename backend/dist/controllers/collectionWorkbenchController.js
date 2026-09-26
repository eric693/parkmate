"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCollectionWorkbench = getCollectionWorkbench;
exports.getFinanceOverview = getFinanceOverview;
const app_1 = require("../app");
async function getCollectionWorkbench(req, res) {
    const userId = req.userId;
    const year = Number(req.query.year ?? new Date().getFullYear());
    const month = Number(req.query.month ?? new Date().getMonth() + 1);
    const properties = await app_1.prisma.property.findMany({
        where: { userId },
        include: { units: true },
    });
    const propertyIds = properties.map((p) => p.id);
    const unitIds = properties.flatMap((p) => p.units.map((u) => u.id));
    const contracts = await app_1.prisma.contract.findMany({
        where: { unitId: { in: unitIds } },
        include: { tenant: true, unit: { include: { property: true } } },
    });
    const contractIds = contracts.map((c) => c.id);
    const rentRecords = await app_1.prisma.rentRecord.findMany({
        where: { contractId: { in: contractIds }, year, month },
        include: { contract: { include: { tenant: true, unit: { include: { property: true } } } } },
    });
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);
    const expenses = await app_1.prisma.expense.findMany({
        where: {
            propertyId: { in: propertyIds },
            date: { gte: startOfMonth, lte: endOfMonth },
            category: { in: ['WATER', 'ELECTRICITY', 'GAS'] },
        },
        include: { property: true, unit: true },
    });
    const tasks = [];
    for (const r of rentRecords) {
        tasks.push({
            id: r.id,
            type: 'rent',
            unitNumber: r.contract.unit.unitNumber,
            tenantName: r.contract.tenant.name,
            description: `${year} 年 ${month} 月 租金`,
            amount: Number(r.amount),
            dueDate: new Date(r.dueDate).toISOString().split('T')[0],
            status: r.status.toLowerCase(),
            propertyId: r.contract.unit.propertyId,
            propertyName: r.contract.unit.property.name,
            contractId: r.contractId,
        });
    }
    for (const e of expenses) {
        const labelMap = { WATER: '水費', ELECTRICITY: '電費', GAS: '瓦斯費' };
        const label = labelMap[e.category] ?? '水電';
        tasks.push({
            id: e.id,
            type: 'utility',
            unitNumber: e.unit?.unitNumber ?? '公區',
            tenantName: '—',
            description: `${year} 年 ${month} 月 ${label}`,
            amount: Number(e.amount),
            dueDate: new Date(e.date).toISOString().split('T')[0],
            status: e.confirmedAt ? 'paid' : 'pending',
            propertyId: e.propertyId ?? '',
            propertyName: e.property?.name ?? '',
        });
    }
    // Compute KPI stats
    const totalAmount = tasks.reduce((s, t) => s + t.amount, 0);
    const collectedAmount = tasks.filter((t) => t.status === 'paid').reduce((s, t) => s + t.amount, 0);
    const pendingAmount = tasks.filter((t) => t.status === 'pending' || t.status === 'partial').reduce((s, t) => s + t.amount, 0);
    const overdueAmount = tasks.filter((t) => t.status === 'overdue').reduce((s, t) => s + t.amount, 0);
    const pendingCount = tasks.filter((t) => t.status === 'pending').length;
    const overdueCount = tasks.filter((t) => t.status === 'overdue').length;
    const partialCount = tasks.filter((t) => t.status === 'partial').length;
    const todayProcess = tasks.filter((t) => t.status === 'pending' || t.status === 'overdue').length;
    const collectionRate = totalAmount > 0 ? Math.round((collectedAmount / totalAmount) * 100) : 0;
    // Group by property
    const groups = properties.map((p) => {
        const propTasks = tasks.filter((t) => t.propertyId === p.id);
        return {
            propertyId: p.id,
            propertyName: p.name,
            totalTasks: propTasks.length,
            totalAmount: propTasks.reduce((s, t) => s + t.amount, 0),
            stats: {
                rent: propTasks.filter((t) => t.type === 'rent' && t.status === 'pending').length,
                overdue: propTasks.filter((t) => t.status === 'overdue').length,
                partial: propTasks.filter((t) => t.status === 'partial').length,
                utility: propTasks.filter((t) => t.type === 'utility').length,
            },
        };
    }).filter((g) => g.totalTasks > 0);
    res.json({
        year,
        month,
        stats: { totalAmount, collectedAmount, pendingAmount, overdueAmount, pendingCount, overdueCount, partialCount, todayProcess, collectionRate },
        groups,
        tasks,
    });
}
async function getFinanceOverview(req, res) {
    const userId = req.userId;
    const now = new Date();
    const year = Number(req.query.year ?? now.getFullYear());
    const month = Number(req.query.month ?? now.getMonth() + 1);
    const properties = await app_1.prisma.property.findMany({ where: { userId } });
    const propertyIds = properties.map((p) => p.id);
    const units = await app_1.prisma.unit.findMany({ where: { propertyId: { in: propertyIds } } });
    const unitIds = units.map((u) => u.id);
    const contracts = await app_1.prisma.contract.findMany({ where: { unitId: { in: unitIds } } });
    const contractIds = contracts.map((c) => c.id);
    async function getMonthStats(y, m) {
        const records = await app_1.prisma.rentRecord.findMany({ where: { contractId: { in: contractIds }, year: y, month: m } });
        const exp = await app_1.prisma.expense.findMany({
            where: { propertyId: { in: propertyIds }, date: { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) } },
        });
        const total = records.reduce((s, r) => s + Number(r.amount), 0);
        const collected = records.filter((r) => r.status === 'PAID' || r.status === 'PARTIAL').reduce((s, r) => s + Number(r.paidAmount ?? r.amount), 0);
        const overdue = records.filter((r) => r.status === 'OVERDUE').reduce((s, r) => s + Number(r.amount), 0);
        const overdueCount = records.filter((r) => r.status === 'OVERDUE').length;
        const utility = exp.filter((e) => ['WATER', 'ELECTRICITY', 'GAS'].includes(e.category)).reduce((s, e) => s + Number(e.amount), 0);
        const utilityCount = exp.filter((e) => ['WATER', 'ELECTRICITY', 'GAS'].includes(e.category)).length;
        const expenses = exp.filter((e) => !['WATER', 'ELECTRICITY', 'GAS'].includes(e.category)).reduce((s, e) => s + Number(e.amount), 0);
        const expenseCount = exp.filter((e) => !['WATER', 'ELECTRICITY', 'GAS'].includes(e.category)).length;
        return { total, collected, pending: total - collected, overdue, overdueCount, utility, utilityCount, expenses, expenseCount, rate: total > 0 ? Math.round((collected / total) * 100) : 0 };
    }
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const [cur, prev] = await Promise.all([getMonthStats(year, month), getMonthStats(prevYear, prevMonth)]);
    // 6-month trend
    const trend = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(year, month - 1 - i, 1);
        const s = await getMonthStats(d.getFullYear(), d.getMonth() + 1);
        trend.push({ month: `${d.getMonth() + 1}月`, collected: s.collected, total: s.total, utility: s.utility, rate: s.rate });
    }
    // Expense breakdown (current month)
    const expenseRaw = await app_1.prisma.expense.findMany({
        where: { propertyId: { in: propertyIds }, date: { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) } },
    });
    const byCategory = {};
    for (const e of expenseRaw) {
        byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount);
    }
    const totalExp = Object.values(byCategory).reduce((s, v) => s + v, 0);
    const expenseBreakdown = Object.entries(byCategory).map(([cat, amt]) => ({
        category: cat,
        label: { WATER: '水費', ELECTRICITY: '電費', GAS: '瓦斯', MANAGEMENT: '管理費', REPAIR: '維修', OTHER: '其他', INSURANCE: '保險', INTERNET: '網路' }[cat] ?? cat,
        amount: amt,
        pct: totalExp > 0 ? Math.round((amt / totalExp) * 100) : 0,
    })).sort((a, b) => b.amount - a.amount);
    const momPct = (cur, prev) => prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0;
    res.json({
        year, month,
        current: cur,
        previous: prev,
        mom: {
            collected: momPct(cur.collected, prev.collected),
            pending: momPct(cur.pending, prev.pending),
            utility: momPct(cur.utility, prev.utility),
        },
        trend,
        expenseBreakdown,
    });
}
