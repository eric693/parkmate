import { Request, Response } from 'express';
import { prisma } from '../app';
import { config } from '../config';
import { signTenantToken } from '../middleware/tenantAuth';

// 車主端登入。
// 正式環境（已設定 LIFF）：前端傳 LINE LIFF accessToken，後端向 LINE 驗證取得 lineUserId，
//   對應到已綁定的車主。
// 沙盒環境（未設定 LIFF）：前端傳業者提供的綁定碼，直接換發車主 token。
export async function tenantLogin(req: Request, res: Response) {
  const { liffAccessToken, bindingCode } = req.body;

  // ── 正式：LIFF accessToken 驗證 ──
  if (config.liff.enabled && liffAccessToken) {
    try {
      const profileRes = await fetch('https://api.line.me/v2/profile', {
        headers: { Authorization: `Bearer ${liffAccessToken}` },
      });
      if (!profileRes.ok) {
        res.status(401).json({ error: 'LINE 驗證失敗' });
        return;
      }
      const profile = (await profileRes.json()) as { userId: string; displayName?: string };
      const tenant = await prisma.tenant.findUnique({ where: { lineUserId: profile.userId } });
      if (!tenant) {
        res.status(404).json({ error: '尚未綁定，請先向業者索取邀請碼完成綁定' });
        return;
      }
      res.json({ token: signTenantToken(tenant.id), tenant: { id: tenant.id, name: tenant.name } });
      return;
    } catch {
      res.status(401).json({ error: 'LINE 驗證失敗' });
      return;
    }
  }

  // ── 沙盒：綁定碼登入 ──
  if (bindingCode) {
    const code = String(bindingCode).trim().toUpperCase();
    const tenant = await prisma.tenant.findFirst({
      where: { lineBindingCode: code, lineBindingCodeExpiry: { gt: new Date() } },
    });
    if (!tenant) {
      res.status(401).json({ error: '邀請碼無效或已過期，請向業者索取新的邀請碼' });
      return;
    }
    res.json({ token: signTenantToken(tenant.id), tenant: { id: tenant.id, name: tenant.name } });
    return;
  }

  res.status(400).json({ error: '缺少登入資訊' });
}

// 回報車主端執行環境（前端用來決定要不要初始化 LIFF SDK）
export function tenantAuthConfig(_req: Request, res: Response) {
  res.json({ liffEnabled: config.liff.enabled, liffId: config.liff.id });
}
