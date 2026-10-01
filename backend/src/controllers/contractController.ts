import { Response, Request } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';
import { generateMonthlyRentRecords, regenerateFutureRentRecords } from '../services/rentService';
import { onUnitVacated } from '../services/waitlistService';
import { BillingCycle, Unit } from '@prisma/client';
import { sendTenantMessage } from '../services/lineService';
import { checkContractCompliance } from '../services/aiService';
import crypto from 'crypto';

// 合約合規檢查：依內政部應記載/不得記載事項，產生報告並存入 complianceResult
export async function checkCompliance(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const contract = await prisma.contract.findFirst({
    where: { id, unit: { property: { userId: req.userId! } } },
  });
  if (!contract) {
    res.status(404).json({ error: '找不到合約' });
    return;
  }
  const result = await checkContractCompliance({
    monthlyRent: Number(contract.monthlyRent),
    depositAmount: Number(contract.depositAmount),
    startDate: contract.startDate,
    endDate: contract.endDate,
    rentDueDay: contract.rentDueDay,
    notes: contract.notes,
  });
  await prisma.contract.update({
    where: { id },
    data: { complianceResult: result as any, complianceCheckedAt: new Date() },
  });
  res.json(result);
}

/** 合約登記的車輛必須是這位車主的車，否則當作未指定 */
async function tenantVehicleId(tenantId: string, vehicleId: unknown) {
  if (!vehicleId) return null;
  const v = await prisma.vehicle.findFirst({ where: { id: String(vehicleId), tenantId } });
  return v?.id ?? null;
}

const BILLING_CYCLES: BillingCycle[] = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'SHORT_TERM'];

/** 短租天數（含頭尾）。日期字串都是 YYYY-MM-DD，存成 UTC 午夜。 */
export function shortTermDays(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

/** 依車位的日租／週租價估短租總額；沒設價格回傳 null */
export function shortTermQuote(unit: Pick<Unit, 'dailyRate' | 'weeklyRate'>, days: number) {
  const daily = unit.dailyRate != null ? Number(unit.dailyRate) : null;
  const weekly = unit.weeklyRate != null ? Number(unit.weeklyRate) : null;
  if (weekly != null) {
    const rest = days % 7;
    const restCost = rest === 0 ? 0 : daily != null ? Math.min(rest * daily, weekly) : weekly;
    return Math.floor(days / 7) * weekly + restCost;
  }
  return daily != null ? days * daily : null;
}

const optAmount = (v: unknown) => (v === undefined ? undefined : v === '' || v === null ? null : Number(v));

export async function getContracts(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { status } = req.query;

  const properties = await prisma.property.findMany({ where: { userId } });
  const propertyIds = properties.map((p) => p.id);
  const units = await prisma.unit.findMany({ where: { propertyId: { in: propertyIds } } });
  const unitIds = units.map((u) => u.id);

  const contracts = await prisma.contract.findMany({
    where: {
      unitId: { in: unitIds },
      ...(status ? { status: status as any } : {}),
    },
    include: {
      unit: { include: { property: true } },
      tenant: { include: { vehicles: true } },
      vehicle: true,
      rentRecords: { orderBy: { dueDate: 'desc' }, take: 1 },
      depositRefund: { include: { deductions: true } },
    },
    orderBy: { endDate: 'asc' },
  });
  res.json(contracts);
}

export async function createContract(req: AuthRequest, res: Response) {
  const { unitId, tenantId, startDate, endDate, monthlyRent, depositAmount, depositPaid, rentDueDay, notes, vehicleId, accessCard, accessCardDeposit } = req.body;
  const billingCycle: BillingCycle = req.body.billingCycle || 'MONTHLY';
  if (!BILLING_CYCLES.includes(billingCycle)) { res.status(400).json({ error: '繳費週期不正確' }); return; }
  const shortTerm = billingCycle === 'SHORT_TERM';
  if (!unitId || !tenantId || !startDate || !endDate || (!monthlyRent && !shortTerm)) {
    res.status(400).json({ error: '請填寫所有必填欄位' });
    return;
  }

  const unit = await prisma.unit.findFirst({ where: { id: unitId }, include: { property: true } });
  if (!unit || unit.property.userId !== req.userId!) {
    res.status(404).json({ error: '找不到車位' }); return;
  }
  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, userId: req.userId! } });
  if (!tenant) { res.status(404).json({ error: '找不到車主' }); return; }

  // 表單送來的數字是字串，空字串代表沒填。短租沒填月租時以車位月租當參考值。
  const rent = monthlyRent === undefined || monthlyRent === '' ? Number(unit.monthlyRent) : Number(monthlyRent);
  const deposit = depositAmount === undefined || depositAmount === '' ? (shortTerm ? 0 : rent * 2) : Number(depositAmount);
  const dueDay = rentDueDay === undefined || rentDueDay === '' ? 5 : Number(rentDueDay);
  if (!(rent > 0) || !(deposit >= 0)) { res.status(400).json({ error: '租金或押金金額不正確' }); return; }
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) { res.status(400).json({ error: '每月繳租日需為 1～31' }); return; }
  const start = new Date(startDate);
  const end = new Date(endDate);
  // 短租可以只租一天（開始 = 結束）
  if (shortTerm ? end < start : end <= start) { res.status(400).json({ error: '結束日期需晚於開始日期' }); return; }

  let periodAmount = optAmount(req.body.periodAmount) ?? null;
  if (shortTerm && periodAmount === null) periodAmount = shortTermQuote(unit, shortTermDays(start, end));
  if (shortTerm && periodAmount === null) { res.status(400).json({ error: '短租請填寫總金額，或先在車位設定日租／週租價' }); return; }
  if (periodAmount !== null && !(periodAmount > 0)) { res.status(400).json({ error: '每期金額需大於 0' }); return; }

  const contract = await prisma.contract.create({
    data: {
      unitId,
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      monthlyRent: rent,
      depositAmount: deposit,
      depositPaid: depositPaid ?? false,
      rentDueDay: dueDay,
      billingCycle,
      periodAmount,
      notes: notes || null,
      vehicleId: await tenantVehicleId(tenant.id, vehicleId),
      accessCard: accessCard || null,
      accessCardDeposit: accessCardDeposit === undefined || accessCardDeposit === '' ? null : Number(accessCardDeposit),
    },
  });

  await prisma.unit.update({ where: { id: unitId }, data: { status: 'OCCUPIED' } });
  await generateMonthlyRentRecords(contract.id);

  res.status(201).json(contract);
}

