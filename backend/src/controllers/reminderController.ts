import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';
import { runDailyReminders } from '../services/reminderService';

export async function getReminderSettings(req: AuthRequest, res: Response) {
  const setting = await prisma.reminderSetting.findUnique({ where: { userId: req.userId! } });
  res.json(setting ?? {
    enabled: true,
    daysBefore: 3,
    remindOnDue: true,
    overdueEnabled: true,
    overdueInterval: 3,
  });
}

export async function updateReminderSettings(req: AuthRequest, res: Response) {
  const { enabled, daysBefore, remindOnDue, overdueEnabled, overdueInterval } = req.body;
  const setting = await prisma.reminderSetting.upsert({
    where: { userId: req.userId! },
    create: { userId: req.userId!, enabled, daysBefore, remindOnDue, overdueEnabled, overdueInterval },
    update: { enabled, daysBefore, remindOnDue, overdueEnabled, overdueInterval },
  });
  res.json(setting);
}

export async function triggerReminders(req: AuthRequest, res: Response) {
  const result = await runDailyReminders();
  res.json({ message: `已發送 ${result.sent} 則提醒`, ...result });
}
