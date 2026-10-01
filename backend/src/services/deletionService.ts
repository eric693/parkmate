// 連帶刪除：資料庫的外鍵多為 RESTRICT，直接刪上層（停車場、車位、車主、合約）會被擋下。
// 這裡依相依順序由下往上刪，全部包在同一個交易裡，要嘛全刪、要嘛都不動。
import { Prisma } from '@prisma/client';
import { prisma } from '../app';

type Tx = Prisma.TransactionClient;

/** 刪合約：租金單、提醒紀錄、押金退還；已入帳的金流改回未對帳（錢不跟著消失） */
async function deleteContracts(tx: Tx, contractIds: string[], opts: { dropPayments?: boolean } = {}) {
  if (contractIds.length === 0) return;
  const recordIds = (await tx.rentRecord.findMany({ where: { contractId: { in: contractIds } }, select: { id: true } })).map((r) => r.id);
  await tx.reminderLog.deleteMany({ where: { rentRecordId: { in: recordIds } } });
  if (opts.dropPayments) {
    await tx.payment.deleteMany({ where: { OR: [{ contractId: { in: contractIds } }, { rentRecordId: { in: recordIds } }] } });
  } else {
    await tx.payment.updateMany({
      where: { OR: [{ contractId: { in: contractIds } }, { rentRecordId: { in: recordIds } }] },
      data: { contractId: null, rentRecordId: null, virtualAccountId: null, status: 'UNMATCHED', reconciledAt: null },
    });
  }
  await tx.rentRecord.deleteMany({ where: { contractId: { in: contractIds } } });
  await tx.depositDeduction.deleteMany({ where: { depositRefund: { contractId: { in: contractIds } } } });
  await tx.depositRefund.deleteMany({ where: { contractId: { in: contractIds } } });
  await tx.contract.deleteMany({ where: { id: { in: contractIds } } }); // 點交、虛擬帳號 onDelete: Cascade
}

/** 刪車位：合約、報修、該房的支出與水電分攤、刊登、預付電表紀錄 */
async function deleteUnits(tx: Tx, unitIds: string[], opts: { dropPayments?: boolean } = {}) {
  if (unitIds.length === 0) return;
  const contractIds = (await tx.contract.findMany({ where: { unitId: { in: unitIds } }, select: { id: true } })).map((c) => c.id);
  await deleteContracts(tx, contractIds, opts);
  await tx.maintenanceRequest.deleteMany({ where: { unitId: { in: unitIds } } });
  await tx.expense.deleteMany({ where: { unitId: { in: unitIds } } });

  // 水電分攤：刪掉這些房的分攤後，重算總單金額；沒剩任何分攤的總單一起刪
  const billIds = [...new Set((await tx.utilityAllocation.findMany({ where: { unitId: { in: unitIds } }, select: { utilityBillId: true } })).map((a) => a.utilityBillId))];
  await tx.utilityAllocation.deleteMany({ where: { unitId: { in: unitIds } } });
  for (const billId of billIds) {
    const rest = await tx.utilityAllocation.findMany({ where: { utilityBillId: billId } });
    if (rest.length === 0) await tx.utilityBill.delete({ where: { id: billId } });
    else await tx.utilityBill.update({ where: { id: billId }, data: { totalAmount: rest.reduce((s, a) => s + Number(a.amount), 0) } });
  }

  await tx.unit.deleteMany({ where: { id: { in: unitIds } } }); // 刊登、預付電表紀錄 onDelete: Cascade
}

async function deleteProperties(tx: Tx, propertyIds: string[], opts: { dropPayments?: boolean } = {}) {
  if (propertyIds.length === 0) return;
  const unitIds = (await tx.unit.findMany({ where: { propertyId: { in: propertyIds } }, select: { id: true } })).map((u) => u.id);
  await deleteUnits(tx, unitIds, opts);
  await tx.expense.deleteMany({ where: { propertyId: { in: propertyIds } } });
  await tx.utilityBill.deleteMany({ where: { propertyId: { in: propertyIds } } });
  await tx.property.deleteMany({ where: { id: { in: propertyIds } } });
}

/** 刪車主：連同他的合約（含租金單），報修單保留但不再掛這位車主 */
async function deleteTenants(tx: Tx, tenantIds: string[], opts: { dropPayments?: boolean } = {}) {
  if (tenantIds.length === 0) return;
  const contracts = await tx.contract.findMany({ where: { tenantId: { in: tenantIds } }, select: { id: true, unitId: true } });
  await deleteContracts(tx, contracts.map((c) => c.id), opts);
  await refreshUnitStatus(tx, contracts.map((c) => c.unitId));
  await tx.maintenanceRequest.updateMany({ where: { tenantId: { in: tenantIds } }, data: { tenantId: null } });
  await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } }); // 信用分快照 onDelete: Cascade
}

/** 合約刪掉後，沒有生效合約的車位改回空位 */
async function refreshUnitStatus(tx: Tx, unitIds: string[]) {
  for (const unitId of new Set(unitIds)) {
    const active = await tx.contract.count({ where: { unitId, status: 'ACTIVE' } });
    if (active === 0) await tx.unit.updateMany({ where: { id: unitId }, data: { status: 'VACANT' } });
  }
}

const TX_OPTS = { timeout: 60_000 };

export const removeContract = (id: string) =>
  prisma.$transaction(async (tx) => {
    const c = await tx.contract.findUniqueOrThrow({ where: { id }, select: { unitId: true } });
    await deleteContracts(tx, [id]);
    await refreshUnitStatus(tx, [c.unitId]);
  }, TX_OPTS);

export const removeUnit = (id: string) => prisma.$transaction((tx) => deleteUnits(tx, [id]), TX_OPTS);
export const removeProperty = (id: string) => prisma.$transaction((tx) => deleteProperties(tx, [id]), TX_OPTS);
export const removeTenant = (id: string) => prisma.$transaction((tx) => deleteTenants(tx, [id]), TX_OPTS);

/** 某業者名下各類資料筆數（清空前給使用者確認用） */
export async function countUserData(userId: string) {
  const [properties, units, tenants, contracts, rentRecords, expenses, maintenance] = await Promise.all([
    prisma.property.count({ where: { userId } }),
    prisma.unit.count({ where: { property: { userId } } }),
    prisma.tenant.count({ where: { userId } }),
    prisma.contract.count({ where: { unit: { property: { userId } } } }),
    prisma.rentRecord.count({ where: { contract: { unit: { property: { userId } } } } }),
    prisma.expense.count({ where: { OR: [{ property: { userId } }, { unit: { property: { userId } } }] } }),
    prisma.maintenanceRequest.count({ where: { unit: { property: { userId } } } }),
  ]);
  return { properties, units, tenants, contracts, rentRecords, expenses, maintenance };
}

/**
 * 清空某業者的所有營運資料（停車場、車位、車主、合約、帳務、報修…），
 * 保留帳號、員工帳號、LINE 綁定、通知設定與租約範本。
 */
export async function wipeUserData(userId: string) {
  return prisma.$transaction(async (tx) => {
    const propertyIds = (await tx.property.findMany({ where: { userId }, select: { id: true } })).map((p) => p.id);
    await deleteProperties(tx, propertyIds, { dropPayments: true });
    const tenantIds = (await tx.tenant.findMany({ where: { userId }, select: { id: true } })).map((t) => t.id);
    await deleteTenants(tx, tenantIds, { dropPayments: true });
    await tx.waitlistEntry.deleteMany({ where: { userId } });
  }, { timeout: 120_000 });
}
