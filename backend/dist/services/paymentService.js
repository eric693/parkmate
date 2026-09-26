"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateVirtualAccount = getOrCreateVirtualAccount;
exports.reconcilePayment = reconcilePayment;
exports.suggestMatches = suggestMatches;
exports.manualMatch = manualMatch;
const app_1 = require("../app");
const payment_1 = require("./payment");
const lineService_1 = require("./lineService");
// 取得（或建立）合約的專屬虛擬帳號
async function getOrCreateVirtualAccount(contractId) {
    const existing = await app_1.prisma.virtualAccount.findUnique({ where: { contractId } });
    if (existing)
        return existing;
    const provider = (0, payment_1.getPaymentProvider)();
    const info = await provider.generateVirtualAccount(contractId);
    return app_1.prisma.virtualAccount.create({
        data: {
            contractId,
            provider: info.provider,
            bankCode: info.bankCode,
            accountNumber: info.accountNumber,
        },
    });
}
// 自動對帳核心：把一筆標準化入帳事件銷到對應的繳租紀錄。
// 規則：
//  1. 用虛擬帳號找到合約。
//  2. 取該合約最早一筆未結清（PENDING/OVERDUE/PARTIAL）的繳租紀錄。
//  3. 金額足額 → PAID；不足 → PARTIAL（累加已繳）。
//  4. 找不到帳號或無未結清紀錄 → 記為 UNMATCHED 待人工處理。
//  5. providerTxnId 已存在 → 視為重複入帳，直接略過（冪等）。
async function reconcilePayment(np) {
    // 冪等：同一筆 provider 交易只處理一次
    const dup = await app_1.prisma.payment.findUnique({ where: { providerTxnId: np.providerTxnId } });
    if (dup) {
        return { status: 'DUPLICATE', paymentId: dup.id, message: '重複入帳通知，已略過' };
    }
    const va = await app_1.prisma.virtualAccount.findUnique({
        where: { accountNumber: np.accountNumber },
        include: {
            contract: {
                include: { tenant: true, unit: { include: { property: true } } },
            },
        },
    });
    // 找不到對應帳號 → 未匹配
    if (!va) {
        const payment = await app_1.prisma.payment.create({
            data: {
                amount: np.amount,
                paidAt: np.paidAt,
                provider: (0, payment_1.getPaymentProvider)().name,
                providerTxnId: np.providerTxnId,
                payerName: np.payerName,
                status: 'UNMATCHED',
                rawPayload: np.raw,
                note: `查無虛擬帳號 ${np.accountNumber}`,
            },
        });
        return { status: 'UNMATCHED', paymentId: payment.id, message: '查無對應虛擬帳號，需人工處理' };
    }
    const contract = va.contract;
    // 找最早一筆未結清的繳租紀錄
    const target = await app_1.prisma.rentRecord.findFirst({
        where: { contractId: contract.id, status: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] } },
        orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    if (!target) {
        const payment = await app_1.prisma.payment.create({
            data: {
                contractId: contract.id,
                virtualAccountId: va.id,
                amount: np.amount,
                paidAt: np.paidAt,
                provider: va.provider,
                providerTxnId: np.providerTxnId,
                payerName: np.payerName,
                status: 'UNMATCHED',
                rawPayload: np.raw,
                note: '查無未結清的繳租紀錄（可能溢繳或預繳）',
            },
        });
        await notifyLandlordUnmatched(contract.unit.property.userId, contract, np.amount, '查無未結清帳單');
        return { status: 'UNMATCHED', paymentId: payment.id, message: '查無未結清帳單，需人工處理' };
    }
    // 計算累計已繳
    const alreadyPaid = target.paidAmount ? Number(target.paidAmount) : 0;
    const totalPaid = alreadyPaid + np.amount;
    const expected = Number(target.amount);
    const fullyPaid = totalPaid >= expected;
    const [, payment] = await app_1.prisma.$transaction([
        app_1.prisma.rentRecord.update({
            where: { id: target.id },
            data: {
                paidAmount: totalPaid,
                paidDate: np.paidAt,
                status: fullyPaid ? 'PAID' : 'PARTIAL',
                paymentMethod: 'VIRTUAL_ACCOUNT',
            },
        }),
        app_1.prisma.payment.create({
            data: {
                contractId: contract.id,
                rentRecordId: target.id,
                virtualAccountId: va.id,
                amount: np.amount,
                paidAt: np.paidAt,
                provider: va.provider,
                providerTxnId: np.providerTxnId,
                payerName: np.payerName,
                status: 'MATCHED',
                reconciledAt: new Date(),
                rawPayload: np.raw,
            },
        }),
    ]);
    // 通知業者與車主
    const propName = contract.unit.property.name;
    const unitNum = contract.unit.unitNumber;
    const amountStr = `NT$${np.amount.toLocaleString()}`;
    await (0, lineService_1.sendLandlordMessage)(contract.unit.property.userId, `已收到租金入帳\n\n${propName} ${unitNum} ${contract.tenant.name}\n金額：${amountStr}\n${target.year} 年 ${target.month} 月租金${fullyPaid ? '已全額銷帳' : `部分繳納（已繳 NT$${totalPaid.toLocaleString()} / 應繳 NT$${expected.toLocaleString()}）`}`);
    if (contract.tenant.lineUserId) {
        await (0, lineService_1.sendTenantMessage)(contract.tenant.id, `收款確認\n\n${contract.tenant.name} 您好，已收到您 ${target.year} 年 ${target.month} 月的租金 ${amountStr}${fullyPaid ? '，本期已結清，謝謝您！' : `，目前已繳 NT$${totalPaid.toLocaleString()}，尚餘 NT$${(expected - totalPaid).toLocaleString()}。`}`);
    }
    return {
        status: fullyPaid ? 'MATCHED' : 'PARTIAL',
        paymentId: payment.id,
        rentRecordId: target.id,
        message: fullyPaid ? '已自動全額銷帳' : '已自動部分銷帳',
    };
}
async function notifyLandlordUnmatched(userId, contract, amount, reason) {
    await (0, lineService_1.sendLandlordMessage)(userId, `入帳待確認\n\n${contract.unit.property.name} ${contract.unit.unitNumber} ${contract.tenant.name}\n金額：NT$${amount.toLocaleString()}\n原因：${reason}\n請至對帳頁面人工處理。`);
}
async function suggestMatches(paymentId, userId) {
    const payment = await app_1.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment)
        throw new Error('找不到入帳紀錄');
    const payAmount = Number(payment.amount);
    const payerName = (payment.payerName ?? '').replace(/\s/g, '');
    const candidates = await app_1.prisma.rentRecord.findMany({
        where: {
            status: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] },
            contract: { unit: { property: { userId } } },
        },
        include: { contract: { include: { tenant: true, unit: { include: { property: true } } } } },
        orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    const suggestions = candidates.map((r) => {
        const due = Number(r.amount);
        const paid = r.paidAmount ? Number(r.paidAmount) : 0;
        const outstanding = due - paid;
        const reasons = [];
        let score = 0;
        const tName = r.contract.tenant.name.replace(/\s/g, '');
        if (payerName && (payerName.includes(tName) || tName.includes(payerName))) {
            score += 50;
            reasons.push('付款人姓名相符');
        }
        if (Math.abs(payAmount - outstanding) < 1) {
            score += 35;
            reasons.push('金額與未繳餘額完全相符');
        }
        else if (outstanding > 0 && Math.abs(payAmount - outstanding) / outstanding <= 0.05) {
            score += 15;
            reasons.push('金額接近未繳餘額（±5%）');
        }
        else if (Math.abs(payAmount - due) < 1) {
            score += 20;
            reasons.push('金額與當期應繳相符');
        }
        const daysToDue = Math.abs((payment.paidAt.getTime() - r.dueDate.getTime()) / 86400000);
        if (daysToDue <= 10) {
            score += Math.round(10 - daysToDue);
            reasons.push('入帳時間接近繳款日');
        }
        if (r.status === 'OVERDUE') {
            score += 5;
            reasons.push('該期已逾期');
        }
        return {
            rentRecordId: r.id,
            score,
            confidence: score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW',
            reasons,
            contractId: r.contractId,
            tenantName: r.contract.tenant.name,
            property: r.contract.unit.property.name,
            unit: r.contract.unit.unitNumber,
            period: `${r.year}/${r.month}`,
            amountDue: due,
            outstanding,
        };
    });
    return suggestions.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
}
// 人工銷帳：把一筆未匹配的 Payment 指定到某張繳租紀錄
async function manualMatch(paymentId, rentRecordId, userId) {
    const payment = await app_1.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment)
        throw new Error('找不到入帳紀錄');
    const record = await app_1.prisma.rentRecord.findUnique({
        where: { id: rentRecordId },
        include: { contract: { include: { unit: { include: { property: true } } } } },
    });
    if (!record || record.contract.unit.property.userId !== userId) {
        throw new Error('找不到繳租紀錄或無權限');
    }
    const alreadyPaid = record.paidAmount ? Number(record.paidAmount) : 0;
    const totalPaid = alreadyPaid + Number(payment.amount);
    const fullyPaid = totalPaid >= Number(record.amount);
    await app_1.prisma.$transaction([
        app_1.prisma.rentRecord.update({
            where: { id: rentRecordId },
            data: {
                paidAmount: totalPaid,
                paidDate: payment.paidAt,
                status: fullyPaid ? 'PAID' : 'PARTIAL',
                paymentMethod: 'VIRTUAL_ACCOUNT',
            },
        }),
        app_1.prisma.payment.update({
            where: { id: paymentId },
            data: {
                rentRecordId,
                contractId: record.contractId,
                status: 'MANUAL',
                reconciledAt: new Date(),
            },
        }),
    ]);
    return {
        status: fullyPaid ? 'MATCHED' : 'PARTIAL',
        paymentId,
        rentRecordId,
        message: fullyPaid ? '已人工全額銷帳' : '已人工部分銷帳',
    };
}
