import { prisma } from '../app';
import { rentDueDate, startOfTodayTaipei } from '../utils/dates';

export async function generateMonthlyRentRecords(contractId: string) {
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) return;

  const start = new Date(contract.startDate);
  const end = new Date(contract.endDate);
  const now = new Date();

  let current = new Date(start.getFullYear(), start.getMonth(), 1);
  const cutoff = new Date(Math.min(end.getTime(), new Date(now.getFullYear(), now.getMonth() + 3, 0).getTime()));

  while (current <= cutoff) {
    const year = current.getFullYear();
    const month = current.getMonth() + 1;
    const dueDate = rentDueDate(year, month, contract.rentDueDay);

    await prisma.rentRecord.upsert({
      where: { contractId_year_month: { contractId, year, month } },
      update: {},
      create: {
        contractId,
        year,
        month,
        dueDate,
        amount: contract.monthlyRent,
        status: dueDate < startOfTodayTaipei(now) ? 'OVERDUE' : 'PENDING',
      },
    });

    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }
}
