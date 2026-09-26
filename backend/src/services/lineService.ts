import * as line from '@line/bot-sdk';
import { prisma } from '../app';

let client: line.messagingApi.MessagingApiClient | null = null;

function getClient(): line.messagingApi.MessagingApiClient | null {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN === 'your_line_channel_access_token') {
    return null;
  }
  if (!client) {
    client = new line.messagingApi.MessagingApiClient({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    });
  }
  return client;
}

export async function sendLandlordMessage(userId: string, text: string): Promise<boolean> {
  const cl = getClient();
  if (!cl) return false;
  const binding = await prisma.lineBinding.findUnique({ where: { userId } });
  // pending_ 為產生綁定碼時的佔位值，尚未完成 LINE 綁定，不可推播
  if (!binding?.lineUserId || binding.lineUserId.startsWith('pending_')) return false;
  try {
    await cl.pushMessage({ to: binding.lineUserId, messages: [{ type: 'text', text }] });
    return true;
  } catch (err) {
    console.error('LINE push error:', err);
    return false;
  }
}

export async function sendTenantMessage(tenantId: string, text: string): Promise<boolean> {
  const cl = getClient();
  if (!cl) return false;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant?.lineUserId) return false;
  try {
    await cl.pushMessage({ to: tenant.lineUserId, messages: [{ type: 'text', text }] });
    return true;
  } catch (err) {
    console.error('LINE push error:', err);
    return false;
  }
}

export async function handleWebhookEvent(event: line.WebhookEvent, userId?: string): Promise<void> {
  const cl = getClient();
  if (!cl || event.type !== 'message' || event.message.type !== 'text') return;

  const lineUserId = event.source.userId;
  if (!lineUserId) return;
  const text = event.message.text.trim();

  // Check if this is a landlord binding code
  const landlordBinding = await prisma.lineBinding.findFirst({
    where: {
      bindingCode: text,
      bindingCodeExpiry: { gt: new Date() },
    },
    include: { user: true },
  });

  if (landlordBinding) {
    await prisma.lineBinding.update({
      where: { id: landlordBinding.id },
      data: { lineUserId, bindingCode: null, bindingCodeExpiry: null, boundAt: new Date() },
    });
    await cl.replyMessage({
      replyToken: (event as any).replyToken,
      messages: [{ type: 'text', text: `✅ 綁定成功！歡迎 ${landlordBinding.user.name}，您現在可以透過 LINE 接收租屋管理通知。` }],
    });
    return;
  }

  // Check if this is a tenant binding code
  const tenant = await prisma.tenant.findFirst({
    where: {
      lineBindingCode: text,
      lineBindingCodeExpiry: { gt: new Date() },
    },
  });

  if (tenant) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        lineUserId,
        lineBindingCode: null,
        lineBindingCodeExpiry: null,
        lineBoundAt: new Date(),
      },
    });
    await cl.replyMessage({
      replyToken: (event as any).replyToken,
      messages: [{ type: 'text', text: `✅ 車主綁定成功！${tenant.name} 您好，您現在可以透過 LINE 接收業者通知。` }],
    });
    return;
  }

  // Default welcome message
  if (text === '你好' || text === 'hi' || text === 'hello') {
    await cl.replyMessage({
      replyToken: (event as any).replyToken,
      messages: [{
        type: 'text',
        text: '您好！請輸入綁定碼完成帳號綁定。\n\n業者請在 RentMate 設定頁面取得綁定碼，車主請向業者索取邀請碼。',
      }],
    });
  }
}
