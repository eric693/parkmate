import { PrismaClient, UnitStatus, ContractStatus, RentStatus, MaintenancePriority, MaintenanceStatus, ExpenseCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  const user = await prisma.user.upsert({
    where: { email: 'landlord@example.com' },
    update: {},
    create: {
      email: 'landlord@example.com',
      password: passwordHash,
      name: '王大明',
    },
  });

  const property = await prisma.property.upsert({
    where: { id: 'prop_demo' },
    update: {},
    create: {
      id: 'prop_demo',
      userId: user.id,
      name: '民生大樓',
      address: '台北市信義區民生路123號',
      description: '7層樓公寓，共7間套房',
    },
  });

  const units = [
    { unitNumber: '1A', floor: 1, type: '套房', monthlyRent: 8000 },
    { unitNumber: '1B', floor: 1, type: '套房', monthlyRent: 7500 },
    { unitNumber: '2A', floor: 2, type: '一房一廳', monthlyRent: 11000 },
    { unitNumber: '2B', floor: 2, type: '套房', monthlyRent: 5500 },
    { unitNumber: '3A', floor: 3, type: '套房', monthlyRent: 4100 },
    { unitNumber: '3D', floor: 3, type: '套房', monthlyRent: 4583 },
    { unitNumber: '4B', floor: 4, type: '兩房', monthlyRent: 8000 },
  ];

  const createdUnits: Record<string, string> = {};
  for (const u of units) {
    const unit = await prisma.unit.upsert({
      where: { id: `unit_${u.unitNumber}` },
      update: {},
      create: {
        id: `unit_${u.unitNumber}`,
        propertyId: property.id,
        unitNumber: u.unitNumber,
        floor: u.floor,
        type: u.type,
        monthlyRent: u.monthlyRent,
        status: UnitStatus.VACANT,
      },
    });
    createdUnits[u.unitNumber] = unit.id;
  }

  const tenants = [
    { name: '焦滿', phone: '0912345601', email: 'jm@example.com' },
    { name: '小名', phone: '0912345602', email: 'xm@example.com' },
    { name: '阿兩', phone: '0912345603', email: 'al@example.com' },
    { name: '小芝', phone: '0912345604', email: 'xz@example.com' },
    { name: '張哥', phone: '0912345605', email: 'zg@example.com' },
    { name: '王維', phone: '0912345606', email: 'ww@example.com' },
  ];

  const createdTenants: string[] = [];
  for (const t of tenants) {
    const tenant = await prisma.tenant.upsert({
      where: { id: `tenant_${t.name}` },
      update: {},
      create: {
        id: `tenant_${t.name}`,
        userId: user.id,
        name: t.name,
        phone: t.phone,
        email: t.email,
      },
    });
    createdTenants.push(tenant.id);
  }

  const now = new Date();
  const contracts = [
    { unitId: createdUnits['3A'], tenantId: createdTenants[0], rent: 4100, end: new Date('2026-04-29') },
    { unitId: createdUnits['3D'], tenantId: createdTenants[5], rent: 4583, end: new Date('2026-09-30') },
    { unitId: createdUnits['2B'], tenantId: createdTenants[2], rent: 5500, end: new Date('2026-12-31') },
    { unitId: createdUnits['4B'], tenantId: createdTenants[3], rent: 8000, end: new Date('2027-01-31') },
  ];

  for (let i = 0; i < contracts.length; i++) {
    const c = contracts[i];
    const contract = await prisma.contract.upsert({
      where: { id: `contract_${i}` },
      update: {},
      create: {
        id: `contract_${i}`,
        unitId: c.unitId,
        tenantId: c.tenantId,
        startDate: new Date('2025-05-01'),
        endDate: c.end,
        monthlyRent: c.rent,
        depositAmount: c.rent * 2,
        depositPaid: true,
        rentDueDay: 5,
        status: ContractStatus.ACTIVE,
      },
    });

    await prisma.unit.update({ where: { id: c.unitId }, data: { status: UnitStatus.OCCUPIED } });

    const rentRecord = await prisma.rentRecord.upsert({
      where: { contractId_year_month: { contractId: contract.id, year: now.getFullYear(), month: now.getMonth() + 1 } },
      update: {},
      create: {
        contractId: contract.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        dueDate: new Date(now.getFullYear(), now.getMonth(), 5),
        amount: c.rent,
        status: i === 0 ? RentStatus.OVERDUE : RentStatus.PENDING,
      },
    });
  }

  const [maintenanceUnit1, maintenanceUnit2, maintenanceUnit3] = [
    createdUnits['4B'], createdUnits['4B'], createdUnits['4B']
  ];

  await prisma.maintenanceRequest.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'maint_1',
        unitId: maintenanceUnit1,
        tenantId: createdTenants[3],
        title: '水龍頭漏水',
        description: '廚房水龍頭持續漏水，需要更換墊片',
        priority: MaintenancePriority.HIGH,
        status: MaintenanceStatus.PENDING,
      },
      {
        id: 'maint_2',
        unitId: maintenanceUnit2,
        tenantId: createdTenants[2],
        title: '冷氣故障',
        description: '冷氣不製冷，需要請技師檢查',
        priority: MaintenancePriority.MEDIUM,
        status: MaintenanceStatus.IN_PROGRESS,
      },
      {
        id: 'maint_3',
        unitId: maintenanceUnit3,
        tenantId: createdTenants[5],
        title: '門鎖故障',
        description: '房門鑰匙轉動困難，需要更換門鎖',
        priority: MaintenancePriority.MEDIUM,
        status: MaintenanceStatus.PENDING,
      },
    ],
  });

  const months = [-4, -3, -2, -1, 0];
  for (const offset of months) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 15);
    await prisma.expense.create({
      data: {
        propertyId: property.id,
        category: ExpenseCategory.WATER,
        amount: Math.floor(Math.random() * 2000 + 1000),
        date: d,
        description: '水費',
      },
    });
    await prisma.expense.create({
      data: {
        propertyId: property.id,
        category: ExpenseCategory.ELECTRICITY,
        amount: Math.floor(Math.random() * 5000 + 3000),
        date: d,
        description: '電費',
      },
    });
  }

  console.log('Seed completed. Login: landlord@example.com / password123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
