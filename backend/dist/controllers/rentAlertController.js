"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTodayRentAlerts = getTodayRentAlerts;
exports.getRentUtilityStats = getRentUtilityStats;
exports.getDormRecords = getDormRecords;
const app_1 = require("../app");
const prepaidService_1 = require("../services/prepaidService");
const dates_1 = require("../utils/dates");
/** 到期日早於此時間點的租金單才算「已到期」（含今天到期的） */
const endOfTodayTaipei = () => new Date((0, dates_1.startOfTodayTaipei)().getTime() + 86400000);
const TZ = 'Asia/Taipei';
/** 台北時間的年、月、日 */
function taipeiYMD(dt = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(dt);
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    return { year: get('year'), month: get('month'), day: get('day') };
}
/** 繳租日超過當月天數時（例如 31 號遇到 2 月），以當月最後一天為準 */
function effectiveDueDay(rentDueDay, year, month) {
    const lastDay = new Date(year, month, 0).getDate();
    return Math.min(Math.max(rentDueDay, 1), lastDay);
}
/** 台北日期加減天數 */
function addDays(ymd, n) {
    const dt = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + n));
    return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}
const fmt = (x) => `${x.year}-${String(x.month).padStart(2, '0')}-${String(x.day).padStart(2, '0')}`;
/** 業者在「通知排程」設定的電費門檻，沒設定用 300 元 */
async function prepaidThreshold(userId) {
    const rule = await app_1.prisma.notificationRule.findUnique({ where: { userId_kind: { userId, kind: 'PREPAID_LOW' } } });
    return Number(rule?.threshold ?? 300);
}
async function getUserUnits(userId) {
    return app_1.prisma.unit.findMany({
        where: { property: { userId } },
        include: { property: true },
    });
}
/**
 * 今日收租鈴聲：回傳今天是繳租日、且本月租金尚未收齊的車位，
 * 另附已過繳租日仍未收的車位，給前端響鈴與清單顯示。
 */
