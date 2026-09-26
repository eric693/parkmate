"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRentRecord = createRentRecord;
exports.updateRentRecord = updateRentRecord;
exports.deleteRentRecord = deleteRentRecord;
exports.deleteContract = deleteContract;
exports.deleteMaintenanceRequest = deleteMaintenanceRequest;
exports.updateExpense = updateExpense;
exports.updateUtilityBill = updateUtilityBill;
exports.deleteUtilityBill = deleteUtilityBill;
exports.updatePrepaidRecord = updatePrepaidRecord;
exports.deletePrepaidRecord = deletePrepaidRecord;
exports.updateContractTemplate = updateContractTemplate;
exports.deletePayment = deletePayment;
exports.getDataSummary = getDataSummary;
exports.wipeAllData = wipeAllData;
const app_1 = require("../app");
const dates_1 = require("../utils/dates");
const deletionService_1 = require("../services/deletionService");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const num = (v) => (v === '' || v == null ? undefined : Number(v));
const date = (v) => (v ? new Date(String(v)) : undefined);
// ── 租金記錄 ──────────────────────────────────────────────────────
async function ownRentRecord(id, userId) {
    return app_1.prisma.rentRecord.findFirst({
        where: { id, contract: { unit: { property: { userId } } } },
    });
}
/** 手動新增一筆租金單（例如補開漏掉的月份） */
async function createRentRecord(req, res) {
    const { contractId, year, month, amount, dueDate, notes } = req.body;
    const contract = await app_1.prisma.contract.findFirst({
        where: { id: contractId, unit: { property: { userId: req.userId } } },
    });
    if (!contract) {
        res.status(404).json({ error: '找不到合約' });
        return;
    }
    const y = Number(year);
    const m = Number(month);
    if (!y || !m || m < 1 || m > 12) {
        res.status(400).json({ error: '請填寫正確的年月' });
        return;
    }
    const exists = await app_1.prisma.rentRecord.findUnique({ where: { contractId_year_month: { contractId, year: y, month: m } } });
    if (exists) {
        res.status(409).json({ error: `${y}/${m} 已有租金單，請直接編輯` });
        return;
    }
    const due = date(dueDate) ?? (0, dates_1.rentDueDate)(y, m, contract.rentDueDay);
    const record = await app_1.prisma.rentRecord.create({
        data: {
            contractId, year: y, month: m, dueDate: due,
            amount: num(amount) ?? Number(contract.monthlyRent),
            status: due < (0, dates_1.startOfTodayTaipei)() ? 'OVERDUE' : 'PENDING',
            notes: notes || null,
        },
    });
    res.status(201).json(record);
}
/** 編輯租金單：金額、到期日、收款資訊、狀態、備註 */
async function updateRentRecord(req, res) {
    const record = await ownRentRecord(req.params.id, req.userId);
    if (!record) {
        res.status(404).json({ error: '找不到租金記錄' });
        return;
    }
    const { amount, dueDate, paidDate, paidAmount, status, paymentMethod, notes } = req.body;
    const data = {
        amount: num(amount),
        dueDate: date(dueDate),
        paymentMethod: paymentMethod ?? undefined,
        notes: notes ?? undefined,
    };
    if (status === 'PENDING' || status === 'OVERDUE') {
        // 改回未繳：清掉收款資訊
        Object.assign(data, { status, paidDate: null, paidAmount: null });
    }
    else {
        if (paidAmount !== undefined)
            data.paidAmount = num(paidAmount) ?? null;
        if (paidDate !== undefined)
            data.paidDate = date(paidDate) ?? null;
        if (status)
            data.status = status;
        // 標成已繳／部分繳但沒給收款日：用今天
        if ((status === 'PAID' || status === 'PARTIAL') && !data.paidDate && !record.paidDate)
            data.paidDate = new Date();
    }
    res.json(await app_1.prisma.rentRecord.update({ where: { id: record.id }, data }));
}
async function deleteRentRecord(req, res) {
    const record = await ownRentRecord(req.params.id, req.userId);
    if (!record) {
        res.status(404).json({ error: '找不到租金記錄' });
        return;
    }
    await app_1.prisma.$transaction([
        app_1.prisma.reminderLog.deleteMany({ where: { rentRecordId: record.id } }),
        // 已對上的金流改回未對帳，錢還在，不跟著刪
        app_1.prisma.payment.updateMany({ where: { rentRecordId: record.id }, data: { rentRecordId: null, status: 'UNMATCHED', reconciledAt: null } }),
        app_1.prisma.rentRecord.delete({ where: { id: record.id } }),
    ]);
    res.json({ ok: true });
}
// ── 合約 ──────────────────────────────────────────────────────────
/** 刪除合約（連同其租金單、點交、押金退還紀錄）。建錯合約時使用；正常結束請用「終止」。 */
async function deleteContract(req, res) {
    const contract = await app_1.prisma.contract.findFirst({
        where: { id: req.params.id, unit: { property: { userId: req.userId } } },
    });
    if (!contract) {
        res.status(404).json({ error: '找不到合約' });
        return;
    }
    await (0, deletionService_1.removeContract)(contract.id);
    res.json({ ok: true });
}
// ── 報修 ──────────────────────────────────────────────────────────
async function deleteMaintenanceRequest(req, res) {
    const item = await app_1.prisma.maintenanceRequest.findFirst({
        where: { id: req.params.id, unit: { property: { userId: req.userId } } },
    });
    if (!item) {
        res.status(404).json({ error: '找不到報修單' });
        return;
    }
    await app_1.prisma.maintenanceRequest.delete({ where: { id: item.id } });
    res.json({ ok: true });
}
// ── 支出 ──────────────────────────────────────────────────────────
async function updateExpense(req, res) {
    const expense = await app_1.prisma.expense.findFirst({
        where: {
            id: req.params.id,
            OR: [{ property: { userId: req.userId } }, { unit: { property: { userId: req.userId } } }],
        },
    });
    if (!expense) {
        res.status(404).json({ error: '找不到支出' });
        return;
    }
    const { propertyId, unitId, category, amount, date: d, description } = req.body;
    if (propertyId) {
        const prop = await app_1.prisma.property.findFirst({ where: { id: propertyId, userId: req.userId } });
        if (!prop) {
            res.status(404).json({ error: '找不到停車場' });
            return;
        }
    }
    const updated = await app_1.prisma.expense.update({
        where: { id: expense.id },
        data: {
            propertyId: propertyId === undefined ? undefined : propertyId || null,
            unitId: unitId === undefined ? undefined : unitId || null,
            category: category || undefined,
            amount: num(amount),
            date: date(d),
            description: description ?? undefined,
        },
    });
    res.json(updated);
}
// ── 水電帳單（總單＋分攤）─────────────────────────────────────────
async function ownUtilityBill(id, userId) {
    return app_1.prisma.utilityBill.findFirst({ where: { id, property: { userId } }, include: { allocations: true } });
}
/**
 * 編輯水電總單：期間、備註，以及各房分攤金額（總額 = 各房加總）。
 * allocations: [{ id, amount }]
 */
