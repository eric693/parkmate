import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';
import { RentStatus, MaintenanceStatus } from '@prisma/client';

export async function getDashboard(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const properties = await prisma.property.findMany({ where: { userId } });
  const propertyIds = properties.map((p) => p.id);

  const allUnits = await prisma.unit.findMany({ where: { propertyId: { in: propertyIds } } });
  const unitIds = allUnits.map((u) => u.id);
  const totalUnits = allUnits.length;
  const occupiedUnits = allUnits.filter((u) => u.status === 'OCCUPIED').length;

  const contracts = await prisma.contract.findMany({
    where: { unitId: { in: unitIds }, status: 'ACTIVE' },
    include: { tenant: true, unit: true },
  });
  const contractIds = contracts.map((c) => c.id);

  const rentRecords = await prisma.rentRecord.findMany({
    where: { contractId: { in: contractIds }, year, month },
    include: { contract: { include: { tenant: true, unit: true } } },
  });

  const totalRent = rentRecords.reduce((sum, r) => sum + Number(r.amount), 0);
  const collectedRent = rentRecords
    .filter((r) => r.status === RentStatus.PAID || r.status === RentStatus.PARTIAL)
    .reduce((sum, r) => sum + Number(r.paidAmount ?? r.amount), 0);
  const paidCount = rentRecords.filter((r) => r.status === RentStatus.PAID).length;
  const pendingCount = rentRecords.filter((r) => r.status === RentStatus.PENDING).length;
  const overdueCount = rentRecords.filter((r) => r.status === RentStatus.OVERDUE).length;
  const overdueAmount = rentRecords
    .filter((r) => r.status === RentStatus.OVERDUE)
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const pendingMaintenance = await prisma.maintenanceRequest.count({
    where: { unitId: { in: unitIds }, status: { in: [MaintenanceStatus.PENDING, MaintenanceStatus.IN_PROGRESS] } },
  });

  const trendData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const records = await prisma.rentRecord.findMany({
      where: { contractId: { in: contractIds }, year: y, month: m },
    });
    const expected = records.reduce((sum, r) => sum + Number(r.amount), 0);
    const collected = records
      .filter((r) => r.status === RentStatus.PAID || r.status === RentStatus.PARTIAL)
      .reduce((sum, r) => sum + Number(r.paidAmount ?? r.amount), 0);
    trendData.push({ month: `${m}月`, expected, collected });
  }

  const expiringContracts = contracts.filter((c) => {
    const daysLeft = Math.ceil((c.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysLeft <= 30 && daysLeft > 0;
  }).map((c) => ({
    id: c.id,
    tenantName: c.tenant.name,
    unitNumber: c.unit.unitNumber,
    endDate: c.endDate,
    daysLeft: Math.ceil((c.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
  }));

  const overdueRecords = rentRecords
    .filter((r) => r.status === RentStatus.OVERDUE)
    .map((r) => ({
      id: r.id,
      tenantName: r.contract.tenant.name,
      unitNumber: r.contract.unit.unitNumber,
      amount: Number(r.amount),
      daysOverdue: Math.floor((now.getTime() - r.dueDate.getTime()) / (1000 * 60 * 60 * 24)),
    }));

  const totalTodos = overdueCount + pendingCount + pendingMaintenance + expiringContracts.length;

  const overdueTotal = rentRecords
    .filter((r) => r.status === RentStatus.OVERDUE)
    .reduce((s, r) => s + Number(r.amount), 0);

  // 營運摘要 (weekly operation summary)
  const summaryParts: string[] = [];
  if (overdueCount > 0) summaryParts.push(`${overdueCount} 筆逾期租金`);
  if (expiringContracts.length > 0) summaryParts.push(`${expiringContracts.length} 份即將到期合約`);
  if (pendingMaintenance > 0) summaryParts.push(`${pendingMaintenance} 筆待追蹤報修`);
  const operationSummary = summaryParts.length > 0
    ? `本週共 ${totalTodos} 項待處理，優先處理 ${summaryParts.join('、')}。`
    : '本週無待處理事項，一切運作正常。';

  const lineBinding = await prisma.lineBinding.findUnique({ where: { userId } });
  const autoNotifyEnabled = !!(lineBinding?.lineUserId && !lineBinding.lineUserId.startsWith('pending_'));

  res.json({
    rentSummary: {
      year,
      month,
      totalRent,
      collectedRent,
      collectionRate: totalRent > 0 ? Math.round((collectedRent / totalRent) * 100) : 0,
      paidCount,
      pendingCount,
      overdueCount,
      overdueAmount,
      overdueTotal,
    },
    occupancy: {
      total: totalUnits,
      occupied: occupiedUnits,
      rate: totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0,
    },
    pendingMaintenance,
    totalTodos,
    operationSummary,
    autoNotifyEnabled,
    trendData,
    expiringContracts,
    overdueRecords,
  });
}