export async function updateContract(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const contract = await prisma.contract.findFirst({
    where: { id },
    include: { unit: { include: { property: true } } },
  });
  if (!contract || contract.unit.property.userId !== req.userId!) {
    res.status(404).json({ error: '找不到合約' }); return;
  }
  const { startDate, endDate, status, notes, depositPaid, monthlyRent, depositAmount, rentDueDay, vehicleId, accessCard, accessCardDeposit, accessCardReturned } = req.body;
  const dueDay = rentDueDay !== undefined && rentDueDay !== '' ? Number(rentDueDay) : undefined;
  if (dueDay !== undefined && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) {
    res.status(400).json({ error: '每月繳租日需為 1～31' }); return;
  }
  const billingCycle: BillingCycle | undefined = req.body.billingCycle || undefined;
  if (billingCycle && !BILLING_CYCLES.includes(billingCycle)) { res.status(400).json({ error: '繳費週期不正確' }); return; }
  const periodAmount = optAmount(req.body.periodAmount);
  if (periodAmount != null && !(periodAmount > 0)) { res.status(400).json({ error: '每期金額需大於 0' }); return; }
  if ((billingCycle ?? contract.billingCycle) === 'SHORT_TERM' && periodAmount === null) {
    res.status(400).json({ error: '短租請填寫總金額' }); return;
  }
  const updated = await prisma.contract.update({
    where: { id },
    data: {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status, notes, depositPaid,
      monthlyRent: monthlyRent !== undefined && monthlyRent !== '' ? Number(monthlyRent) : undefined,
      depositAmount: depositAmount !== undefined && depositAmount !== '' ? Number(depositAmount) : undefined,
      rentDueDay: dueDay,
      billingCycle,
      periodAmount,
      vehicleId: vehicleId === undefined ? undefined : await tenantVehicleId(contract.tenantId, vehicleId),
      accessCard: accessCard === undefined ? undefined : accessCard || null,
      accessCardDeposit: accessCardDeposit === undefined ? undefined : accessCardDeposit === '' || accessCardDeposit === null ? null : Number(accessCardDeposit),
      accessCardReturned: typeof accessCardReturned === 'boolean' ? accessCardReturned : undefined,
    },
  });
  if (status === 'TERMINATED' || status === 'EXPIRED') {
    await prisma.unit.update({ where: { id: contract.unitId }, data: { status: 'VACANT' } });
    await onUnitVacated(contract.unitId);
  } else if (updated.status === 'ACTIVE') {
    // 繳費方式或期間變了：還沒到期、沒收過錢的租金單依新規則重開
    const billingChanged =
      updated.billingCycle !== contract.billingCycle
      || String(updated.periodAmount) !== String(contract.periodAmount)
      || Number(updated.monthlyRent) !== Number(contract.monthlyRent)
      || updated.rentDueDay !== contract.rentDueDay
      || updated.startDate.getTime() !== contract.startDate.getTime()
      || updated.endDate.getTime() !== contract.endDate.getTime();
    if (billingChanged) await regenerateFutureRentRecords(id);
  }
  res.json(updated);
}

