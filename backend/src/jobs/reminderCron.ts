import cron from 'node-cron';
import { prisma } from '../app';
import { sendLandlordMessage, sendTenantMessage } from '../services/lineService';
import { runDailyReminders } from '../services/reminderService';
import { startOfTodayTaipei } from '../utils/dates';
import { billingFor } from '../services/rentService';

export function startReminderJobs() {
  // Daily at 9:00 AM — mark overdue + smart reminders + contract expiry
  cron.schedule('0 9 * * *', async () => {
    await markOverdueRents();
    await runDailyReminders();          // settings-aware per-user reminders
    await sendContractExpiryAlerts();
    await sendOverdueAlerts();          // landlord consolidated alert
  }, { timezone: 'Asia/Taipei' });

  // Monthly on the 1st at 8:00 AM — generate new month records
  cron.schedule('0 8 1 * *', async () => {
    await generateNewMonthRentRecords();
  }, { timezone: 'Asia/Taipei' });

  console.log('Reminder cron jobs started');
}

async function markOverdueRents() {
  const now = new Date();
  const result = await prisma.rentRecord.updateMany({
    where: { status: 'PENDING', dueDate: { lt: startOfTodayTaipei(now) } },
    data: { status: 'OVERDUE' },
  });
  if (result.count > 0) console.log(`Marked ${result.count} rent records as overdue`);
}

async function sendOverdueAlerts() {
  const now = new Date();
  const overdueRecords = await prisma.rentRecord.findMany({
    where: { status: 'OVERDUE' },
    include: {
      contract: {
        include: {
          tenant: true,
          unit: { include: { property: { include: { user: true } } } },
        },
      },
    },
  });

  // Group by landlord for a single consolidated message
  const byLandlord: Record<string, typeof overdueRecords> = {};
  for (const r of overdueRecords) {
    const lid = r.contract.unit.property.userId;
    if (!byLandlord[lid]) byLandlord[lid] = [];
    byLandlord[lid].push(r);
  }

  for (const [landlordId, records] of Object.entries(byLandlord)) {
    const lines: string[] = ['⚠️ 逾期租金彙整\n'];
    for (const r of records) {
      const daysOverdue = Math.floor((now.getTime() - r.dueDate.getTime()) / 86400000);
      lines.push(
        `🏠 ${r.contract.unit.unitNumber} - ${r.contract.tenant.name}` +
        `\n💰 金額：NT$${Number(r.amount).toLocaleString()}` +
        `\n📅 到期日：${r.dueDate.toISOString().split('T')[0]}` +
        `\n⚠️ 已逾期：${daysOverdue} 天`
      );
    }
    lines.push(`\n---\n請盡快聯繫車主催繳。\n⏰ 發送時間：${new Date().toLocaleString('zh-TW')}`);
    await sendLandlordMessage(landlordId, lines.join('\n\n'));

    // Individual messages to each tenant
    for (const r of records) {
      const daysOverdue = Math.floor((now.getTime() - r.dueDate.getTime()) / 86400000);
      if ([1, 3, 7, 14, 30].includes(daysOverdue)) {
        await sendTenantMessage(
          r.contract.tenant.id,
          `⚠️ 繳租提醒\n\n${r.contract.tenant.name} 您好，您的 ${r.contract.unit.unitNumber} 號月租金已逾期 ${daysOverdue} 天。\n\n💰 應繳金額：NT$${Number(r.amount).toLocaleString()}\n📅 原到期日：${r.dueDate.toISOString().split('T')[0]}\n\n請盡快繳納，如已繳款請告知業者，謝謝！`
        );
      }
    }
  }
}

async function sendContractExpiryAlerts() {
  const now = new Date();
  const contracts = await prisma.contract.findMany({
    where: { status: 'ACTIVE' },
    include: {
      tenant: true,
      unit: { include: { property: { include: { user: true } } } },
    },
  });

  for (const contract of contracts) {
    const daysLeft = Math.ceil((contract.endDate.getTime() - now.getTime()) / 86400000);
    const landlordId = contract.unit.property.userId;

    if ([30, 14, 7].includes(daysLeft)) {
      // To landlord
      await sendLandlordMessage(
        landlordId,
        `📄 合約即將到期\n\n${contract.tenant.name} / ${contract.unit.unitNumber}\n租約到期日：${contract.endDate.toISOString().split('T')[0]}\n剩餘天數：${daysLeft} 天\n\n請確認是否續租並通知車主。`
      );

      // To tenant
      await sendTenantMessage(
        contract.tenant.id,
        `📄 合約即將到期\n\n${contract.tenant.name} 您好！\n\n您的 ${contract.unit.unitNumber} 號月租約即將到期。\n租約到期日：${contract.endDate.toISOString().split('T')[0]}\n剩餘天數：${daysLeft} 天\n\n如需續租請及早與業者確認，謝謝！`
      );

      if (daysLeft === 7) {
        await prisma.contract.update({ where: { id: contract.id }, data: { status: 'EXPIRED' } });
        await prisma.unit.update({ where: { id: contract.unitId }, data: { status: 'VACANT' } });
      }
    }
  }
}

async function generateNewMonthRentRecords() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const contracts = await prisma.contract.findMany({
    where: { status: 'ACTIVE', endDate: { gte: now } },
  });

  for (const contract of contracts) {
    const bill = billingFor(contract, year, month);
    if (!bill) continue;
    await prisma.rentRecord.upsert({
      where: { contractId_year_month: { contractId: contract.id, year, month } },
      update: {},
      create: { contractId: contract.id, year, month, dueDate: bill.dueDate, amount: bill.amount, status: 'PENDING' },
    });
  }
  console.log(`Generated rent records for ${year}/${month}`);
}