async function getTodayRentAlerts(req, res) {
    const today = taipeiYMD();
    // 提前幾天提醒收租／電費快用完，0 代表不提前
    const rentDaysBefore = Math.min(Math.max(Number(req.query.rentDaysBefore ?? 3) || 0, 0), 14);
    const elecDaysBefore = Math.min(Math.max(Number(req.query.elecDaysBefore ?? 3) || 0, 0), 30);
    const nextMonth = addDays({ ...today, day: 1 }, 32);
    const contracts = await app_1.prisma.contract.findMany({
        where: { status: 'ACTIVE', unit: { property: { userId: req.userId } } },
        include: {
            tenant: true,
            unit: { include: { property: true } },
            rentRecords: {
                where: {
                    OR: [
                        { year: today.year, month: today.month },
                        { year: nextMonth.year, month: nextMonth.month },
                    ],
                },
            },
        },
    });
    const recordOf = (c, year, month) => c.rentRecords.find((r) => r.year === year && r.month === month);
    const dueToday = [];
    for (const c of contracts) {
        if (effectiveDueDay(c.rentDueDay, today.year, today.month) !== today.day)
            continue;
        const record = recordOf(c, today.year, today.month);
        if (record?.status === 'PAID')
            continue;
        dueToday.push({
            contractId: c.id,
            rentRecordId: record?.id ?? null,
            propertyName: c.unit.property.name,
            unitNumber: c.unit.unitNumber,
            tenantName: c.tenant.name,
            tenantPhone: c.tenant.phone,
            amount: Number(record?.amount ?? c.monthlyRent),
            paidAmount: Number(record?.paidAmount ?? 0),
            rentDueDay: c.rentDueDay,
        });
    }
    const startOfToday = new Date(`${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}T00:00:00+08:00`);
    const overdueRecords = await app_1.prisma.rentRecord.findMany({
        where: {
            status: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] },
            dueDate: { lt: startOfToday },
            contract: { status: 'ACTIVE', unit: { property: { userId: req.userId } } },
        },
        include: { contract: { include: { tenant: true, unit: { include: { property: true } } } } },
        orderBy: { dueDate: 'asc' },
    });
    const overdue = overdueRecords.map((r) => ({
        rentRecordId: r.id,
        propertyName: r.contract.unit.property.name,
        unitNumber: r.contract.unit.unitNumber,
        tenantName: r.contract.tenant.name,
        tenantPhone: r.contract.tenant.phone,
        amount: Number(r.amount),
        paidAmount: Number(r.paidAmount ?? 0),
        dueDate: r.dueDate,
        year: r.year,
        month: r.month,
    }));
    // 本月各車位繳租日一覽（供「每間房的繳租日」清單）
    const schedule = contracts
        .map((c) => {
        const record = recordOf(c, today.year, today.month);
        return {
            contractId: c.id,
            propertyName: c.unit.property.name,
            unitNumber: c.unit.unitNumber,
            tenantName: c.tenant.name,
            amount: Number(record?.amount ?? c.monthlyRent),
            dueDay: effectiveDueDay(c.rentDueDay, today.year, today.month),
            status: record?.status ?? 'NOT_GENERATED',
        };
    })
        .sort((a, b) => a.dueDay - b.dueDay || a.unitNumber.localeCompare(b.unitNumber));
    // 即將到期的月租（未來 N 天內）
    const upcoming = [];
    for (let k = 1; k <= rentDaysBefore; k++) {
        const d = addDays(today, k);
        for (const c of contracts) {
            if (effectiveDueDay(c.rentDueDay, d.year, d.month) !== d.day)
                continue;
            if (new Date(`${fmt(d)}T00:00:00+08:00`) > c.endDate)
                continue;
            const record = recordOf(c, d.year, d.month);
            if (record?.status === 'PAID')
                continue;
            upcoming.push({
                contractId: c.id,
                propertyName: c.unit.property.name,
                unitNumber: c.unit.unitNumber,
                tenantName: c.tenant.name,
                tenantPhone: c.tenant.phone,
                amount: Number(record?.amount ?? c.monthlyRent),
                paidAmount: Number(record?.paidAmount ?? 0),
                dueDate: fmt(d),
                daysUntil: k,
            });
        }
    }
    // 預付電費快用完：餘額低於門檻，或預估 N 天內用完
    const threshold = await prepaidThreshold(req.userId);
    const prepaidUnits = await app_1.prisma.unit.findMany({
        where: { prepaidEnabled: true, property: { userId: req.userId } },
        include: { property: true, contracts: { where: { status: 'ACTIVE' }, include: { tenant: true } } },
    });
    const electricity = [];
    for (const u of prepaidUnits) {
        const st = await (0, prepaidService_1.getPrepaidStatus)(u.id, threshold);
        const soon = st.daysLeft != null && st.daysLeft <= elecDaysBefore;
        if (!st.low && !soon)
            continue;
        const tenant = u.contracts[0]?.tenant;
        electricity.push({
            unitId: u.id,
            propertyName: u.property.name,
            unitNumber: u.unitNumber,
            tenantName: tenant?.name ?? '',
            tenantPhone: tenant?.phone ?? '',
            balance: st.balance,
            threshold: st.threshold,
            daysLeft: st.daysLeft,
            depletionDate: st.depletionDate,
            low: st.low,
        });
    }
    electricity.sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999) || a.balance - b.balance);
    res.json({
        upcoming,
        electricity,
        date: `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`,
        dueToday,
        overdue,
        schedule,
    });
}
/** 年度月租統計＋電費統計 */
async function getRentUtilityStats(req, res) {
    const year = Number(req.query.year) || taipeiYMD().year;
    const userId = req.userId;
    const units = await getUserUnits(userId);
    const unitMap = new Map(units.map((u) => [u.id, u]));
    const months = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        rentDue: 0,
        rentCollected: 0,
        unpaidCount: 0,
        electricityBill: 0, // 台電總單（水電帳單模組，依計費期迄日歸月）
        electricityExpense: 0, // 支出記錄中的電費
        prepaidUsage: 0, // 預付電表扣款
        prepaidKwh: 0,
        prepaidTopup: 0,
    }));
    const unitRows = new Map();
    const rowOf = (unitId) => {
        let row = unitRows.get(unitId);
        if (!row) {
            const u = unitMap.get(unitId);
            row = {
                unitId, propertyName: u?.property.name ?? '', unitNumber: u?.unitNumber ?? '',
                rentDue: 0, rentCollected: 0, unpaidCount: 0,
                electricityAllocated: 0, prepaidUsage: 0, prepaidKwh: 0,
            };
            unitRows.set(unitId, row);
        }
        return row;
    };
    units.forEach((u) => rowOf(u.id));
    // 月租
    const rentRecords = await app_1.prisma.rentRecord.findMany({
        where: { year, contract: { unit: { property: { userId } } } },
        include: { contract: { select: { unitId: true } } },
    });
    // 「未收」「未繳筆數」「收款率」只看已到期的租金單，未到期的不算欠繳
    const cutoff = endOfTodayTaipei();
    let rentDueToDate = 0;
    let collectedToDate = 0;
    for (const r of rentRecords) {
        const m = months[r.month - 1];
        const due = Number(r.amount);
        const paid = Number(r.paidAmount ?? 0);
        const isDue = r.dueDate < cutoff;
        const unpaid = isDue && r.status !== 'PAID';
        if (isDue) {
            rentDueToDate += due;
            collectedToDate += paid;
        }
        m.rentDue += due;
        m.rentCollected += paid;
        if (unpaid)
            m.unpaidCount += 1;
        const row = rowOf(r.contract.unitId);
        row.rentDue += due;
        row.rentCollected += paid;
        if (unpaid)
            row.unpaidCount += 1;
    }
    // 電費：總單與分攤
    const yearStart = new Date(`${year}-01-01T00:00:00+08:00`);
    const yearEnd = new Date(`${year + 1}-01-01T00:00:00+08:00`);
    const bills = await app_1.prisma.utilityBill.findMany({
        where: { category: 'ELECTRICITY', property: { userId }, periodEnd: { gte: yearStart, lt: yearEnd } },
        include: { allocations: true },
    });
    for (const b of bills) {
        months[taipeiYMD(b.periodEnd).month - 1].electricityBill += Number(b.totalAmount);
        for (const a of b.allocations)
            rowOf(a.unitId).electricityAllocated += Number(a.amount);
    }
    const expenses = await app_1.prisma.expense.findMany({
        where: {
            category: 'ELECTRICITY',
            date: { gte: yearStart, lt: yearEnd },
            OR: [{ property: { userId } }, { unit: { property: { userId } } }],
        },
    });
    for (const e of expenses)
        months[taipeiYMD(e.date).month - 1].electricityExpense += Number(e.amount);
    // 預付電表
    const prepaid = await app_1.prisma.prepaidRecord.findMany({
        where: { unit: { property: { userId } }, createdAt: { gte: yearStart, lt: yearEnd }, type: { in: ['USAGE', 'TOPUP'] } },
    });
    for (const p of prepaid) {
        const m = months[taipeiYMD(p.createdAt).month - 1];
        if (p.type === 'TOPUP') {
            m.prepaidTopup += Number(p.amount);
            continue;
        }
        m.prepaidUsage += Number(p.amount);
        m.prepaidKwh += Number(p.kwh ?? 0);
        const row = rowOf(p.unitId);
        row.prepaidUsage += Number(p.amount);
        row.prepaidKwh += Number(p.kwh ?? 0);
    }
    const sum = (k) => months.reduce((s, m) => s + m[k], 0);
    const rentDue = sum('rentDue');
    const rentCollected = sum('rentCollected');
    res.json({
        year,
        summary: {
            rentDue,
            rentCollected,
            rentDueToDate,
            rentOutstanding: Math.max(rentDueToDate - collectedToDate, 0),
            collectionRate: rentDueToDate > 0 ? Math.round((collectedToDate / rentDueToDate) * 1000) / 10 : 0,
            unpaidCount: sum('unpaidCount'),
            electricityBill: sum('electricityBill'),
            electricityExpense: sum('electricityExpense'),
            prepaidUsage: sum('prepaidUsage'),
            prepaidKwh: sum('prepaidKwh'),
            prepaidTopup: sum('prepaidTopup'),
        },
        months,
        units: [...unitRows.values()].sort((a, b) => a.propertyName.localeCompare(b.propertyName) || a.unitNumber.localeCompare(b.unitNumber)),
    });
}
/**
 * 月租收費紀錄：各車位現況（下次繳租日、電費餘額與預估用完日）
 * ＋依時間排序的收租／電費流水。可用 unitId、year、month 篩選。
 */
