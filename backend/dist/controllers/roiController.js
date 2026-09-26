"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getROIAnalysis = getROIAnalysis;
const app_1 = require("../app");
async function getROIAnalysis(req, res) {
    const userId = req.userId;
    const now = new Date();
    const yearAgo = new Date(now);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const totalDays = Math.floor((now.getTime() - yearAgo.getTime()) / (1000 * 60 * 60 * 24));
    const properties = await app_1.prisma.property.findMany({
        where: { userId },
        include: {
            units: {
                include: {
                    contracts: {
                        include: {
                            rentRecords: {
                                where: { dueDate: { gte: yearAgo, lte: now } },
                            },
                        },
                    },
                    expenses: {
                        where: { date: { gte: yearAgo, lte: now } },
                    },
                },
            },
            expenses: {
                where: { date: { gte: yearAgo, lte: now } },
            },
        },
    });
    const result = properties.map((property) => {
        let totalExpected = 0;
        let totalCollected = 0;
        let totalVacancyDays = 0;
        let totalVacancyCost = 0;
        let unitExpenses = 0;
        const propertyExpenses = property.expenses.reduce((s, e) => s + Number(e.amount), 0);
        const unitDetails = property.units.map((unit) => {
            const monthlyRent = Number(unit.monthlyRent);
            const dailyRent = monthlyRent / 30;
            // Calculate days this unit was covered by a contract in the 12m window
            let rentedDays = 0;
            for (const contract of unit.contracts) {
                const cStart = contract.startDate < yearAgo ? yearAgo : contract.startDate;
                const cEnd = contract.endDate
                    ? (contract.endDate > now ? now : contract.endDate)
                    : now;
                if (cEnd > cStart) {
                    rentedDays += Math.floor((cEnd.getTime() - cStart.getTime()) / (1000 * 60 * 60 * 24));
                }
            }
            rentedDays = Math.min(rentedDays, totalDays);
            const unitVacancyDays = Math.max(0, totalDays - rentedDays);
            totalVacancyDays += unitVacancyDays;
            totalVacancyCost += unitVacancyDays * dailyRent;
            for (const contract of unit.contracts) {
                for (const record of contract.rentRecords) {
                    totalExpected += Number(record.amount);
                    if (record.status === 'PAID') {
                        totalCollected += record.paidAmount ? Number(record.paidAmount) : Number(record.amount);
                    }
                    else if (record.status === 'PARTIAL' && record.paidAmount) {
                        totalCollected += Number(record.paidAmount);
                    }
                }
            }
            unitExpenses += unit.expenses.reduce((s, e) => s + Number(e.amount), 0);
            return {
                id: unit.id,
                unitNumber: unit.unitNumber,
                status: unit.status,
                monthlyRent,
                vacancyDays: unitVacancyDays,
                vacancyCost: Math.round(unitVacancyDays * dailyRent),
            };
        });
        const totalExpensesAll = Math.round(propertyExpenses + unitExpenses);
        const netIncome = Math.round(totalCollected - totalExpensesAll);
        const purchasePrice = property.purchasePrice ? Number(property.purchasePrice) : null;
        const annualizedROI = purchasePrice && purchasePrice > 0
            ? Math.round((netIncome / purchasePrice) * 1000) / 10
            : null;
        return {
            id: property.id,
            name: property.name,
            address: property.address,
            purchasePrice,
            totalUnits: property.units.length,
            occupiedUnits: property.units.filter((u) => u.status === 'OCCUPIED').length,
            totalExpected: Math.round(totalExpected),
            totalCollected: Math.round(totalCollected),
            totalExpenses: totalExpensesAll,
            netIncome,
            vacancyDays: totalVacancyDays,
            vacancyCost: Math.round(totalVacancyCost),
            annualizedROI,
            collectionRate: totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0,
            units: unitDetails,
        };
    });
    result.sort((a, b) => b.netIncome - a.netIncome);
    res.json(result);
}
