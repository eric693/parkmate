import crypto from 'crypto';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';
import { sendTenantMessage } from '../services/lineService';
import {
  getDocument,
  renderDocument,
  renderTemplate,
  DEFAULT_TEMPLATE,
  DOCUMENT_VARIABLES,
} from '../services/contractDocumentService';

async function ownedContract(userId: string, contractId: string) {
  return prisma.contract.findFirst({
    where: { id: contractId, unit: { property: { userId } } },
    include: { tenant: true, unit: { include: { property: true } } },
  });
}

/** 取得租約書內容（原始 + 代入後 + 可用變數）。 */
export async function getContractDocument(req: AuthRequest, res: Response) {
  const contract = await ownedContract(req.userId!, req.params.id);
  if (!contract) {
    res.status(404).json({ error: '找不到合約' });
    return;
  }
  res.json(await getDocument(contract.id));
}

/** 儲存租約書內容。已簽署的合約不可再改，否則簽的跟看的會不一致。 */
export async function updateContractDocument(req: AuthRequest, res: Response) {
  const contract = await ownedContract(req.userId!, req.params.id);
  if (!contract) {
    res.status(404).json({ error: '找不到合約' });
    return;
  }
  if (contract.signedAt) {
    res.status(400).json({ error: '合約已完成簽署，內容不可再修改；如需變更請另立新約' });
    return;
  }

  const { body } = req.body;
  if (typeof body !== 'string' || body.trim().length === 0) {
    res.status(400).json({ error: '租約書內容不可空白' });
    return;
  }
  if (body.length > 50000) {
    res.status(400).json({ error: '租約書內容過長（上限 5 萬字）' });
    return;
  }

  await prisma.contract.update({
    where: { id: contract.id },
    data: { documentBody: body, documentUpdatedAt: new Date() },
  });
  res.json(await getDocument(contract.id));
}

/** 還原成系統預設範本。 */
export async function resetContractDocument(req: AuthRequest, res: Response) {
  const contract = await ownedContract(req.userId!, req.params.id);
  if (!contract) {
    res.status(404).json({ error: '找不到合約' });
    return;
  }
  if (contract.signedAt) {
    res.status(400).json({ error: '合約已完成簽署，內容不可再修改' });
    return;
  }
  await prisma.contract.update({
    where: { id: contract.id },
    data: { documentBody: null, documentUpdatedAt: null },
  });
  res.json(await getDocument(contract.id));
}

/**
 * 傳送租約書給車主。
 * 一律附上簽署連結（未簽署才產生新 token），車主點進去可看到完整條款再簽名。
 */
export async function sendContractDocument(req: AuthRequest, res: Response) {
  const contract = await ownedContract(req.userId!, req.params.id);
  if (!contract) {
    res.status(404).json({ error: '找不到合約' });
    return;
  }
  if (!contract.tenant.lineUserId) {
    res.status(400).json({ error: '車主尚未綁定 LINE，無法傳送；請先到車主管理產生綁定碼' });
    return;
  }

  let token = contract.signToken;
  if (!contract.signedAt) {
    token = crypto.randomBytes(24).toString('hex');
    await prisma.contract.update({ where: { id: contract.id }, data: { signToken: token } });
  }

  const baseUrl = process.env.APP_URL ?? 'http://localhost:6000';
  const link = `${baseUrl}/sign/${token}`;
  const propName = contract.unit.property.name;
  const unitNum = contract.unit.unitNumber;

  const text = contract.signedAt
    ? `📄 租約書\n\n${contract.tenant.name} 您好，\n以下是 ${propName} ${unitNum} 的租賃契約內容，供您留存查閱。\n\n${link}`
    : `📄 租約書與簽署邀請\n\n${contract.tenant.name} 您好，\n業者已備妥 ${propName} ${unitNum} 的租賃契約。\n\n📋 租期：${contract.startDate.toLocaleDateString('zh-TW')} ～ ${contract.endDate.toLocaleDateString('zh-TW')}\n💰 月租金：NT$${Number(contract.monthlyRent).toLocaleString()}\n\n請點擊連結詳閱條款並完成電子簽署：\n${link}\n\n⚠️ 連結僅供本次簽署使用，請勿轉發。`;

  const sent = await sendTenantMessage(contract.tenant.id, text);
  if (!sent) {
    res.status(502).json({ error: 'LINE 傳送失敗，請稍後再試' });
    return;
  }

  await prisma.contract.update({
    where: { id: contract.id },
    data: { documentSentAt: new Date() },
  });
  res.json({ message: `已傳送給 ${contract.tenant.name}`, link, signed: Boolean(contract.signedAt) });
}

// ── 租約書範本 ────────────────────────────────────────────────────

export async function getTemplates(req: AuthRequest, res: Response) {
  const templates = await prisma.contractTemplate.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    variables: DOCUMENT_VARIABLES,
    system: { id: 'system', name: '系統預設範本', body: DEFAULT_TEMPLATE, isDefault: true },
    templates,
  });
}

export async function createTemplate(req: AuthRequest, res: Response) {
  const { name, body } = req.body;
  if (!name || typeof body !== 'string' || body.trim().length === 0) {
    res.status(400).json({ error: '請填寫範本名稱與內容' });
    return;
  }
  const template = await prisma.contractTemplate.create({
    data: { userId: req.userId!, name, body },
  });
  res.json(template);
}

export async function deleteTemplate(req: AuthRequest, res: Response) {
  const template = await prisma.contractTemplate.findFirst({
    where: { id: req.params.templateId, userId: req.userId! },
  });
  if (!template) {
    res.status(404).json({ error: '找不到範本' });
    return;
  }
  await prisma.contractTemplate.delete({ where: { id: template.id } });
  res.json({ ok: true });
}

/** 預覽任意內容代入某合約後的樣子，存檔前先確認變數有沒有打錯。 */
export async function previewDocument(req: AuthRequest, res: Response) {
  const contract = await ownedContract(req.userId!, req.params.id);
  if (!contract) {
    res.status(404).json({ error: '找不到合約' });
    return;
  }
  const { body } = req.body;
  if (typeof body !== 'string') {
    res.status(400).json({ error: '缺少內容' });
    return;
  }
  const doc = await getDocument(contract.id);
  const ctx = Object.fromEntries(doc.variables.map((v) => [v.key, v.value]));
  res.json({ rendered: renderTemplate(body, ctx) });
}

/** 車主端／簽署頁用的完稿（無需登入，靠 signToken 授權）。 */
export async function getDocumentByToken(req: AuthRequest, res: Response) {
  const contract = await prisma.contract.findUnique({ where: { signToken: req.params.token } });
  if (!contract) {
    res.status(404).json({ error: '連結無效或已過期' });
    return;
  }
  res.json({ rendered: await renderDocument(contract.id) });
}
