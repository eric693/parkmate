import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Response } from 'express';
import { AttachmentEntity } from '@prisma/client';
import { prisma } from '../app';
import { AuthRequest } from '../middleware/auth';

// 附件存在 uploads 以外的目錄，不經 express.static 對外公開；只能登入後由 API 下載。
export const ATTACHMENT_DIR = path.resolve(__dirname, '../../storage/attachments');
fs.mkdirSync(ATTACHMENT_DIR, { recursive: true });

const MAX_BYTES = 10 * 1024 * 1024; // 單檔 10MB（base64 後約 13.4MB，低於 express 15mb 與 nginx 16m）

/** 附件掛載對象 → 所屬權限模組（員工需有該模組權限才能看／傳） */
const ENTITY_MODULE: Record<AttachmentEntity, string> = {
  PROPERTY: 'properties',
  UNIT: 'properties',
  TENANT: 'tenants',
  VEHICLE: 'tenants',
  CONTRACT: 'contracts',
  MAINTENANCE: 'maintenance',
  EXPENSE: 'finance',
  RENT_RECORD: 'finance',
};

export const CATEGORIES = [
  '車位現況', '車損佐證', '違停佐證', '行照', '駕照', '身分證件',
  '合約掃描', '繳費憑證', '發票收據', '報價單', '維修照片', '其他',
];

