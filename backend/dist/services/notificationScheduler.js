"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_KINDS = exports.DEFAULT_RULES = exports.KIND_LABELS = void 0;
exports.ensureRules = ensureRules;
exports.runRule = runRule;
exports.tick = tick;
exports.startScheduler = startScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const client_1 = require("@prisma/client");
const app_1 = require("../app");
const lineService_1 = require("./lineService");
const reminderService_1 = require("./reminderService");
const prepaidService_1 = require("./prepaidService");
const dates_1 = require("../utils/dates");
const rentService_1 = require("./rentService");
const waitlistService_1 = require("./waitlistService");
// 通知排程器。
// 舊版是寫死的 cron（每天 09:00 一次跑完所有事、每月 1 日 08:00 產生租金單）。
// 現在改成：每個業者 × 每種通知一列規則，各自有執行時間與參數；
// 排程器每分鐘掃一次，比對台北時間的時／分決定要跑誰。
const TZ = 'Asia/Taipei';
exports.KIND_LABELS = {
    RENT_GENERATE: '每月產生租金單',
    RENT_DUE: '租金到期提醒',
    RENT_OVERDUE: '逾期催繳',
    OVERDUE_DIGEST: '逾期彙整（業者）',
    CONTRACT_EXPIRY: '合約到期提醒',
    PREPAID_LOW: '預付電費餘額不足',
};
/** 每種通知的預設值。使用者沒建規則時，用這組補上。 */
exports.DEFAULT_RULES = {
    RENT_GENERATE: { enabled: true, hour: 8, minute: 0, dayOfMonth: 1, daysBefore: [] },
    RENT_DUE: { enabled: true, hour: 9, minute: 0, daysBefore: [3], remindOnDue: true },
    RENT_OVERDUE: { enabled: true, hour: 9, minute: 0, daysBefore: [], intervalDays: 3 },
    OVERDUE_DIGEST: { enabled: true, hour: 9, minute: 0, daysBefore: [] },
    CONTRACT_EXPIRY: { enabled: true, hour: 9, minute: 0, daysBefore: [30, 14, 7] },
    PREPAID_LOW: { enabled: true, hour: 9, minute: 0, daysBefore: [], threshold: new client_1.Prisma.Decimal(300) },
};
exports.ALL_KINDS = Object.keys(exports.DEFAULT_RULES);
/** 確保該業者的六種規則都存在，缺的用預設值補上。回傳完整規則清單。 */
async function ensureRules(userId) {
    const existing = await app_1.prisma.notificationRule.findMany({ where: { userId } });
    const have = new Set(existing.map((r) => r.kind));
    const missing = exports.ALL_KINDS.filter((k) => !have.has(k));
    if (missing.length > 0) {
        await app_1.prisma.notificationRule.createMany({
            data: missing.map((kind) => ({ userId, kind, ...exports.DEFAULT_RULES[kind] })),
            skipDuplicates: true,
        });
    }
    return app_1.prisma.notificationRule.findMany({ where: { userId }, orderBy: { kind: 'asc' } });
}
async function generateRentRecords(userId) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const contracts = await app_1.prisma.contract.findMany({
        where: {
            status: 'ACTIVE',
            endDate: { gte: now },
            unit: { property: { userId } },
        },
    });
    let generated = 0;
    for (const contract of contracts) {
        // 季繳、年繳、短租不是每個月都開單
        const bill = (0, rentService_1.billingFor)(contract, year, month);
        if (!bill)
            continue;
        await app_1.prisma.rentRecord.upsert({
            where: { contractId_year_month: { contractId: contract.id, year, month } },
            update: {},
            create: {
                contractId: contract.id,
                year,
                month,
                dueDate: bill.dueDate,
                amount: bill.amount,
                status: 'PENDING',
            },
        });
        generated++;
    }
    return { generated };
}
/** 把該業者名下已過期未繳的租金標記為逾期。逾期催繳與彙整都依賴這個狀態。 */
async function markOverdue(userId) {
    const result = await app_1.prisma.rentRecord.updateMany({
        where: {
            status: 'PENDING',
            dueDate: { lt: (0, dates_1.startOfTodayTaipei)() },
            contract: { unit: { property: { userId } } },
        },
        data: { status: 'OVERDUE' },
    });
    return { marked: result.count };
}
async function sendOverdueDigest(userId) {
    const now = new Date();
    const records = await app_1.prisma.rentRecord.findMany({
        where: {
            status: 'OVERDUE',
            contract: { unit: { property: { userId } } },
        },
        include: { contract: { include: { tenant: true, unit: true } } },
    });
    if (records.length === 0)
        return { sent: 0 };
    const lines = ['⚠️ 逾期租金彙整\n'];
    for (const r of records) {
        const daysOverdue = Math.floor((now.getTime() - r.dueDate.getTime()) / 86400000);
        lines.push(`🏠 ${r.contract.unit.unitNumber} - ${r.contract.tenant.name}` +
            `\n💰 金額：NT$${Number(r.amount).toLocaleString()}` +
            `\n📅 到期日：${r.dueDate.toISOString().split('T')[0]}` +
            `\n⚠️ 已逾期：${daysOverdue} 天`);
    }
    lines.push(`\n---\n請盡快聯繫車主催繳。\n⏰ 發送時間：${now.toLocaleString('zh-TW')}`);
    await (0, lineService_1.sendLandlordMessage)(userId, lines.join('\n\n'));
    return { sent: records.length };
}
/** 已過結束日還是「進行中」的合約轉為到期，車位改空位並通知候補（短租主要靠這裡結束）。 */
async function expireEndedContracts(userId) {
    const ended = await app_1.prisma.contract.findMany({
        where: { status: 'ACTIVE', endDate: { lt: (0, dates_1.startOfTodayTaipei)() }, unit: { property: { userId } } },
    });
    for (const c of ended) {
        await app_1.prisma.contract.update({ where: { id: c.id }, data: { status: 'EXPIRED' } });
        const stillActive = await app_1.prisma.contract.count({ where: { unitId: c.unitId, status: 'ACTIVE' } });
        if (stillActive === 0) {
            await app_1.prisma.unit.update({ where: { id: c.unitId }, data: { status: 'VACANT' } });
            await (0, waitlistService_1.onUnitVacated)(c.unitId);
        }
    }
    return ended.length;
}
async function sendContractExpiry(userId, daysBefore) {
    const now = new Date();
    const expired = await expireEndedContracts(userId);
    // 短租天數短，不發 30/14/7 天到期提醒，也不提早轉到期
    const contracts = await app_1.prisma.contract.findMany({
        where: { status: 'ACTIVE', billingCycle: { not: 'SHORT_TERM' }, unit: { property: { userId } } },
        include: { tenant: true, unit: true },
    });
    let sent = 0;
    const minDays = daysBefore.length > 0 ? Math.min(...daysBefore) : null;
    for (const contract of contracts) {
        const daysLeft = Math.ceil((contract.endDate.getTime() - now.getTime()) / 86400000);
        if (!daysBefore.includes(daysLeft))
            continue;
        await (0, lineService_1.sendLandlordMessage)(userId, `📄 合約即將到期\n\n${contract.tenant.name} / ${contract.unit.unitNumber}\n租約到期日：${contract.endDate.toISOString().split('T')[0]}\n剩餘天數：${daysLeft} 天\n\n請確認是否續租並通知車主。`);
        await (0, lineService_1.sendTenantMessage)(contract.tenant.id, `📄 合約即將到期\n\n${contract.tenant.name} 您好！\n\n您的 ${contract.unit.unitNumber} 號月租約即將到期。\n租約到期日：${contract.endDate.toISOString().split('T')[0]}\n剩餘天數：${daysLeft} 天\n\n如需續租請及早與業者確認，謝謝！`);
        sent++;
        // 走到設定中最早的那個提醒點才轉狀態，避免使用者把 7 天拿掉後合約永遠不會到期。
        if (minDays !== null && daysLeft === minDays) {
            await app_1.prisma.contract.update({ where: { id: contract.id }, data: { status: 'EXPIRED' } });
            await app_1.prisma.unit.update({ where: { id: contract.unitId }, data: { status: 'VACANT' } });
            await (0, waitlistService_1.onUnitVacated)(contract.unitId);
        }
    }
    return { sent, expired };
}
/** 執行單一規則。手動觸發與排程都走這裡，行為一致。 */
async function runRule(rule) {
    switch (rule.kind) {
        case 'RENT_GENERATE':
            return generateRentRecords(rule.userId);
        case 'RENT_DUE':
            return (0, reminderService_1.runDailyReminders)({
                userId: rule.userId,
                only: 'DUE',
                override: {
                    daysBefore: rule.daysBefore[0] ?? 3,
                    remindOnDue: rule.remindOnDue,
                },
            });
        case 'RENT_OVERDUE': {
            const marked = await markOverdue(rule.userId);
            const result = await (0, reminderService_1.runDailyReminders)({
                userId: rule.userId,
                only: 'OVERDUE',
                override: { overdueEnabled: true, overdueInterval: rule.intervalDays ?? 3 },
            });
            return { ...marked, ...result };
        }
        case 'OVERDUE_DIGEST':
            await markOverdue(rule.userId);
            return sendOverdueDigest(rule.userId);
        case 'CONTRACT_EXPIRY':
            return sendContractExpiry(rule.userId, rule.daysBefore.length ? rule.daysBefore : [30, 14, 7]);
        case 'PREPAID_LOW':
            return (0, prepaidService_1.checkPrepaidBalances)(rule.userId, Number(rule.threshold ?? 300));
        default:
            return {};
    }
}
// ── 排程主迴圈 ────────────────────────────────────────────────────
/** 取得台北時間的年月日時分，用來比對規則與判斷今天是否已跑過。 */
function taipeiNow() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    return {
        date: `${get('year')}-${get('month')}-${get('day')}`,
        day: Number(get('day')),
        hour: Number(get('hour')) % 24,
        minute: Number(get('minute')),
    };
}
function taipeiDateOf(dt) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(dt);
}
async function tick() {
    const now = taipeiNow();
    const rules = await app_1.prisma.notificationRule.findMany({
        where: { enabled: true, hour: now.hour, minute: now.minute },
    });
    for (const rule of rules) {
        // 每天最多跑一次
        if (rule.lastRunAt && taipeiDateOf(rule.lastRunAt) === now.date)
            continue;
        // 每月型的通知只在指定日期跑
        if (rule.kind === 'RENT_GENERATE' && (rule.dayOfMonth ?? 1) !== now.day)
            continue;
        try {
            const result = await runRule(rule);
            console.log(`[scheduler] ${rule.kind} user=${rule.userId}`, result);
        }
        catch (err) {
            console.error(`[scheduler] ${rule.kind} user=${rule.userId} 失敗`, err);
        }
        finally {
            await app_1.prisma.notificationRule.update({
                where: { id: rule.id },
                data: { lastRunAt: new Date() },
            });
        }
    }
}
function startScheduler() {
    // 每分鐘掃一次；實際要不要跑由各規則自己的時間決定。
    node_cron_1.default.schedule('* * * * *', tick, { timezone: TZ });
    console.log('Notification scheduler started (per-user rules, minute tick)');
}
