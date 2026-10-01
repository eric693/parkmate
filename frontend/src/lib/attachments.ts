import { useCallback, useEffect, useState } from 'react';
import api from '../api/client';

export type AttachmentEntity =
  | 'PROPERTY' | 'UNIT' | 'TENANT' | 'VEHICLE' | 'CONTRACT' | 'MAINTENANCE' | 'EXPENSE' | 'RENT_RECORD';

export interface Attachment {
  id: string;
  entityType: AttachmentEntity;
  entityId: string;
  entityLabel?: string | null;
  category: string;
  fileName: string;
  mimeType: string;
  size: number;
  note: string | null;
  capturedAt: string | null;
  uploadedBy: string;
  createdAt: string;
  isImage: boolean;
  canDelete: boolean;
}

export type AttachmentSummary = Record<string, { count: number; categories: string[] }>;

export const ALL_CATEGORIES = [
  '車位現況', '車損佐證', '違停佐證', '行照', '駕照', '身分證件',
  '合約掃描', '繳費憑證', '發票收據', '報價單', '維修照片', '其他',
];

/** 各對象常用的分類（排前面，第一個為預設） */
export const SUGGESTED: Record<AttachmentEntity, string[]> = {
  PROPERTY: ['車位現況', '違停佐證', '合約掃描', '其他'],
  UNIT: ['車位現況', '違停佐證', '車損佐證', '其他'],
  TENANT: ['身分證件', '駕照', '合約掃描', '繳費憑證'],
  VEHICLE: ['行照', '車損佐證', '違停佐證'],
  CONTRACT: ['合約掃描', '車位現況', '車損佐證', '繳費憑證'],
  MAINTENANCE: ['維修照片', '報價單', '發票收據'],
  EXPENSE: ['發票收據', '報價單'],
  RENT_RECORD: ['繳費憑證'],
};

export const ENTITY_LABEL: Record<AttachmentEntity, string> = {
  PROPERTY: '停車場', UNIT: '車位', TENANT: '車主', VEHICLE: '車輛',
  CONTRACT: '合約', MAINTENANCE: '報修', EXPENSE: '支出', RENT_RECORD: '租金紀錄',
};

/** 含個資的分類，畫面上提醒使用者 */
export const SENSITIVE = ['身分證件', '駕照', '行照'];

export const ACCEPT = 'image/*,.heic,.heif,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt';
export const MAX_BYTES = 10 * 1024 * 1024;

export function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** 以檔名補 MIME（部分 Android／Windows 對 heic、csv 等給空字串） */
function mimeOf(file: File) {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ({
    heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf', csv: 'text/csv', txt: 'text/plain',
    doc: 'application/msword', xls: 'application/vnd.ms-excel',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  } as Record<string, string>)[ext] ?? 'application/octet-stream';
}

function readAsDataUrl(blob: Blob, type: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]*;/, `data:${type};`));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * 手機照片動輒 5–10MB：長邊縮到 2000px、轉 JPEG，現場網路慢也傳得上去，文字與刮痕仍看得清楚。
 * 非點陣圖或縮完反而更大時保留原檔。
 */
async function compressImage(file: File): Promise<{ blob: Blob; type: string; name: string }> {
  const type = mimeOf(file);
  if (!/^image\/(jpeg|png|webp)$/.test(type) || file.size < 800 * 1024) return { blob: file, type, name: file.name };
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return { blob: file, type, name: file.name };
    return { blob, type: 'image/jpeg', name: file.name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg' };
  } catch {
    return { blob: file, type, name: file.name };
  }
}

export async function uploadFile(file: File, target: {
  entityType: AttachmentEntity; entityId: string; category: string; note?: string;
}) {
  const { blob, type, name } = await compressImage(file);
  if (blob.size > MAX_BYTES) throw new Error(`「${file.name}」超過 10MB，請壓縮或分開上傳`);
  const dataUrl = await readAsDataUrl(blob, type);
  const { data } = await api.post<Attachment>('/attachments', {
    ...target,
    fileName: name,
    dataUrl,
    capturedAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
  });
  return data;
}

// 附件需帶登入憑證下載，以 blob URL 顯示；同一檔案在本頁只抓一次
const blobCache = new Map<string, Promise<string>>();
export function fileUrl(id: string) {
  let p = blobCache.get(id);
  if (!p) {
    p = api.get(`/attachments/${id}/file`, { responseType: 'blob' }).then((r) => URL.createObjectURL(r.data));
    p.catch(() => blobCache.delete(id));
    blobCache.set(id, p);
  }
  return p;
}

export async function openAttachment(a: Attachment) {
  // 先開視窗再填網址，避免 iOS Safari 擋掉非同步開啟的彈出視窗
  const w = window.open('', '_blank');
  const url = await fileUrl(a.id);
  if (w) w.location.href = url;
  else window.location.href = url;
}

export async function downloadAttachment(a: Attachment) {
  const url = await fileUrl(a.id);
  const link = document.createElement('a');
  link.href = url;
  link.download = a.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** 列表頁：一次取回該類對象的附件數量與已有分類 */
export function useAttachmentSummary(entityType: AttachmentEntity) {
  const [summary, setSummary] = useState<AttachmentSummary>({});
  const refresh = useCallback(() => {
    api.get<AttachmentSummary>('/attachments/summary', { params: { entityType } })
      .then((r) => setSummary(r.data))
      .catch(() => {});
  }, [entityType]);
  useEffect(refresh, [refresh]);
  return { summary, refresh };
}
