"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMonthlyRentRecords = generateMonthlyRentRecords;
const app_1 = require("../app");
const dates_1 = require("../utils/dates");
async function generateMonthlyRentRecords(contractId) {
    const contract = await app_1.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract)
        return;
    const start = new Date(contract.startDate);
    const end = new Date(contract.endDate);
    const now = new Date();
    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    const cutoff = new Date(Math.min(end.getTime(), new Date(now.getFullYear(), now.getMonth() + 3, 0).getTime()));
    while (current <= cutoff) {
        const year = current.getFullYear();
        const month = current.getMonth() + 1;
        const dueDate = (0, dates_1.rentDueDate)(year, month, contract.rentDueDay);
        await app_1.prisma.rentRecord.upsert({
            where: { contractId_year_month: { contractId, year, month } },
            update: {},
            create: {
                contractId,
                year,
                month,
                dueDate,
                amount: contract.monthlyRent,
                status: dueDate < (0, dates_1.startOfTodayTaipei)(now) ? 'OVERDUE' : 'PENDING',
            },
        });
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
}