async function updateUtilityBill(req, res) {
    const bill = await ownUtilityBill(req.params.id, req.userId);
    if (!bill) {
        res.status(404).json({ error: '找不到帳單' });
        return;
    }
    const { periodStart, periodEnd, note, allocations } = req.body;
    const ops = [];
    let total = Number(bill.totalAmount);
    if (Array.isArray(allocations)) {
        const byId = new Map(bill.allocations.map((a) => [a.id, a]));
        total = 0;
        for (const a of bill.allocations) {
            const edit = allocations.find((x) => x.id === a.id);
            const amt = edit ? Number(edit.amount) : Number(a.amount);
            total += amt;
            if (edit && byId.has(edit.id))
                ops.push(app_1.prisma.utilityAllocation.update({ where: { id: a.id }, data: { amount: amt } }));
        }
    }
    ops.push(app_1.prisma.utilityBill.update({
        where: { id: bill.id },
        data: {
            periodStart: date(periodStart),
            periodEnd: date(periodEnd),
            note: note ?? undefined,
            totalAmount: Math.round(total * 100) / 100,
        },
    }));
    await app_1.prisma.$transaction(ops);
    res.json(await ownUtilityBill(bill.id, req.userId));
}
async function deleteUtilityBill(req, res) {
    const bill = await ownUtilityBill(req.params.id, req.userId);
    if (!bill) {
        res.status(404).json({ error: '找不到帳單' });
        return;
    }
    await app_1.prisma.utilityBill.delete({ where: { id: bill.id } }); // 分攤明細 onDelete: Cascade
    res.json({ ok: true });
}
// ── 預付電表流水 ──────────────────────────────────────────────────
// 改或刪一筆流水時，這筆之後每一筆的 balanceAfter 與車位目前餘額都要一起平移。
async function ownPrepaidRecord(id, userId) {
    return app_1.prisma.prepaidRecord.findFirst({ where: { id, unit: { property: { userId } } } });
}
/** 這筆流水對餘額造成的增減（ADJUST 只存絕對值，用前一筆餘額反推正負） */
async function deltaOf(rec) {
    if (rec.type === 'TOPUP')
        return Number(rec.amount);
    if (rec.type === 'USAGE')
        return -Number(rec.amount);
    const prev = await app_1.prisma.prepaidRecord.findFirst({
        where: { unitId: rec.unitId, OR: [{ createdAt: { lt: rec.createdAt } }, { createdAt: rec.createdAt, id: { lt: rec.id } }] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return Number(rec.balanceAfter) - Number(prev?.balanceAfter ?? 0);
}
function shiftLater(rec, diff) {
    return [
        app_1.prisma.prepaidRecord.updateMany({
            where: { unitId: rec.unitId, OR: [{ createdAt: { gt: rec.createdAt } }, { createdAt: rec.createdAt, id: { gt: rec.id } }] },
            data: { balanceAfter: { increment: diff } },
        }),
        app_1.prisma.unit.update({ where: { id: rec.unitId }, data: { prepaidBalance: { increment: diff } } }),
    ];
}
/** 編輯流水：金額（TOPUP/USAGE/ADJUST）、度數、備註 */
async function updatePrepaidRecord(req, res) {
    const rec = await ownPrepaidRecord(req.params.id, req.userId);
    if (!rec) {
        res.status(404).json({ error: '找不到紀錄' });
        return;
    }
    const { amount, kwh, note } = req.body;
    const oldDelta = await deltaOf(rec);
    const newAmount = num(amount) ?? Number(rec.amount);
    if (newAmount < 0) {
        res.status(400).json({ error: '金額不可為負數' });
        return;
    }
    const sign = rec.type === 'USAGE' ? -1 : rec.type === 'TOPUP' ? 1 : Math.sign(oldDelta) || 1;
    const diff = sign * newAmount - oldDelta;
    await app_1.prisma.$transaction([
        app_1.prisma.prepaidRecord.update({
            where: { id: rec.id },
            data: {
                amount: newAmount,
                kwh: kwh === undefined ? undefined : num(kwh) ?? null,
                note: note ?? undefined,
                balanceAfter: { increment: diff },
            },
        }),
        ...(diff !== 0 ? shiftLater(rec, diff) : []),
    ]);
    res.json({ ok: true });
}
async function deletePrepaidRecord(req, res) {
    const rec = await ownPrepaidRecord(req.params.id, req.userId);
    if (!rec) {
        res.status(404).json({ error: '找不到紀錄' });
        return;
    }
    const delta = await deltaOf(rec);
    await app_1.prisma.$transaction([
        app_1.prisma.prepaidRecord.delete({ where: { id: rec.id } }),
        ...shiftLater(rec, -delta),
    ]);
    res.json({ ok: true });
}
// ── 租約範本 ──────────────────────────────────────────────────────
async function updateContractTemplate(req, res) {
    const tpl = await app_1.prisma.contractTemplate.findFirst({ where: { id: req.params.templateId, userId: req.userId } });
    if (!tpl) {
        res.status(404).json({ error: '找不到範本' });
        return;
    }
    const { name, body } = req.body;
    res.json(await app_1.prisma.contractTemplate.update({
        where: { id: tpl.id },
        data: { name: name || undefined, body: body ?? undefined },
    }));
}
// ── 入帳（對帳中心）───────────────────────────────────────────────
/**
 * 刪除一筆尚未銷帳的入帳（重複匯入、測試資料）。已銷帳的不能刪，避免帳對不起來。
 * 只能刪自己合約的入帳；沒有對應合約的入帳無法確認歸屬，不開放刪除。
 */
async function deletePayment(req, res) {
    const userId = req.userId;
    const payment = await app_1.prisma.payment.findFirst({
        where: {
            id: req.params.id,
            OR: [
                { contract: { unit: { property: { userId } } } },
                { virtualAccount: { contract: { unit: { property: { userId } } } } },
            ],
        },
    });
    if (!payment) {
        res.status(404).json({ error: '找不到入帳' });
        return;
    }
    if (payment.status === 'MATCHED' || payment.status === 'MANUAL') {
        res.status(400).json({ error: '已銷帳的入帳不可刪除' });
        return;
    }
    await app_1.prisma.payment.delete({ where: { id: payment.id } });
    res.json({ ok: true });
}
// ── 資料管理：清空所有營運資料 ─────────────────────────────────────
async function getDataSummary(req, res) {
    res.json(await (0, deletionService_1.countUserData)(req.userId));
}
/** 清空全部資料（僅管理員，需輸入自己的密碼與確認文字） */
async function wipeAllData(req, res) {
    const { password, confirmText } = req.body;
    if (confirmText !== '清空全部資料') {
        res.status(400).json({ error: '請輸入「清空全部資料」確認' });
        return;
    }
    const me = await app_1.prisma.user.findUnique({ where: { id: req.authUserId } });
    if (!me || !(await bcryptjs_1.default.compare(String(password ?? ''), me.password))) {
        res.status(400).json({ error: '密碼不正確' });
        return;
    }
    const before = await (0, deletionService_1.countUserData)(req.userId);
    await (0, deletionService_1.wipeUserData)(req.userId);
    res.json({ ok: true, deleted: before });
}
