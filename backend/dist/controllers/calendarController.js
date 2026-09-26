"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCalendarEvents = getCalendarEvents;
const app_1 = require("../app");
async function getCalendarEvents(req, res) {
    const year = Number(req.query.year ?? new Date().getFullYear());
    const month = Number(req.query.month ?? new Date().getMonth() + 1);
    const properties = await app_1.prisma.property.findMany({ where: { userId: req.userId } });
    const propertyIds = properties.map((p) => p.id);
    const units = await app_1.prisma.unit.findMany({ where: { propertyId: { in: propertyIds } } });
    const unitIds = units.map((u) => u.id);
    const contracts = await app_1.prisma.contract.findMany({ where: { unitId: { in: unitIds } } });
    const contractIds = contracts.map((c) => c.id);
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0);
    const rentRecords = await app_1.prisma.rentRecord.findMany({
        where: {
            contractId: { in: contractIds },
            dueDate: { gte: startOfMonth, lte: endOfMonth },
        },
        include: { contract: { include: { tenant: true, unit: true } } },
    });
    const expiringContracts = contracts.filter((c) => {
        const d = new Date(c.endDate);
        return d >= startOfMonth && d <= endOfMonth;
    });
    const fullContracts = await app_1.prisma.contract.findMany({
        where: { id: { in: expiringContracts.map((c) => c.id) } },
        include: { tenant: true, unit: true },
    });
    const maintenanceRequests = await app_1.prisma.maintenanceRequest.findMany({
        where: {
            unitId: { in: unitIds },
            reportedAt: { gte: startOfMonth, lte: endOfMonth },
        },
        include: { unit: true, tenant: true },
    });
    const expenses = await app_1.prisma.expense.findMany({
        where: {
            propertyId: { in: propertyIds },
            date: { gte: startOfMonth, lte: endOfMonth },
        },
    });
    const events = {};
    function addEvent(dateStr, type) {
        if (!events[dateStr])
            events[dateStr] = [];
        events[dateStr].push(type);
    }
    for (const r of rentRecords) {
        const d = new Date(r.dueDate).toISOString().split('T')[0];
        addEvent(d, r.status === 'OVERDUE' ? 'overdue' : 'rent');
    }
    for (const c of fullContracts) {
        const d = new Date(c.endDate).toISOString().split('T')[0];
        addEvent(d, 'contract');
    }
    for (const m of maintenanceRequests) {
        const d = new Date(m.reportedAt).toISOString().split('T')[0];
        addEvent(d, 'maintenance');
    }
    for (const e of expenses) {
        const d = new Date(e.date).toISOString().split('T')[0];
        addEvent(d, 'expense');
    }
    // Also build todo items
    const allTodos = [];
    const now = new Date();
    for (const r of rentRecords) {
        const isOverdue = r.status === 'OVERDUE';
        const daysOverdue = isOverdue ? Math.floor((now.getTime() - new Date(r.dueDate).getTime()) / 86400000) : undefined;
        allTodos.push({
            id: r.id,
            type: 'rent',
            title: '水費帳單',
            subtitle: `${r.contract.unit.unitNumber}`,
            amount: Number(r.amount),
            date: new Date(r.dueDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }),
            daysOverdue,
            tags: ['水電', isOverdue ? '到期提醒' : '待繳'],
        });
    }
    for (const c of fullContracts) {
        const daysLeft = Math.ceil((new Date(c.endDate).getTime() - now.getTime()) / 86400000);
        allTodos.push({
            id: c.id,
            type: 'contract',
            title: `${c.tenant.name} 合約到期`,
            subtitle: c.unit.unitNumber,
            date: new Date(c.endDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }),
            tags: [`剩 ${daysLeft} 天`],
        });
    }
    for (const m of maintenanceRequests) {
        allTodos.push({
            id: m.id,
            type: 'maintenance',
            title: m.title,
            subtitle: m.unit.unitNumber,
            date: new Date(m.reportedAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }),
            tags: [m.status === 'PENDING' ? '待處理' : '處理中'],
        });
    }
    for (const e of expenses) {
        allTodos.push({
            id: e.id,
            type: 'expense',
            title: categoryLabel(e.category),
            subtitle: '',
            amount: Number(e.amount),
            date: new Date(e.date).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }),
            tags: ['水電'],
        });
    }
    res.json({ events, todos: allTodos, year, month });
}
function categoryLabel(c) {
    return { WATER: '水費帳單', ELECTRICITY: '電費帳單', GAS: '瓦斯帳單', MANAGEMENT: '管理費', REPAIR: '維修費', OTHER: '其他支出' }[c] ?? c;
}
