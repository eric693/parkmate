// 登入頁公開示範帳號的停車場資料（帳密取自 .env 的 DEMO_ACCOUNT / DEMO_PASSWORD）。
// 可重複執行（皆為 upsert / 固定 id）。執行：npm run db:seed:parking
import 'dotenv/config';
import {
  PrismaClient, UnitStatus, ContractStatus, RentStatus, VehicleType, ExpenseCategory,
  MaintenancePriority, MaintenanceStatus, SpotType,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const now = new Date();
const monthStart = (offset: number) => new Date(now.getFullYear(), now.getMonth() + offset, 1);

type Pay = 'good' | 'late' | 'overdue' | 'new';

// 近 6 個月繳費紀錄；new = 本月才起租，只有本月一筆
async function makeHistory(contractId: string, rent: number, pay: Pay) {
  const months = pay === 'new' ? [0] : [-5, -4, -3, -2, -1, 0];
  for (const offset of months) {
    const d = monthStart(offset);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const dueDate = new Date(year, month - 1, 5);
    const isCurrent = offset === 0;
    let status: RentStatus = RentStatus.PAID;
    let lateDays = -1;
    if (pay === 'late') lateDays = offset % 2 === 0 ? 6 : 3;
    if (pay === 'overdue' && offset >= -1) status = RentStatus.OVERDUE;
    if (isCurrent && now < dueDate) status = RentStatus.PENDING;
    if (isCurrent && pay === 'late') status = RentStatus.PENDING;

    let paidDate: Date | null = null;
    if (status === RentStatus.PAID) {
      paidDate = new Date(dueDate);
      paidDate.setDate(dueDate.getDate() + lateDays);
      if (paidDate > now) paidDate = new Date(now);
    }
    const data = {
      dueDate, amount: rent, status, paidDate,
      paidAmount: status === RentStatus.PAID ? rent : null,
      paymentMethod: status === RentStatus.PAID ? (offset % 2 ? '轉帳' : '現金') : null,
    };
    await prisma.rentRecord.upsert({
      where: { contractId_year_month: { contractId, year, month } },
      update: data,
      create: { contractId, year, month, ...data },
    });
  }
}

async function main() {
  const account = (process.env.DEMO_ACCOUNT ?? '').trim().toLowerCase();
  const password = process.env.DEMO_PASSWORD ?? '';
  if (!account || !password) throw new Error('請先在 .env 設定 DEMO_ACCOUNT 與 DEMO_PASSWORD');

  const pw = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email: account },
    update: { password: pw, active: true },
    create: { email: account, password: pw, name: '示範業者' },
  });

  const lots = [
    { id: 'pk_lot_xinyi', name: '信義松仁停車場', address: '台北市信義區松仁路88號 B1-B2', district: '台北市信義區', description: '地下室平面＋機械車位，24 小時遙控鐵捲門' },
    { id: 'pk_lot_banqiao', name: '板橋府中停車場', address: '新北市板橋區府中路32號', district: '新北市板橋區', description: '戶外平面車位與機車位，近捷運府中站' },
  ];
  for (const l of lots) {
    await prisma.property.upsert({
      where: { id: l.id },
      update: { name: l.name, address: l.address, district: l.district, description: l.description },
      create: { ...l, userId: user.id },
    });
  }

  // 車位：no, 所屬停車場, 樓層, 類型, 月租, 租用者（null = 空位）
  type Space = {
    no: string; lot: string; floor: number | null; type: string; rent: number; tenant?: string;
    kind?: VehicleType; spot?: SpotType; maxH?: number; charger?: boolean; daily?: number; weekly?: number;
  };
  const spaces: Space[] = [
    { no: 'B1-01', lot: 'pk_lot_xinyi', floor: -1, type: '平面', rent: 6500, tenant: 't1', kind: VehicleType.CAR, spot: SpotType.FLAT, charger: true },
    { no: 'B1-02', lot: 'pk_lot_xinyi', floor: -1, type: '平面', rent: 6500, tenant: 't2', kind: VehicleType.CAR, spot: SpotType.FLAT },
    { no: 'B1-03', lot: 'pk_lot_xinyi', floor: -1, type: '平面', rent: 6500, tenant: 't3', kind: VehicleType.CAR, spot: SpotType.FLAT },
    { no: 'B1-04', lot: 'pk_lot_xinyi', floor: -1, type: '平面', rent: 6500, kind: VehicleType.CAR, spot: SpotType.FLAT, charger: true, daily: 350, weekly: 1800 },
    { no: 'B2-11', lot: 'pk_lot_xinyi', floor: -2, type: '機械', rent: 4800, tenant: 't4', kind: VehicleType.CAR, spot: SpotType.MECHANICAL_UPPER, maxH: 155 },
    { no: 'B2-12', lot: 'pk_lot_xinyi', floor: -2, type: '機械', rent: 4800, tenant: 't5', kind: VehicleType.CAR, spot: SpotType.MECHANICAL_LOWER, maxH: 180 },
    { no: 'B2-13', lot: 'pk_lot_xinyi', floor: -2, type: '機械', rent: 4800, kind: VehicleType.CAR, spot: SpotType.MECHANICAL_UPPER, maxH: 155, daily: 250, weekly: 1300 },
    { no: 'A-01', lot: 'pk_lot_banqiao', floor: 1, type: '平面', rent: 3800, tenant: 't6', kind: VehicleType.CAR, spot: SpotType.FLAT },
    { no: 'A-02', lot: 'pk_lot_banqiao', floor: 1, type: '平面', rent: 3800, tenant: 't7', kind: VehicleType.CAR, spot: SpotType.FLAT },
    { no: 'A-03', lot: 'pk_lot_banqiao', floor: 1, type: '平面', rent: 3800, kind: VehicleType.CAR, spot: SpotType.FLAT, daily: 200, weekly: 1000 },
    { no: 'M-01', lot: 'pk_lot_banqiao', floor: 1, type: '機車位', rent: 600, tenant: 't8', kind: VehicleType.MOTORCYCLE, spot: SpotType.FLAT },
    { no: 'M-02', lot: 'pk_lot_banqiao', floor: 1, type: '機車位', rent: 600, tenant: 't9', kind: VehicleType.MOTORCYCLE, spot: SpotType.FLAT },
    { no: 'M-03', lot: 'pk_lot_banqiao', floor: 1, type: '機車位', rent: 600, kind: VehicleType.MOTORCYCLE, spot: SpotType.FLAT, daily: 50 },
  ];

  // 車主與車輛
  const tenants: Record<string, { name: string; phone: string; plate: string; vt: VehicleType; brand: string; color: string; pay: Pay; card: string }> = {
    t1: { name: '林志明', phone: '0912-345-101', plate: 'ABC-1234', vt: VehicleType.CAR, brand: 'Toyota RAV4', color: '白', pay: 'good', card: 'R-0101' },
    t2: { name: '陳怡君', phone: '0912-345-102', plate: 'BKD-5678', vt: VehicleType.CAR, brand: 'Honda CR-V', color: '灰', pay: 'late', card: 'R-0102' },
    t3: { name: '王建宏', phone: '0912-345-103', plate: 'RAA-8899', vt: VehicleType.CAR, brand: 'Tesla Model 3', color: '黑', pay: 'overdue', card: 'R-0103' },
    t4: { name: '張雅婷', phone: '0912-345-104', plate: 'AQW-2468', vt: VehicleType.CAR, brand: 'Mazda 3', color: '紅', pay: 'good', card: 'R-0211' },
    t5: { name: '黃國華', phone: '0912-345-105', plate: 'BGH-1357', vt: VehicleType.CAR, brand: 'Ford Focus', color: '藍', pay: 'new', card: 'R-0212' },
    t6: { name: '吳淑芬', phone: '0912-345-106', plate: 'AZX-3321', vt: VehicleType.CAR, brand: 'Nissan Kicks', color: '白', pay: 'good', card: 'C-A01' },
    t7: { name: '劉家豪', phone: '0912-345-107', plate: 'RBC-7788', vt: VehicleType.CAR, brand: 'Lexus NX', color: '銀', pay: 'late', card: 'C-A02' },
    t8: { name: '蔡宜蓁', phone: '0912-345-108', plate: 'MKT-265', vt: VehicleType.MOTORCYCLE, brand: 'Gogoro', color: '白', pay: 'good', card: 'C-M01' },
    t9: { name: '許文傑', phone: '0912-345-109', plate: 'NBA-803', vt: VehicleType.MOTORCYCLE, brand: 'SYM JET', color: '黑', pay: 'overdue', card: 'C-M02' },
  };

  for (const s of spaces) {
    const unitId = `pk_unit_${s.no}`;
    const spec = {
      vehicleKind: s.kind ?? null, spotType: s.spot ?? null, maxHeightCm: s.maxH ?? null,
      hasCharger: s.charger ?? false, dailyRate: s.daily ?? null, weeklyRate: s.weekly ?? null,
    };
    await prisma.unit.upsert({
      where: { id: unitId },
      update: { monthlyRent: s.rent, type: s.type, floor: s.floor, status: s.tenant ? UnitStatus.OCCUPIED : UnitStatus.VACANT, ...spec },
      create: {
        id: unitId, propertyId: s.lot, unitNumber: s.no, floor: s.floor, type: s.type, monthlyRent: s.rent,
        status: s.tenant ? UnitStatus.OCCUPIED : UnitStatus.VACANT, ...spec,
      },
    });
    if (!s.tenant) continue;

    const t = tenants[s.tenant];
    const tenantId = `pk_tenant_${s.tenant}`;
    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: { name: t.name, phone: t.phone },
      create: { id: tenantId, userId: user.id, name: t.name, phone: t.phone },
    });
    const vehicleId = `pk_vehicle_${s.tenant}`;
    await prisma.vehicle.upsert({
      where: { id: vehicleId },
      update: { plateNumber: t.plate, type: t.vt, brand: t.brand, color: t.color },
      create: { id: vehicleId, tenantId, plateNumber: t.plate, type: t.vt, brand: t.brand, color: t.color },
    });

    const start = t.pay === 'new' ? monthStart(0) : monthStart(-5);
    const end = new Date(start.getFullYear() + 1, start.getMonth(), 0);
    const contractId = `pk_contract_${s.tenant}`;
    const isMoto = t.vt === VehicleType.MOTORCYCLE;
    await prisma.contract.upsert({
      where: { id: contractId },
      update: { status: ContractStatus.ACTIVE, startDate: start, endDate: end, monthlyRent: s.rent },
      create: {
        id: contractId, unitId, tenantId, vehicleId,
        startDate: start, endDate: end, monthlyRent: s.rent,
        depositAmount: s.rent, depositPaid: true, rentDueDay: 5, status: ContractStatus.ACTIVE,
        accessCard: t.card, accessCardDeposit: isMoto ? 300 : 1000,
      },
    });
    await makeHistory(contractId, s.rent, t.pay);
  }

  // 候補名單：信義的平面車位很搶手
  const waitlist = [
    { id: 'pk_wait_1', name: '鄭先生', phone: '0933-222-111', propertyId: 'pk_lot_xinyi', vehicleKind: VehicleType.CAR, spotType: SpotType.FLAT, needCharger: true, notes: '電動車，想要有充電樁的平面位' },
    { id: 'pk_wait_2', name: '周小姐', phone: '0933-222-112', propertyId: null, vehicleKind: VehicleType.CAR, spotType: null, vehicleHeightCm: 170, notes: '休旅車，機械位要注意限高' },
    { id: 'pk_wait_3', name: '何同學', phone: '0933-222-113', propertyId: 'pk_lot_banqiao', vehicleKind: VehicleType.MOTORCYCLE, spotType: null, notes: '' },
  ];
  for (const [i, w] of waitlist.entries()) {
    const data = {
      userId: user.id, name: w.name, phone: w.phone, propertyId: w.propertyId, vehicleKind: w.vehicleKind,
      spotType: w.spotType, needCharger: w.needCharger ?? false, vehicleHeightCm: w.vehicleHeightCm ?? null,
      notes: w.notes || null, createdAt: new Date(now.getTime() - (30 - i) * 86400000),
    };
    await prisma.waitlistEntry.upsert({ where: { id: w.id }, update: data, create: { id: w.id, ...data } });
  }

  // 報修
  const repairs = [
    { id: 'pk_mr_1', unit: 'pk_unit_B2-12', title: '機械車位升降異音', description: 'B2-12 升降時有金屬摩擦聲，車主反映不敢停。', priority: MaintenancePriority.HIGH, status: MaintenanceStatus.IN_PROGRESS },
    { id: 'pk_mr_2', unit: 'pk_unit_B1-02', title: '車位地面標線模糊', description: 'B1-02 標線磨損，隔壁車常壓線。', priority: MaintenancePriority.LOW, status: MaintenanceStatus.PENDING },
    { id: 'pk_mr_3', unit: 'pk_unit_A-01', title: '出入口感應器失靈', description: '府中停車場入口柵欄偶爾不感應卡片。', priority: MaintenancePriority.MEDIUM, status: MaintenanceStatus.COMPLETED, cost: 3200 },
  ];
  for (const r of repairs) {
    const data = {
      unitId: r.unit, title: r.title, description: r.description, priority: r.priority, status: r.status,
      cost: r.cost ?? null, category: '設備', resolvedAt: r.status === MaintenanceStatus.COMPLETED ? monthStart(-1) : null,
    };
    await prisma.maintenanceRequest.upsert({ where: { id: r.id }, update: data, create: { id: r.id, ...data } });
  }

  // 支出
  const expenses = [
    { id: 'pk_exp_1', propertyId: 'pk_lot_xinyi', category: ExpenseCategory.ELECTRICITY, amount: 8600, offset: -1, description: '地下室照明與抽風電費' },
    { id: 'pk_exp_2', propertyId: 'pk_lot_xinyi', category: ExpenseCategory.REPAIR, amount: 12000, offset: -2, description: '機械車位年度保養' },
    { id: 'pk_exp_3', propertyId: 'pk_lot_xinyi', category: ExpenseCategory.INSURANCE, amount: 15000, offset: -3, description: '公共意外責任險' },
    { id: 'pk_exp_4', propertyId: 'pk_lot_banqiao', category: ExpenseCategory.MANAGEMENT, amount: 2500, offset: -1, description: '場地清潔' },
    { id: 'pk_exp_5', propertyId: 'pk_lot_banqiao', category: ExpenseCategory.REPAIR, amount: 3200, offset: -1, description: '入口感應器更換' },
  ];
  for (const e of expenses) {
    const d = monthStart(e.offset);
    d.setDate(15);
    const data = { propertyId: e.propertyId, category: e.category, amount: e.amount, date: d, description: e.description, confirmedAt: d };
    await prisma.expense.upsert({ where: { id: e.id }, update: data, create: { id: e.id, ...data } });
  }

  console.log(`停車場示範資料完成：${account} / ${password}（2 座停車場、${spaces.length} 個車位）`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
