import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { UPLOAD_DIR } from '../app';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// 接收 data URL（data:image/png;base64,xxxx），寫入 uploads/<subdir>，回傳可公開存取的相對路徑。
export function saveBase64Image(dataUrl: string, subdir: string): string | null {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const ext = MIME_EXT[match[1]];
  if (!ext) return null;

  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 8 * 1024 * 1024) return null; // 單張上限 8MB

  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const dir = path.join(UPLOAD_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buf);
  return `/uploads/${subdir}/${name}`;
}

export function saveBase64Images(dataUrls: string[], subdir: string, max = 6): string[] {
  return dataUrls
    .slice(0, max)
    .map((d) => saveBase64Image(d, subdir))
    .filter((p): p is string => Boolean(p));
}
