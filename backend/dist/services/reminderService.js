"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDailyReminders = runDailyReminders;
const app_1 = require("../app");
const lineService_1 = require("./lineService");
async function runDailyReminders(opts = {}) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let sent = 0;
    let failed = 0;
    // Get all users with reminders enabled
    const settings = await app_1.prisma.reminderSetting.findMany({
        where: { enabled: true },
        include: { user: true },
    });
    // Get users with default settings (no record yet = use defaults)
    // 員工帳號共用管理員的資料，不另外跑提醒
    const allUsers = await app_1.prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    const settingUserIds = new Set(settings.map((s) => s.userId));
    const defaultUsers = allUsers
        .filter((u) => !settingUserIds.has(u.id))
        .map((u) => ({
        userId: u.id,
        enabled: true,
        daysBefore: 3,
        remindOnDue: true,
        overdueEnabled: true,
        overdueInterval: 3,
    }));
    const allSettings = [
        ...settings.map((s) => ({
            userId: s.userId,
            enabled: s.enabled,
            daysBefore: s.daysBefore,
            remindOnDue: s.remindOnDue,
            overdueEnabled: s.overdueEnabled,
            overdueInterval: s.overdueInterval,
        })),
        ...defaultUsers,
    ];
    const scoped = allSettings
        .filter((s) => !opts.userId || s.userId === opts.userId)
        .map((s) => ({ ...s, ...opts.override }));
    for (const setting of scoped) {
        // Fetch all PENDING/OVERDUE rent records for this user
        const records = await app_1.prisma.rentRecord.findMany({
            where: {
                status: { in: ['PENDING', 'OVERDUE'] },
                contract: {
                    status: 'ACTIVE',
                    unit: { property: { userId: setting.userId } },
                },
            },
            include: {
                contract: {
                    include: {
                        tenant: true,
                        unit: { include: { property: true } },
                    },
                },
                reminderLogs: true,
            },
        });
        for (const record of records) {
            const tenant = record.contract.tenant;
            if (!tenant.lineUserId)
                continue;
            const dueDate = new Date(record.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            const daysUntilDue = Math.floor((dueDate.getTime() - today.getTime()) / 86400000);
            const unitNum = record.contract.unit.unitNumber;
            const propName = record.contract.unit.property.name;
            const sentKeys = new Set(record.reminderLogs.map((l) => l.triggerKey));
            // Before-due reminder
            if (opts.only !== 'OVERDUE' && daysUntilDue === setting.daysBefore) {
                const key = `before_${setting.daysBefore}d`;
                if (!sentKeys.has(key)) {
                    const text = `📅 繳租提醒\n\n您好 ${tenant.name}，\n${propName} ${unitNum} 的租金將於 ${setting.daysBefore} 天後（${dueDate.toLocaleDateString('zh-TW')}）到期。\n\n💰 應繳金額：NT$${Number(record.amount).toLocaleString()}\n\n請記得準時繳納，謝謝！`;
                    const ok = await (0, lineService_1.sendTenantMessage)(tenant.id, text);
                    await app_1.prisma.reminderLog.upsert({
                        where: { rentRecordId_triggerKey: { rentRecordId: record.id, triggerKey: key } },
                        create: { rentRecordId: record.id, triggerKey: key, success: ok },
                        update: { sentAt: new Date(), success: ok },
                    });
                    ok ? sent++ : failed++;
                }
            }
            // On-due reminder
            if (opts.only !== 'OVERDUE' && daysUntilDue === 0 && setting.remindOnDue) {
                const key = 'on_due';
                if (!sentKeys.has(key)) {
                    const text = `🔔 今日繳租提醒\n\n您好 ${tenant.name}，\n${propName} ${unitNum} 的租金今天（${dueDate.toLocaleDateString('zh-TW')}）到期！\n\n💰 應繳金額：NT$${Number(record.amount).toLocaleString()}\n\n請盡快完成繳納，感謝配合！`;
                    const ok = await (0, lineService_1.sendTenantMessage)(tenant.id, text);
                    await app_1.prisma.reminderLog.upsert({
                        where: { rentRecordId_triggerKey: { rentRecordId: record.id, triggerKey: key } },
                        create: { rentRecordId: record.id, triggerKey: key, success: ok },
                        update: { sentAt: new Date(), success: ok },
                    });
                    ok ? sent++ : failed++;
                }
            }
            // Overdue reminders (send every overdueInterval days)
            if (opts.only !== 'DUE' && record.status === 'OVERDUE' && setting.overdueEnabled && daysUntilDue < 0) {
                const daysOverdue = Math.abs(daysUntilDue);
                // Send on day 1, then every overdueInterval days
                const shouldSend = daysOverdue === 1 || daysOverdue % setting.overdueInterval === 0;
                if (shouldSend) {
                    const key = `overdue_day${daysOverdue}`;
                    if (!sentKeys.has(key)) {
                        const text = `⚠️ 租金逾期通知\n\n您好 ${tenant.name}，\n${propName} ${unitNum} 的租金已逾期 ${daysOverdue} 天！\n\n💰 應繳金額：NT$${Number(record.amount).toLocaleString()}\n📅 原到期日：${dueDate.toLocaleDateString('zh-TW')}\n\n請盡快聯繫業者並完成繳納。`;
                        const ok = await (0, lineService_1.sendTenantMessage)(tenant.id, text);
                        await app_1.prisma.reminderLog.upsert({
                            where: { rentRecordId_triggerKey: { rentRecordId: record.id, triggerKey: key } },
                            create: { rentRecordId: record.id, triggerKey: key, success: ok },
                            update: { sentAt: new Date(), success: ok },
                        });
                        ok ? sent++ : failed++;
                    }
                }
            }
        }
    }
    return { sent, failed };
}
