"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.taxPrecheck = taxPrecheck;
exports.exportTaxReport = exportTaxReport;
const XLSX = __importStar(require("xlsx"));
const app_1 = require("../app");
// 報稅前異常預檢：在匯出申報表前找出可能讓業者報錯數字的問題。
//  - 未確認收款：該年度仍 PENDING/OVERDUE/PARTIAL 的帳單（金額尚未落定）
//  - 缺漏月份：ACTIVE 合約在涵蓋月份卻沒有對應 RentRecord（漏開帳 → 收入少計）
//  - 金額跳動：某期 RentRecord 金額與合約月租金不一致（可能打錯）
async function taxPrecheck(req, res) {
    const userId = req.userId;
    const year = Number(req.query.year) || new Date().getFullYear();
    const startDate = new Date(`${year}-01-01T00:00:00`);
    const endDate = new Date(`${year}-12-31T23:59:59`);
    const contracts = await app_1.prisma.contract.findMany({
        where: { unit: { property: { userId } } },
        include: {
            tenant: { select: { name: true } },
            unit: { include: { property: { select: { name: true } } } },
            rentRecords: { where: { dueDate: { gte: startDate, lte: endDate } } },
        },
    });
    const issues = [];
    const now = new Date();
    for (const c of contracts) {
        const where = `${c.unit.property.name} ${c.unit.unitNumber} ${c.tenant.name}`;
        const monthlyRent = Number(c.monthlyRent);
        // 未確認收款
        for (const r of c.rentRecords) {
            if (['PENDING', 'OVERDUE', 'PARTIAL'].includes(r.status) && r.dueDate <= now) {
                issues.push({
                    severity: r.status === 'PARTIAL' ? 'MEDIUM' : 'HIGH',
                    type: 'UNCONFIRMED',
                    contractId: c.id,
                    label: where,
                    detail: `${r.year}/${r.month} 仍為「${r.status}」，金額尚未落定，請先確認收款再申報。`,
                });
            }
            // 金額跳動
            if (Math.abs(Number(r.amount) - monthlyRent) > 1) {
                issues.push({
                    severity: 'LOW',
                    type: 'AMOUNT_JUMP',
                    contractId: c.id,
                    label: where,
                    detail: `${r.year}/${r.month} 帳單金額 NT$${Number(r.amount).toLocaleString()} 與合約月租 NT$${monthlyRent.toLocaleString()} 不符，請確認是否正確。`,
                });
            }
        }
        // 缺漏月份：合約在該年度涵蓋的月份應有帳單
        const cStart = c.startDate > startDate ? c.startDate : startDate;
        const cEnd = c.endDate < endDate ? c.endDate : endDate;
        if (cStart <= cEnd && c.status !== 'TERMINATED') {
            const present = new Set(c.rentRecords.map((r) => `${r.year}-${r.month}`));
            const cur = new Date(cStart.getFullYear(), cStart.getMonth(), 1);
            const last = new Date(cEnd.getFullYear(), cEnd.getMonth(), 1);
            while (cur <= last) {
                const key = `${cur.getFullYear()}-${cur.getMonth() + 1}`;
                if (!present.has(key)) {
                    issues.push({
                        severity: 'MEDIUM',
                        type: 'MISSING_MONTH',
                        contractId: c.id,
                        label: where,
                        detail: `${cur.getFullYear()}/${cur.getMonth() + 1} 無繳租紀錄，可能漏開帳導致收入少計。`,
                    });
                }
                cur.setMonth(cur.getMonth() + 1);
            }
        }
    }
    const counts = {
        high: issues.filter((i) => i.severity === 'HIGH').length,
        medium: issues.filter((i) => i.severity === 'MEDIUM').length,
        low: issues.filter((i) => i.severity === 'LOW').length,
    };
    res.json({
        year,
        ok: issues.length === 0,
        counts,
        issues: issues.sort((a, b) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[a.severity] - { HIGH: 0, MEDIUM: 1, LOW: 2 }[b.severity])),
    });
}
async function exportTaxReport(req, res) {
    const userId = req.userId;
    const year = Number(req.query.year) || new Date().getFullYear();
    const startDate = new Date(`${year}-01-01T00:00:00`);
    const endDate = new Date(`${year}-12-31T23:59:59`);
    const [properties, user] = await Promise.all([
        app_1.prisma.property.findMany({
            where: { userId },
            include: {
                units: {
                    include: {
                        contracts: {
                            include: {
                                tenant: { select: { name: true } },
                                rentRecords: { where: { dueDate: { gte: startDate, lte: endDate } } },
                            },
                        },
                        expenses: { where: { date: { gte: startDate, lte: endDate } } },
                    },
                },
                expenses: { where: { date: { gte: startDate, lte: endDate } } },
            },
        }),
        app_1.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    ]);
    const STATUS_ZH = {
        PAID: '已收', PENDING: '待收', OVERDUE: '逾期', PARTIAL: '部分收款',
    };
    function paidAmount(record) {
        if (record.status === 'PAID')
            return record.paidAmount ? Number(record.paidAmount) : Number(record.amount);
        if (record.status === 'PARTIAL' && record.paidAmount)
            return Number(record.paidAmount);
        return 0;
    }
    const wb = XLSX.utils.book_new();
    // ── Sheet 1: 年度總覽 ─────────────────────────────────────────────
    let grandIncome = 0;
    let grandExpenses = 0;
    const s1 = [
        [`${year} 年度租賃所得申報參考表`],
        [`製表人：${user?.name ?? ''}`, '', `製表日期：${new Date().toLocaleDateString('zh-TW')}`],
        [],
        ['房產名稱', '地址', '車位數', '年租金收入', '實際費用', '淨所得（實際）', '淨所得（標準扣除43%）'],
    ];
    for (const p of properties) {
        let income = 0;
        let expenses = p.expenses.reduce((s, e) => s + Number(e.amount), 0);
        for (const u of p.units) {
            for (const c of u.contracts)
                for (const r of c.rentRecords)
                    income += paidAmount(r);
            expenses += u.expenses.reduce((s, e) => s + Number(e.amount), 0);
        }
        grandIncome += income;
        grandExpenses += expenses;
        s1.push([
            p.name, p.address, p.units.length,
            income, Math.round(expenses),
            Math.round(income - expenses),
            Math.round(income * 0.57),
        ]);
    }
    s1.push([], [
        '合計', '', '',
        grandIncome, Math.round(grandExpenses),
        Math.round(grandIncome - grandExpenses),
        Math.round(grandIncome * 0.57),
    ], [], [
        '說明：「淨所得（標準扣除43%）」= 租金收入 × 57%，依財政部規定採標準必要費用扣除額。',
    ], [
        '      「淨所得（實際）」需備有費用單據佐證，建議選擇對您較有利的方式申報。',
    ]);
    const ws1 = XLSX.utils.aoa_to_sheet(s1);
    ws1['!cols'] = [18, 26, 10, 14, 12, 16, 20].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws1, '年度總覽');
    // ── Sheet 2: 月份收支明細 ─────────────────────────────────────────
    const monthly = {};
    for (let m = 1; m <= 12; m++)
        monthly[m] = { income: 0, expenses: 0 };
    for (const p of properties) {
        for (const u of p.units)
            for (const c of u.contracts)
                for (const r of c.rentRecords) {
                    const m = new Date(r.dueDate).getMonth() + 1;
                    monthly[m].income += paidAmount(r);
                }
        for (const e of p.expenses)
            monthly[new Date(e.date).getMonth() + 1].expenses += Number(e.amount);
        for (const u of p.units)
            for (const e of u.expenses)
                monthly[new Date(e.date).getMonth() + 1].expenses += Number(e.amount);
    }
    const s2 = [[`${year} 年度月份收支明細`], [], ['月份', '租金收入', '費用支出', '淨收益']];
    for (let m = 1; m <= 12; m++) {
        const { income, expenses } = monthly[m];
        s2.push([`${m} 月`, Math.round(income), Math.round(expenses), Math.round(income - expenses)]);
    }
    s2.push([], [
        '全年合計',
        Math.round(Object.values(monthly).reduce((s, v) => s + v.income, 0)),
        Math.round(Object.values(monthly).reduce((s, v) => s + v.expenses, 0)),
        Math.round(Object.values(monthly).reduce((s, v) => s + v.income - v.expenses, 0)),
    ]);
    const ws2 = XLSX.utils.aoa_to_sheet(s2);
    ws2['!cols'] = [8, 14, 12, 12].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws2, '月份收支明細');
    // ── Sheet 3: 各車位明細 ───────────────────────────────────────────
    const s3 = [
        [`${year} 年度各車位租金明細`], [],
        ['房產', '地址', '車位', '車主', '月租金', '月份', '應收', '實收', '狀態'],
    ];
    for (const p of properties)
        for (const u of p.units)
            for (const c of u.contracts)
                for (const r of c.rentRecords) {
                    const m = new Date(r.dueDate).getMonth() + 1;
                    s3.push([
                        p.name, p.address, u.unitNumber,
                        c.tenant?.name ?? '—',
                        Number(u.monthlyRent),
                        `${m} 月`,
                        Number(r.amount),
                        paidAmount(r),
                        STATUS_ZH[r.status] ?? r.status,
                    ]);
                }
    const ws3 = XLSX.utils.aoa_to_sheet(s3);
    ws3['!cols'] = [14, 22, 8, 10, 10, 6, 10, 10, 10].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws3, '各車位明細');
    // ── Sheet 4: 公益出租人試算 ───────────────────────────────────────
    // 住宅法 §15：出租給租金補貼戶的公益出租人，每屋每月租金收入最高 NT$15,000 免納綜所稅，
    // 超過部分再按 43% 標準必要費用率減除。此表以「車位 × 月」實收計算免稅額供試算參考。
    const CHARITY_EXEMPT_PER_MONTH = 15000;
    const s4 = [
        [`${year} 年度公益出租人節稅試算（參考）`], [],
        ['房產', '車位', '年租金收入', '免稅額（每月上限1.5萬）', '應稅收入', '淨所得（43%費用扣除後）'],
    ];
    let charityIncome = 0;
    let charityExempt = 0;
    for (const p of properties) {
        for (const u of p.units) {
            // 以車位為單位，按月加總實收後套用每月免稅上限
            const byMonth = new Map();
            for (const c of u.contracts)
                for (const r of c.rentRecords) {
                    const key = `${r.year}-${r.month}`;
                    byMonth.set(key, (byMonth.get(key) ?? 0) + paidAmount(r));
                }
            if (byMonth.size === 0)
                continue;
            let income = 0;
            let exempt = 0;
            for (const v of byMonth.values()) {
                income += v;
                exempt += Math.min(v, CHARITY_EXEMPT_PER_MONTH);
            }
            if (income === 0)
                continue;
            charityIncome += income;
            charityExempt += exempt;
            const taxable = income - exempt;
            s4.push([p.name, u.unitNumber, income, exempt, taxable, Math.round(taxable * 0.57)]);
        }
    }
    const charityTaxable = charityIncome - charityExempt;
    s4.push([], [
        '合計', '', charityIncome, charityExempt, charityTaxable, Math.round(charityTaxable * 0.57),
    ], [], [
        '說明：公益出租人資格＝將住宅出租給「領有租金補貼」的房客（或透過社會住宅包租代管出租）。',
    ], [
        '      符合資格者每屋每月租金收入 NT$15,000 以下免納綜所稅（住宅法第15條），本表為試算參考。',
    ], [
        '      另享房屋稅適用自住稅率、地價稅適用自用住宅用地稅率優惠，請向地方稅稽徵機關申請。',
    ], [
        '      實際免稅範圍以「屋」為單位認定，分租情形請以稅捐機關認定為準。',
    ]);
    const ws4 = XLSX.utils.aoa_to_sheet(s4);
    ws4['!cols'] = [16, 10, 14, 22, 12, 22].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws4, '公益出租人試算');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''RentMate_${year}%E7%A7%9F%E8%B3%83%E6%89%80%E5%BE%97%E7%94%B3%E5%A0%B1%E8%A1%A8.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
}