export async function generateSignInvite(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const contract = await prisma.contract.findFirst({
    where: { id },
    include: {
      unit: { include: { property: true } },
      tenant: true,
    },
  });
  if (!contract || contract.unit.property.userId !== req.userId!) {
    res.status(404).json({ error: '找不到合約' }); return;
  }
  if (contract.signedAt) {
    res.status(400).json({ error: '合約已完成簽署' }); return;
  }

  const token = crypto.randomBytes(24).toString('hex');
  await prisma.contract.update({ where: { id }, data: { signToken: token } });

  const baseUrl = process.env.APP_URL ?? 'http://localhost:6000';
  const signUrl = `${baseUrl}/sign/${token}`;

  const tenant = contract.tenant;
  const unitNum = contract.unit.unitNumber;
  const propName = contract.unit.property.name;

  let sent = false;
  if (tenant.lineUserId) {
    const text = `📄 合約簽署邀請\n\n您好 ${tenant.name}，\n業者邀請您簽署 ${propName} ${unitNum} 的租賃合約。\n\n📋 合約期間：${new Date(contract.startDate).toLocaleDateString('zh-TW')} ～ ${new Date(contract.endDate).toLocaleDateString('zh-TW')}\n💰 月租金：NT$${Number(contract.monthlyRent).toLocaleString()}\n\n請點擊以下連結完成電子簽署：\n${signUrl}\n\n⚠️ 連結僅供本次簽署使用，請勿轉發。`;
    sent = await sendTenantMessage(tenant.id, text);
  }

  res.json({ token, signUrl, sent });
}

export async function getContractByToken(req: Request, res: Response) {
  const { token } = req.params;
  const contract = await prisma.contract.findUnique({
    where: { signToken: token },
    include: {
      unit: { include: { property: true } },
      tenant: true,
    },
  });
  if (!contract) { res.status(404).json({ error: '連結無效或已過期' }); return; }
  res.json({
    id: contract.id,
    signedAt: contract.signedAt,
    signerName: contract.signerName,
    startDate: contract.startDate,
    endDate: contract.endDate,
    monthlyRent: contract.monthlyRent,
    depositAmount: contract.depositAmount,
    rentDueDay: contract.rentDueDay,
    notes: contract.notes,
    unit: { unitNumber: contract.unit.unitNumber },
    property: { name: contract.unit.property.name, address: contract.unit.property.address },
    tenant: { name: contract.tenant.name },
  });
}

export async function signContractByToken(req: Request, res: Response) {
  const { token } = req.params;
  const { signerName, agreed } = req.body;
  if (!agreed || !signerName) {
    res.status(400).json({ error: '請填寫姓名並確認同意' }); return;
  }

  const contract = await prisma.contract.findUnique({ where: { signToken: token } });
  if (!contract) { res.status(404).json({ error: '連結無效' }); return; }
  if (contract.signedAt) { res.status(400).json({ error: '合約已完成簽署' }); return; }

  const updated = await prisma.contract.update({
    where: { id: contract.id },
    data: { signedAt: new Date(), signerName },
  });
  res.json({ signedAt: updated.signedAt, message: '簽署完成，感謝您！' });
}
