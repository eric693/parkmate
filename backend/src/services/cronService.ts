import cron from 'node-cron';
import { runDailyReminders } from './reminderService';

export function startCronJobs() {
  // Run daily at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('[Cron] Running daily rent reminders...');
    try {
      const result = await runDailyReminders();
      console.log(`[Cron] Reminders done: ${result.sent} sent, ${result.failed} failed`);
    } catch (err) {
      console.error('[Cron] Reminder job failed:', err);
    }
  }, { timezone: 'Asia/Taipei' });

  console.log('[Cron] Scheduled: daily rent reminders at 09:00 Asia/Taipei');
}
