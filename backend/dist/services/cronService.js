"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCronJobs = startCronJobs;
const node_cron_1 = __importDefault(require("node-cron"));
const reminderService_1 = require("./reminderService");
function startCronJobs() {
    // Run daily at 9:00 AM
    node_cron_1.default.schedule('0 9 * * *', async () => {
        console.log('[Cron] Running daily rent reminders...');
        try {
            const result = await (0, reminderService_1.runDailyReminders)();
            console.log(`[Cron] Reminders done: ${result.sent} sent, ${result.failed} failed`);
        }
        catch (err) {
            console.error('[Cron] Reminder job failed:', err);
        }
    }, { timezone: 'Asia/Taipei' });
    console.log('[Cron] Scheduled: daily rent reminders at 09:00 Asia/Taipei');
}
