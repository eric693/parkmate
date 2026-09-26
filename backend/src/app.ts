import 'dotenv/config';
// 讓 async 路由丟出的錯誤交給下方錯誤處理，而不是讓請求一直卡住沒有回應
import 'express-async-errors';
import path from 'path';
import fs from 'fs';
import express, { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import routes from './routes/index';
import { startScheduler } from './services/notificationScheduler';

export const prisma = new PrismaClient();

// 上傳目錄（維修照片等）
export const UPLOAD_DIR = path.resolve(__dirname, '../uploads');
fs.mkdirSync(path.join(UPLOAD_DIR, 'maintenance'), { recursive: true });

const app = express();
// 在 nginx 後面，讓 req.ip 取到真實用戶 IP（登入次數限制用）
app.set('trust proxy', 1);

app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
}));
// 影像以 base64 上傳，放寬 body 上限
app.use(express.json({ limit: '15mb' }));

// 靜態服務上傳檔案
app.use('/uploads', express.static(UPLOAD_DIR));

app.use('/api', routes);

app.get('/health', (_req, res) => res.json({ ok: true }));

// 前端：直接由後端提供 frontend/dist（單一 port 即可運作，nginx 只需反代到這個 port）
const FRONTEND_DIST = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST, {
    setHeaders: (res, file) => {
      // sw.js 與 index.html 不快取，才能即時拿到新版
      if (/(sw\.js|index\.html)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

// 統一錯誤處理：資料格式錯誤回 400，其餘回 500，都用 JSON 讓前端顯示訊息
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  if (res.headersSent) return;
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({ error: '資料格式不正確，請檢查欄位後再試一次' });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') { res.status(409).json({ error: '資料重複，已有相同的紀錄' }); return; }
    if (err.code === 'P2025') { res.status(404).json({ error: '找不到資料' }); return; }
    if (err.code === 'P2003') { res.status(409).json({ error: '這筆資料仍被其他資料使用，無法刪除' }); return; }
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError && /violates (RESTRICT|foreign key)/.test(err.message)) {
    res.status(409).json({ error: '這筆資料仍被其他資料使用，無法刪除' }); return;
  }
  res.status(500).json({ error: '伺服器發生錯誤，請稍後再試' });
});

const PORT = Number(process.env.PORT ?? 3001);

app.listen(PORT, () => {
  console.log(`RentMate API running on http://localhost:${PORT}`);
  startScheduler();
});

export default app;
