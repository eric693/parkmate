// 護城河功能展示用 demo 資料：租金行情、租客信用分（含跨房東）、水電分攤、點交相冊。
// 可重複執行（皆為 upsert / 固定 id）。執行：npm run db:seed:demo
import {
  PrismaClient, UnitStatus, ContractStatus, RentStatus, HandoverType, HandoverStatus, ExpenseCategory,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const now = new Date();

// 產生某合約近 N 個月的繳租紀錄。pattern 決定每月狀態。
type MonthPattern = { status: RentStatus; lateDays?: number };
async function makeHistory(contractId: string, rent: number, patterns: MonthPattern[]) {
  // patterns[0] 為最舊月份，最後一筆為本月
  const span = patterns.length;
  for (let i = 0; i < span; i++) {
    const offset = -(span - 1 - i); // 例如 8 筆 → -7..0
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const dueDate = new Date(year, month - 1, 5);
    const p = patterns[i];
    let paidDate: Date | null = null;
    let paidAmount: number | null = null;
    if (p.status === RentStatus.PAID) {
      paidDate = new Date(dueDate);
      paidDate.setDate(dueDate.getDate() + (p.lateDays ?? -1)); // 預設提前一天（準時）
      paidAmount = rent;
    } else if (p.status === RentStatus.PARTIAL) {
      paidDate = new Date(dueDate);
      paidDate.setDate(dueDate.getDate() + (p.lateDays ?? 3));
      paidAmount = Math.round(rent * 0.5);
    }
    await prisma.rentRecord.upsert({
      where: { contractId_year_month: { contractId, year, month } },
      update: { status: p.status, paidDate, paidAmount, amount: rent, dueDate },
      create: { contractId, year, month, dueDate, amount: rent, status: p.status, paidDate, paidAmount },
    });
  }
}

async function main() {
  const pw = await bcrypt.hash('password123', 10);
  const landlordA = await prisma.user.upsert({
    where: { email: 'landlord@example.com' },
    update: {},
    create: { email: 'landlord@example.com', password: pw, name: '王大明' },
  });

  // 為既有示範物業補上行政區（租金行情分群用）
  await prisma.property.updateMany({ where: { userId: landlordA.id, district: null }, data: { district: '台北市信義區' } });

  // ── 安和公寓：5 間套房，建立行情樣本 + 信用分歷史 ───────────────────
  const prop2 = await prisma.property.upsert({
    where: { id: 'demo_prop_anho' },
    update: { district: '台北市信義區' },
    create: {
      id: 'demo_prop_anho',
      userId: landlordA.id,
      name: '安和公寓',
      address: '台北市信義區安和路二段50號',
      district: '台北市信義區',
      description: '近捷運，5 間精緻套房',
    },
  });

  // 套房：rent / 坪數 → 行情與每坪資料
  const studios = [
    { no: 'A1', rent: 13500, ping: 6.5, idNumber: 'A123456789', payer: 'good' },   // 準時優良
    { no: 'A2', rent: 12800, ping: 6.0, idNumber: 'B223456780', payer: 'late' },    // 經常遲繳
    { no: 'A3', rent: 15000, ping: 7.5, idNumber: 'C323456781', payer: 'overdue' }, // 有逾期
    { no: 'A4', rent: 14200, ping: 7.0, idNumber: 'D423456782', payer: 'good' },
    { no: 'A5', rent: 16000, ping: 8.0, idNumber: 'E523456783', payer: 'partial' }, // 偶有部分繳
  ] as const;

  const patternFor: Record<string, MonthPattern[]> = {
    good: Array(8).fill({ status: RentStatus.PAID }),
    late: Array(8).fill(0).map((_, i) => ({ status: RentStatus.PAID, lateDays: i % 2 === 0 ? 6 : 9 })),
    overdue: [
      ...Array(5).fill({ status: RentStatus.PAID }),
      { status: RentStatus.OVERDUE }, { status: RentStatus.OVERDUE }, { status: RentStatus.PENDING },
    ],
    partial: [
      ...Array(4).fill({ status: RentStatus.PAID }),
      { status: RentStatus.PARTIAL }, { status: RentStatus.PAID, lateDays: 4 },
      { status: RentStatus.PARTIAL }, { status: RentStatus.PENDING },
    ],
  };

  for (let i = 0; i < studios.length; i++) {
    const s = studios[i];
    const unit = await prisma.unit.upsert({
      where: { id: `demo_unit_${s.no}` },
      update: { areaPing: s.ping, type: '套房', monthlyRent: s.rent },
      create: {
        id: `demo_unit_${s.no}`,
        propertyId: prop2.id,
        unitNumber: s.no,
        floor: i + 1,
        type: '套房',
        monthlyRent: s.rent,
        areaPing: s.ping,
        occupants: 1,
        status: UnitStatus.OCCUPIED,
      },
    });
    const tenant = await prisma.tenant.upsert({
      where: { id: `demo_tenant_${s.no}` },
      update: { idNumber: s.idNumber },
      create: {
        id: `demo_tenant_${s.no}`,
        userId: landlordA.id,
        name: `安和租客${s.no}`,
        phone: `09001000${i}${i}`,
        idNumber: s.idNumber,
      },
    });
    const contract = await prisma.contract.upsert({
      where: { id: `demo_contract_${s.no}` },
      update: {},
      create: {
        id: `demo_contract_${s.no}`,
        unitId: unit.id,
        tenantId: tenant.id,
        startDate: new Date(now.getFullYear() - 1, now.getMonth(), 1),
        endDate: new Date(now.getFullYear() + 1, now.getMonth(), 1),
        monthlyRent: s.rent,
        depositAmount: s.rent * 2,
        depositPaid: true,
        rentDueDay: 5,
        status: ContractStatus.ACTIVE,
      },
    });
    await makeHistory(contract.id, s.rent, patternFor[s.payer]);
  }

  // ── 跨房東信用：第二位房東，租客身分證與安和A1相同 → crossLandlord ──
  const landlordB = await prisma.user.upsert({
    where: { email: 'landlord2@example.com' },
    update: {},
    create: { email: 'landlord2@example.com', password: pw, name: '陳房東' },
  });
  const propB = await prisma.property.upsert({
    where: { id: 'demo_prop_B' },
    update: { district: '台北市大安區' },
    create: { id: 'demo_prop_B', userId: landlordB.id, name: '敦南雅舍', address: '台北市大安區敦化南路100號', district: '台北市大安區' },
  });
  const unitB = await prisma.unit.upsert({
    where: { id: 'demo_unit_B1' },
    update: { areaPing: 9, type: '一房一廳', monthlyRent: 18000 },
    create: { id: 'demo_unit_B1', propertyId: propB.id, unitNumber: 'B1', type: '一房一廳', monthlyRent: 18000, areaPing: 9, status: UnitStatus.OCCUPIED },
  });
  // 同一人（A123456789），先前在王大明處承租，後到陳房東處 → 兩筆 Tenant 同 idNumber
  const tenantBCross = await prisma.tenant.upsert({
    where: { id: 'demo_tenant_cross' },
    update: { idNumber: 'A123456789' },
    create: { id: 'demo_tenant_cross', userId: landlordB.id, name: '林先生', phone: '0900999888', idNumber: 'A123456789' },
  });
  const contractB = await prisma.contract.upsert({
    where: { id: 'demo_contract_B1' },
    update: {},
    create: {
      id: 'demo_contract_B1', unitId: unitB.id, tenantId: tenantBCross.id,
      startDate: new Date(now.getFullYear() - 1, now.getMonth() - 6, 1),
      endDate: new Date(now.getFullYear() + 1, now.getMonth(), 1),
      monthlyRent: 18000, depositAmount: 36000, depositPaid: true, rentDueDay: 5, status: ContractStatus.ACTIVE,
    },
  });
  await makeHistory(contractB.id, 18000, Array(6).fill({ status: RentStatus.PAID }));

  // 再給大安區補幾筆一房一廳，使行情有樣本
  for (const extra of [{ no: 'B2', rent: 17500 }, { no: 'B3', rent: 19000 }]) {
    await prisma.unit.upsert({
      where: { id: `demo_unit_${extra.no}` },
      update: { type: '一房一廳', monthlyRent: extra.rent, areaPing: 9 },
      create: { id: `demo_unit_${extra.no}`, propertyId: propB.id, unitNumber: extra.no, type: '一房一廳', monthlyRent: extra.rent, areaPing: 9, status: UnitStatus.OCCUPIED },
    });
    const t = await prisma.tenant.upsert({
      where: { id: `demo_tenant_${extra.no}` },
      update: {},
      create: { id: `demo_tenant_${extra.no}`, userId: landlordB.id, name: `大安租客${extra.no}`, phone: `0900888${extra.no}` },
    });
    await prisma.contract.upsert({
      where: { id: `demo_contract_${extra.no}` },
      update: {},
      create: {
        id: `demo_contract_${extra.no}`, unitId: `demo_unit_${extra.no}`, tenantId: t.id,
        startDate: new Date(now.getFullYear() - 1, now.getMonth(), 1), endDate: new Date(now.getFullYear() + 1, now.getMonth(), 1),
        monthlyRent: extra.rent, depositAmount: extra.rent * 2, depositPaid: true, rentDueDay: 5, status: ContractStatus.ACTIVE,
      },
    });
  }

  // ── 水電分攤：安和公寓一張電費，平均分攤給 5 間 ─────────────────────
  const existingBill = await prisma.utilityBill.findFirst({ where: { propertyId: prop2.id, note: 'DEMO' } });
  if (!existingBill) {
    const total = 9000;
    const each = Math.round((total / studios.length) * 100) / 100;
    await prisma.utilityBill.create({
      data: {
        propertyId: prop2.id,
        category: ExpenseCategory.ELECTRICITY,
        periodStart: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        periodEnd: new Date(now.getFullYear(), now.getMonth(), 0),
        totalAmount: total,
        method: 'EVEN',
        note: 'DEMO',
        allocations: { create: studios.map((s) => ({ unitId: `demo_unit_${s.no}`, amount: each })) },
      },
    });
  }

  // ── 點交相冊：安和 A1 一筆已確認的入住點交 ─────────────────────────
  await prisma.handover.upsert({
    where: { id: 'demo_handover_A1' },
    update: {},
    create: {
      id: 'demo_handover_A1',
      contractId: 'demo_contract_A1',
      type: HandoverType.MOVE_IN,
      status: HandoverStatus.CONFIRMED,
      tenantSignedAt: new Date(now.getFullYear() - 1, now.getMonth(), 2),
      signerName: '安和租客A1',
      meterReadings: { electricity: '12345', water: '678', gas: '90' },
      items: [
        { id: 'i1', area: '客廳', description: '牆面、地板無損', condition: 'GOOD', photos: [] },
        { id: 'i2', area: '衛浴', description: '馬桶、洗手台正常', condition: 'GOOD', photos: [] },
        { id: 'i3', area: '冷氣', description: '左下角輕微刮痕', condition: 'WORN', photos: [] },
      ],
      note: '入住點交，雙方確認。',
    },
  });

  console.log('Demo seed 完成：');
  console.log('  房東A：landlord@example.com / password123（安和公寓 5 套房）');
  console.log('  房東B：landlord2@example.com / password123（敦南雅舍，含跨房東租客）');
  console.log('  行情：信義區套房、大安區一房一廳已有樣本');
  console.log('  信用分：安和A1 優良 / A2 遲繳 / A3 逾期 / A5 部分繳；林先生為跨房東');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