/** 允許的檔案類型。inline=true 的會在瀏覽器直接預覽，其餘一律強制下載。 */
const ALLOWED: Record<string, { ext: string; inline?: boolean; magic?: number[][] }> = {
  'image/jpeg': { ext: 'jpg', inline: true, magic: [[0xff, 0xd8, 0xff]] },
  'image/png': { ext: 'png', inline: true, magic: [[0x89, 0x50, 0x4e, 0x47]] },
  'image/webp': { ext: 'webp', inline: true, magic: [[0x52, 0x49, 0x46, 0x46]] },
  'image/gif': { ext: 'gif', inline: true, magic: [[0x47, 0x49, 0x46, 0x38]] },
  'image/heic': { ext: 'heic' },
  'image/heif': { ext: 'heif' },
  'application/pdf': { ext: 'pdf', inline: true, magic: [[0x25, 0x50, 0x44, 0x46]] },
  'application/msword': { ext: 'doc' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx' },
  'application/vnd.ms-excel': { ext: 'xls' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx' },
  'text/csv': { ext: 'csv' },
  'text/plain': { ext: 'txt' },
};

function allowed(req: AuthRequest, type: AttachmentEntity) {
  return req.role !== 'STAFF' || (req.permissions ?? []).includes(ENTITY_MODULE[type]);
}

function parseEntity(v: unknown): AttachmentEntity | null {
  return typeof v === 'string' && v in ENTITY_MODULE ? (v as AttachmentEntity) : null;
}

/** 確認掛載對象屬於目前的資料擁有者 */
async function ownsEntity(userId: string, type: AttachmentEntity, id: string): Promise<boolean> {
  const byProperty = { property: { userId } };
  switch (type) {
    case 'PROPERTY': return !!(await prisma.property.findFirst({ where: { id, userId }, select: { id: true } }));
    case 'UNIT': return !!(await prisma.unit.findFirst({ where: { id, ...byProperty }, select: { id: true } }));
    case 'TENANT': return !!(await prisma.tenant.findFirst({ where: { id, userId }, select: { id: true } }));
    case 'VEHICLE': return !!(await prisma.vehicle.findFirst({ where: { id, tenant: { userId } }, select: { id: true } }));
    case 'CONTRACT': return !!(await prisma.contract.findFirst({ where: { id, tenant: { userId } }, select: { id: true } }));
    case 'MAINTENANCE': return !!(await prisma.maintenanceRequest.findFirst({ where: { id, unit: byProperty }, select: { id: true } }));
    case 'EXPENSE': return !!(await prisma.expense.findFirst({
      where: { id, OR: [byProperty, { unit: byProperty }] }, select: { id: true },
    }));
    case 'RENT_RECORD': return !!(await prisma.rentRecord.findFirst({ where: { id, contract: { tenant: { userId } } }, select: { id: true } }));
  }
}

/** 批次取得掛載對象的顯示名稱（檔案庫列表用） */
async function entityLabels(userId: string, items: { entityType: AttachmentEntity; entityId: string }[]) {
  const ids = (t: AttachmentEntity) => [...new Set(items.filter((i) => i.entityType === t).map((i) => i.entityId))];
  const labels: Record<string, string> = {};
  const unitName = (u: { unitNumber: string; property: { name: string } }) => `${u.property.name} ${u.unitNumber}`;

  const [props, units, tenants, vehicles, contracts, mts, exps, rents] = await Promise.all([
    prisma.property.findMany({ where: { id: { in: ids('PROPERTY') }, userId }, select: { id: true, name: true } }),
    prisma.unit.findMany({ where: { id: { in: ids('UNIT') } }, select: { id: true, unitNumber: true, property: { select: { name: true } } } }),
    prisma.tenant.findMany({ where: { id: { in: ids('TENANT') }, userId }, select: { id: true, name: true } }),
    prisma.vehicle.findMany({ where: { id: { in: ids('VEHICLE') } }, select: { id: true, plateNumber: true, tenant: { select: { name: true } } } }),
    prisma.contract.findMany({ where: { id: { in: ids('CONTRACT') } }, select: { id: true, tenant: { select: { name: true } }, unit: { select: { unitNumber: true, property: { select: { name: true } } } } } }),
    prisma.maintenanceRequest.findMany({ where: { id: { in: ids('MAINTENANCE') } }, select: { id: true, title: true, unit: { select: { unitNumber: true, property: { select: { name: true } } } } } }),
    prisma.expense.findMany({ where: { id: { in: ids('EXPENSE') } }, select: { id: true, description: true, category: true, date: true } }),
    prisma.rentRecord.findMany({ where: { id: { in: ids('RENT_RECORD') } }, select: { id: true, year: true, month: true, contract: { select: { tenant: { select: { name: true } } } } } }),
  ]);
  props.forEach((p) => { labels[p.id] = p.name; });
  units.forEach((u) => { labels[u.id] = `車位 ${unitName(u)}`; });
  tenants.forEach((t) => { labels[t.id] = `車主 ${t.name}`; });
  vehicles.forEach((v) => { labels[v.id] = `車牌 ${v.plateNumber}（${v.tenant.name}）`; });
  contracts.forEach((c) => { labels[c.id] = `合約 ${c.tenant.name}・${unitName(c.unit)}`; });
  mts.forEach((m) => { labels[m.id] = `報修 ${m.title}・${unitName(m.unit)}`; });
  exps.forEach((e) => { labels[e.id] = `支出 ${e.description || e.category}・${e.date.toISOString().slice(0, 10)}`; });
  rents.forEach((r) => { labels[r.id] = `租金 ${r.year}/${r.month}・${r.contract.tenant.name}`; });
  return labels;
}

/** 上傳者本人 24 小時內可刪除（傳錯檔）；之後只有管理員能刪，避免佐證被事後移除 */
function canDelete(req: AuthRequest, a: { uploadedById: string; createdAt: Date }) {
  if (req.role !== 'STAFF') return true;
  return a.uploadedById === req.authUserId && Date.now() - a.createdAt.getTime() < 24 * 3600 * 1000;
}

function present(req: AuthRequest, a: {
  id: string; entityType: AttachmentEntity; entityId: string; category: string; fileName: string;
  mimeType: string; size: number; note: string | null; capturedAt: Date | null; uploadedBy: string;
  uploadedById: string; createdAt: Date;
}) {
  // 不回傳 storedName／userId 等內部欄位
  const rest = {
    id: a.id, entityType: a.entityType, entityId: a.entityId, category: a.category, fileName: a.fileName,
    mimeType: a.mimeType, size: a.size, note: a.note, capturedAt: a.capturedAt, uploadedBy: a.uploadedBy, createdAt: a.createdAt,
  };
  return { ...rest, isImage: a.mimeType.startsWith('image/') && !!ALLOWED[a.mimeType]?.inline, canDelete: canDelete(req, a) };
}

// GET /attachments?entityType=&entityId=            → 單一對象的附件
// GET /attachments?category=&entityType=&q=&limit=  → 檔案庫（跨對象搜尋）
export async function listAttachments(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const entityType = parseEntity(req.query.entityType);
  const entityId = typeof req.query.entityId === 'string' ? req.query.entityId : undefined;
  const category = typeof req.query.category === 'string' && req.query.category ? req.query.category : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  if (entityType && !allowed(req, entityType)) { res.status(403).json({ error: '您沒有使用此功能的權限' }); return; }
  const visibleTypes = (Object.keys(ENTITY_MODULE) as AttachmentEntity[]).filter((t) => allowed(req, t));

  const rows = await prisma.attachment.findMany({
    where: {
      userId,
      entityType: entityType ?? { in: visibleTypes },
      ...(entityId ? { entityId } : {}),
      ...(category ? { category } : {}),
      ...(q ? { OR: [{ fileName: { contains: q, mode: 'insensitive' } }, { note: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(req.query.limit) || 200, 500),
  });
  const labels = entityId ? {} : await entityLabels(userId, rows);
  res.json(rows.map((a) => ({ ...present(req, a), entityLabel: labels[a.entityId] ?? null })));
}

// GET /attachments/summary?entityType=TENANT → { [entityId]: { count, categories[] } }（列表卡片顯示數量與缺件）
export async function attachmentSummary(req: AuthRequest, res: Response) {
  const entityType = parseEntity(req.query.entityType);
  if (!entityType) { res.status(400).json({ error: '缺少 entityType' }); return; }
  if (!allowed(req, entityType)) { res.status(403).json({ error: '您沒有使用此功能的權限' }); return; }
  const groups = await prisma.attachment.groupBy({
    by: ['entityId', 'category'],
    where: { userId: req.userId!, entityType },
    _count: { _all: true },
  });
  const out: Record<string, { count: number; categories: string[] }> = {};
  for (const g of groups) {
    const o = (out[g.entityId] ??= { count: 0, categories: [] });
    o.count += g._count._all;
    o.categories.push(g.category);
  }
  res.json(out);
}

export function getCategories(_req: AuthRequest, res: Response) {
  res.json({ categories: CATEGORIES, maxBytes: MAX_BYTES, accept: Object.keys(ALLOWED) });
}

// POST /attachments { entityType, entityId, category, fileName, dataUrl, note?, capturedAt? }
export async function uploadAttachment(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { entityId, category, fileName, dataUrl, note, capturedAt } = req.body ?? {};
  const entityType = parseEntity(req.body?.entityType);
  if (!entityType || typeof entityId !== 'string') { res.status(400).json({ error: '缺少附件所屬對象' }); return; }
  if (!allowed(req, entityType)) { res.status(403).json({ error: '您沒有使用此功能的權限' }); return; }
  if (!CATEGORIES.includes(category)) { res.status(400).json({ error: '請選擇檔案分類' }); return; }
  if (!(await ownsEntity(userId, entityType, entityId))) { res.status(404).json({ error: '找不到資料' }); return; }

  const m = typeof dataUrl === 'string' ? /^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/s.exec(dataUrl) : null;
  const type = m?.[1].toLowerCase() ?? '';
  const spec = ALLOWED[type];
  if (!m || !spec) {
    res.status(400).json({ error: '不支援的檔案格式，可上傳照片（JPG/PNG/WEBP/HEIC）、PDF、Word、Excel、CSV、TXT' });
    return;
  }
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) { res.status(400).json({ error: '檔案是空的' }); return; }
  if (buf.length > MAX_BYTES) { res.status(413).json({ error: '檔案超過 10MB，請壓縮或分開上傳' }); return; }
  // 會在瀏覽器直接開啟的類型，檢查檔頭確實是宣稱的格式，避免偽裝成圖片的 HTML
  if (spec.magic && !spec.magic.some((sig) => sig.every((b, i) => buf[i] === b))) {
    res.status(400).json({ error: '檔案內容與格式不符' });
    return;
  }

  const storedName = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.${spec.ext}`;
  fs.writeFileSync(path.join(ATTACHMENT_DIR, storedName), buf);

  const uploader = await prisma.user.findUnique({ where: { id: req.authUserId! }, select: { name: true } });
  const cleanName = String(fileName || `附件.${spec.ext}`).replace(/[\\/\r\n"]/g, '_').slice(0, 150);
  const captured = capturedAt ? new Date(capturedAt) : null;

  try {
    const a = await prisma.attachment.create({
      data: {
        userId, entityType, entityId, category,
        fileName: cleanName,
        storedName,
        mimeType: type,
        size: buf.length,
        note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null,
        capturedAt: captured && !isNaN(captured.getTime()) ? captured : null,
        uploadedById: req.authUserId!,
        uploadedBy: uploader?.name ?? '',
      },
    });
    res.status(201).json(present(req, a));
  } catch (e) {
    fs.rmSync(path.join(ATTACHMENT_DIR, storedName), { force: true });
    throw e;
  }
}

async function findOwned(req: AuthRequest, res: Response) {
  const a = await prisma.attachment.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!a) { res.status(404).json({ error: '找不到檔案' }); return null; }
  if (!allowed(req, a.entityType)) { res.status(403).json({ error: '您沒有使用此功能的權限' }); return null; }
  return a;
}

// GET /attachments/:id/file[?download=1]
export async function downloadAttachment(req: AuthRequest, res: Response) {
  const a = await findOwned(req, res);
  if (!a) return;
  const file = path.join(ATTACHMENT_DIR, path.basename(a.storedName));
  if (!fs.existsSync(file)) { res.status(404).json({ error: '檔案已遺失' }); return; }
  const inline = ALLOWED[a.mimeType]?.inline && req.query.download !== '1';
  res.setHeader('Content-Type', a.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.fileName)}`);
  fs.createReadStream(file).pipe(res);
}

// PUT /attachments/:id { category?, note? }
export async function updateAttachment(req: AuthRequest, res: Response) {
  const a = await findOwned(req, res);
  if (!a) return;
  const { category, note } = req.body ?? {};
  if (category !== undefined && !CATEGORIES.includes(category)) { res.status(400).json({ error: '分類不正確' }); return; }
  const updated = await prisma.attachment.update({
    where: { id: a.id },
    data: {
      ...(category !== undefined ? { category } : {}),
      ...(note !== undefined ? { note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null } : {}),
    },
  });
  res.json(present(req, updated));
}

// DELETE /attachments/:id
export async function deleteAttachment(req: AuthRequest, res: Response) {
  const a = await findOwned(req, res);
  if (!a) return;
  if (!canDelete(req, a)) {
    res.status(403).json({ error: '上傳超過 24 小時的檔案只有管理員可以刪除（保留佐證）' });
    return;
  }
  await prisma.attachment.delete({ where: { id: a.id } });
  fs.rmSync(path.join(ATTACHMENT_DIR, path.basename(a.storedName)), { force: true });
  res.json({ ok: true });
}

/**
 * 資料被刪除後（含連帶刪除的車輛、租金紀錄），清掉掛在已不存在對象上的附件與實體檔案，
 * 避免身分證、行照等個資在資料刪除後還留在主機上。
 */
export async function purgeOrphanAttachments(userId: string) {
  const rows = await prisma.attachment.findMany({ where: { userId }, select: { id: true, entityType: true, entityId: true, storedName: true } });
  if (!rows.length) return;
  const orphans = [];
  for (const r of rows) if (!(await ownsEntity(userId, r.entityType, r.entityId))) orphans.push(r);
  if (!orphans.length) return;
  await prisma.attachment.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
  for (const o of orphans) fs.rmSync(path.join(ATTACHMENT_DIR, path.basename(o.storedName)), { force: true });
}
