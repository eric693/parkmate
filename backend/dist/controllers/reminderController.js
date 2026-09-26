"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReminderSettings = getReminderSettings;
exports.updateReminderSettings = updateReminderSettings;
exports.triggerReminders = triggerReminders;
const app_1 = require("../app");
const reminderService_1 = require("../services/reminderService");
async function getReminderSettings(req, res) {
    const setting = await app_1.prisma.reminderSetting.findUnique({ where: { userId: req.userId } });
    res.json(setting ?? {
        enabled: true,
        daysBefore: 3,
        remindOnDue: true,
        overdueEnabled: true,
        overdueInterval: 3,
    });
}
async function updateReminderSettings(req, res) {
    const { enabled, daysBefore, remindOnDue, overdueEnabled, overdueInterval } = req.body;
    const setting = await app_1.prisma.reminderSetting.upsert({
        where: { userId: req.userId },
        create: { userId: req.userId, enabled, daysBefore, remindOnDue, overdueEnabled, overdueInterval },
        update: { enabled, daysBefore, remindOnDue, overdueEnabled, overdueInterval },
    });
    res.json(setting);
}
async function triggerReminders(req, res) {
    const result = await (0, reminderService_1.runDailyReminders)();
    res.json({ message: `已發送 ${result.sent} 則提醒`, ...result });
}
