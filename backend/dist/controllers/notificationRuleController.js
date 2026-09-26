"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNotificationRules = getNotificationRules;
exports.updateNotificationRule = updateNotificationRule;
exports.triggerNotificationRule = triggerNotificationRule;
const app_1 = require("../app");
const notificationScheduler_1 = require("../services/notificationScheduler");
function serialize(r) {
    return {
        id: r.id,
        kind: r.kind,
        label: notificationScheduler_1.KIND_LABELS[r.kind],
        enabled: r.enabled,
        hour: r.hour,
        minute: r.minute,
        daysBefore: r.daysBefore,
        intervalDays: r.intervalDays,
        dayOfMonth: r.dayOfMonth,
        threshold: r.threshold ? Number(r.threshold) : null,
        remindOnDue: r.remindOnDue,
        lastRunAt: r.lastRunAt,
    };
}
/** 取得六種通知的排程規則，缺的自動補上預設值。 */
async function getNotificationRules(req, res) {
    const rules = await (0, notificationScheduler_1.ensureRules)(req.userId);
    const order = new Map(notificationScheduler_1.ALL_KINDS.map((k, i) => [k, i]));
    rules.sort((a, b) => (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0));
    res.json(rules.map(serialize));
}
async function updateNotificationRule(req, res) {
    const kind = req.params.kind;
    if (!notificationScheduler_1.ALL_KINDS.includes(kind)) {
        res.status(400).json({ error: '不支援的通知類型' });
        return;
    }
    await (0, notificationScheduler_1.ensureRules)(req.userId);
    const { enabled, hour, minute, daysBefore, intervalDays, dayOfMonth, threshold, remindOnDue } = req.body;
    if (hour !== undefined && (!Number.isInteger(hour) || hour < 0 || hour > 23)) {
        res.status(400).json({ error: '時必須是 0–23 的整數' });
        return;
    }
    if (minute !== undefined && (!Number.isInteger(minute) || minute < 0 || minute > 59)) {
        res.status(400).json({ error: '分必須是 0–59 的整數' });
        return;
    }
    if (dayOfMonth !== undefined && dayOfMonth !== null && (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28)) {
        res.status(400).json({ error: '每月執行日請設在 1–28，避免月底缺日' });
        return;
    }
    if (daysBefore !== undefined) {
        if (!Array.isArray(daysBefore) || daysBefore.some((d) => !Number.isInteger(d) || d < 0 || d > 365)) {
            res.status(400).json({ error: '提前天數必須是 0–365 的整數' });
            return;
        }
    }
    const rule = await app_1.prisma.notificationRule.update({
        where: { userId_kind: { userId: req.userId, kind } },
        data: {
            ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
            ...(hour !== undefined ? { hour } : {}),
            ...(minute !== undefined ? { minute } : {}),
            ...(daysBefore !== undefined ? { daysBefore: [...new Set(daysBefore)].sort((a, b) => b - a) } : {}),
            ...(intervalDays !== undefined ? { intervalDays: intervalDays === null ? null : Number(intervalDays) } : {}),
            ...(dayOfMonth !== undefined ? { dayOfMonth } : {}),
            ...(threshold !== undefined ? { threshold: threshold === null ? null : Number(threshold) } : {}),
            ...(remindOnDue !== undefined ? { remindOnDue: Boolean(remindOnDue) } : {}),
        },
    });
    res.json(serialize(rule));
}
/** 立即執行一次該規則，不影響排程的每日一次限制。 */
async function triggerNotificationRule(req, res) {
    const kind = req.params.kind;
    if (!notificationScheduler_1.ALL_KINDS.includes(kind)) {
        res.status(400).json({ error: '不支援的通知類型' });
        return;
    }
    await (0, notificationScheduler_1.ensureRules)(req.userId);
    const rule = await app_1.prisma.notificationRule.findUniqueOrThrow({
        where: { userId_kind: { userId: req.userId, kind } },
    });
    try {
        const result = await (0, notificationScheduler_1.runRule)(rule);
        res.json({ message: `已執行「${notificationScheduler_1.KIND_LABELS[kind]}」`, result });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}
