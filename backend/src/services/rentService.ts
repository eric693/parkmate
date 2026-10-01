import { BillingCycle, Contract } from '@prisma/client';
import { prisma } from '../app';
import { rentDueDate, startOfTodayTaipei } from '../utils/dates';

/** 每期涵蓋幾個月。SHORT_TERM 不分期，整段合約一次收。 */
export const CYCLE_MONTHS: Record<Exclude<BillingCycle, 'SHORT_TERM'>, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
};

type BillingContract = Pick<Contract, 'startDate' | 'endDate' | 'monthlyRent' | 'rentDueDay' | 'billingCycle' | 'periodAmount'>;

const monthIndex = (year: number, month: number) => year * 12 + (month - 1);

/**
 * 某合約在某年某月要不要開租金單、開多少。
 * - 月繳：每個月一張，金額 = periodAmount ?? 月租。
 * - 季／半年／年繳：從起租月起每 N 個月一張；合約在期中結束時，最後一期按月數比例收。
 * - 短租：只在起租月開一張，到期日 = 起租日（先付後停）。
 * 回傳 null 表示這個月不用開單。
 */
export function billingFor(contract: BillingContract, year: number, month: number) {
  const start = new Date(contract.startDate);
  const end = new Date(contract.endDate);
  const startIdx = monthIndex(start.getUTCFullYear(), start.getUTCMonth() + 1);
  const idx = monthIndex(year, month);
  const rent = Number(contract.monthlyRent);

  if (contract.billingCycle === 'SHORT_TERM') {
    if (idx !== startIdx) return null;
    const amount = contract.periodAmount != null ? Number(contract.periodAmount) : rent;
    const dueDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    return { amount, dueDate };
  }

  const n = CYCLE_MONTHS[contract.billingCycle];
  const offset = idx - startIdx;
  if (offset < 0 || offset % n !== 0) return null;

  // 這一期實際涵蓋的月數（合約結束月之後的不算）
  const endIdx = monthIndex(end.getUTCFullYear(), end.getUTCMonth() + 1);
  const covered = Math.max(0, Math.min(n, endIdx - idx + 1));
  if (covered === 0) return null;

  const full = contract.periodAmount != null ? Number(contract.periodAmount) : rent * n;
  const amount = covered === n ? full : Math.round((full * covered) / n);
  return { amount, dueDate: rentDueDate(year, month, contract.rentDueDay) };
}

export async function generateMonthlyRentRecords(contractId: string) {
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) return;

  const start = new Date(contract.startDate);
  const end = new Date(contract.endDate);
  const now = new Date();

  let current = new Date(start.getFullYear(), start.getMonth(), 1);
  const cutoff = new Date(Math.min(end.getTime(), new Date(now.getFullYear(), now.getMonth() + 3, 0).getTime()));
  // 短租一定在起租月開單，即使起租日在三個月後
  if (contract.billingCycle === 'SHORT_TERM' && current > cutoff) cutoff.setTime(current.getTime());

  while (current <= cutoff) {
    const year = current.getFullYear();
    const month = current.getMonth() + 1;
    const bill = billingFor(contract, year, month);

    if (bill) {
      await prisma.rentRecord.upsert({
        where: { contractId_year_month: { contractId, year, month } },
        update: {},
        create: {
          contractId,
          year,
          month,
          dueDate: bill.dueDate,
          amount: bill.amount,
          status: bill.dueDate < startOfTodayTaipei(now) ? 'OVERDUE' : 'PENDING',
        },
      });
    }

    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }
}

/**
 * 繳費方式改了以後重開租金單：刪掉還沒到期、沒收過錢的單，再依新規則產生。
 * 已繳、部分繳、逾期或已有收款紀錄的單都保留，避免帳對不起來。
 */
export async function regenerateFutureRentRecords(contractId: string) {
  const stale = await prisma.rentRecord.findMany({
    where: {
      contractId,
      status: 'PENDING',
      paidAmount: null,
      dueDate: { gte: startOfTodayTaipei() },
      payments: { none: {} },
    },
    select: { id: true },
  });
  const ids = stale.map((r) => r.id);
  if (ids.length > 0) {
    await prisma.$transaction([
      prisma.reminderLog.deleteMany({ where: { rentRecordId: { in: ids } } }),
      prisma.rentRecord.deleteMany({ where: { id: { in: ids } } }),
    ]);
  }
  await generateMonthlyRentRecords(contractId);
}