async function getDormRecords(req, res) {
    const userId = req.userId;
    const unitId = req.query.unitId ? String(req.query.unitId) : undefined;
    const year = Number(req.query.year) || taipeiYMD().year;
    const month = req.query.month ? Number(req.query.month) : undefined;
    const today = taipeiYMD();
    const from = new Date(`${year}-${String(month ?? 1).padStart(2, '0')}-01T00:00:00+08:00`);
    const toYM = month ? addDays({ year, month, day: 1 }, 32) : { year: year + 1, month: 1, day: 1 };
    const to = new Date(`${toYM.year}-${String(toYM.month).padStart(2, '0')}-01T00:00:00+08:00`);
    const threshold = await prepaidThreshold(userId);
    const units = await app_1.prisma.unit.findMany({
        where: { property: { userId }, ...(unitId ? { id: unitId } : {}) },
        include: {
            property: true,
            contracts: { where: { status: 'ACTIVE' }, include: { tenant: true } },
        },
        orderBy: [{ property: { name: 'asc' } }, { unitNumber: 'asc' }],
    });
    const unitIds = units.map((u) => u.id);
    const rooms = [];
    for (const u of units) {
        const c = u.contracts[0];
        let nextDueDate = null;
        if (c) {
            const thisDue = effectiveDueDay(c.rentDueDay, today.year, today.month);
            let target = { year: today.year, month: today.month, day: thisDue };
            if (thisDue < today.day) {
                const nm = addDays({ ...today, day: 1 }, 32);
                target = { year: nm.year, month: nm.month, day: effectiveDueDay(c.rentDueDay, nm.year, nm.month) };
            }
            nextDueDate = fmt(target);
        }
        const unpaid = c
            ? await app_1.prisma.rentRecord.aggregate({
                // 只算已到期的；系統會預先開好未來幾個月的租金單，那些還不算欠繳
                where: { contractId: c.id, status: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] }, dueDate: { lt: endOfTodayTaipei() } },
                _count: true,
                _sum: { amount: true, paidAmount: true },
            })
            : null;
        const prepaid = u.prepaidEnabled ? await (0, prepaidService_1.getPrepaidStatus)(u.id, threshold) : null;
        rooms.push({
            unitId: u.id,
            propertyName: u.property.name,
            unitNumber: u.unitNumber,
            contractId: c?.id ?? null,
            tenantName: c?.tenant.name ?? null,
            tenantPhone: c?.tenant.phone ?? null,
            monthlyRent: Number(c?.monthlyRent ?? u.monthlyRent),
            rentDueDay: c?.rentDueDay ?? null,
            nextDueDate,
            unpaidCount: unpaid?._count ?? 0,
            unpaidAmount: unpaid ? Number(unpaid._sum.amount ?? 0) - Number(unpaid._sum.paidAmount ?? 0) : 0,
            prepaidEnabled: u.prepaidEnabled,
            prepaidBalance: prepaid?.balance ?? null,
            prepaidDaysLeft: prepaid?.daysLeft ?? null,
            prepaidDepletionDate: prepaid?.depletionDate ?? null,
            prepaidLow: prepaid?.low ?? false,
        });
    }
    const roomOf = new Map(rooms.map((r) => [r.unitId, r]));
    const entries = [];
    const rents = await app_1.prisma.rentRecord.findMany({
        where: { contract: { unitId: { in: unitIds } }, dueDate: { gte: from, lt: to } },
        include: { contract: { include: { tenant: true } } },
    });
    for (const r of rents) {
        const room = roomOf.get(r.contract.unitId);
        entries.push({
            id: r.id, unitId: room.unitId, propertyName: room.propertyName, unitNumber: room.unitNumber,
            kind: 'RENT', date: r.paidDate ?? r.dueDate,
            title: `${r.year}/${r.month} 月租・${r.contract.tenant.name}`,
            amount: Number(r.amount), paidAmount: Number(r.paidAmount ?? 0),
            status: r.status, note: [r.paymentMethod, r.notes].filter(Boolean).join('・') || null,
            year: r.year, month: r.month, dueDate: r.dueDate, paidDate: r.paidDate, paymentMethod: r.paymentMethod, notes: r.notes,
        });
    }
    const prepaids = await app_1.prisma.prepaidRecord.findMany({
        where: { unitId: { in: unitIds }, createdAt: { gte: from, lt: to } },
    });
    const kindMap = { TOPUP: 'ELEC_TOPUP', USAGE: 'ELEC_USAGE', ADJUST: 'ELEC_ADJUST' };
    const titleMap = { TOPUP: '電費儲值', USAGE: '用電扣款', ADJUST: '電費餘額調整' };
    for (const p of prepaids) {
        const room = roomOf.get(p.unitId);
        entries.push({
            id: p.id, unitId: room.unitId, propertyName: room.propertyName, unitNumber: room.unitNumber,
            kind: kindMap[p.type], date: p.createdAt, title: titleMap[p.type],
            amount: Number(p.amount), kwh: p.kwh == null ? null : Number(p.kwh),
            balanceAfter: Number(p.balanceAfter), note: p.note,
        });
    }
    const allocations = await app_1.prisma.utilityAllocation.findMany({
        where: { unitId: { in: unitIds }, utilityBill: { category: 'ELECTRICITY', periodEnd: { gte: from, lt: to } } },
        include: { utilityBill: true },
    });
    for (const a of allocations) {
        const room = roomOf.get(a.unitId);
        const b = a.utilityBill;
        entries.push({
            id: a.id, unitId: room.unitId, propertyName: room.propertyName, unitNumber: room.unitNumber,
            kind: 'ELEC_BILL', date: b.periodEnd,
            title: `電費分攤 ${fmt(taipeiYMD(b.periodStart))}～${fmt(taipeiYMD(b.periodEnd))}`,
            amount: Number(a.amount), status: a.billed ? 'BILLED' : 'UNBILLED', note: b.note,
        });
    }
    entries.sort((x, y) => y.date.getTime() - x.date.getTime());
    res.json({ year, month: month ?? null, rooms, entries });
}
