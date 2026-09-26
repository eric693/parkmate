import { Request, Response } from 'express';
import * as line from '@line/bot-sdk';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../app';
import { handleWebhookEvent } from '../services/lineService';
import crypto from 'crypto';

export async function webhook(req: Request, res: Response) {
  const signature = req.headers['x-line-signature'] as string;
  const channelSecret = process.env.LINE_CHANNEL_SECRET ?? '';

  if (channelSecret && channelSecret !== 'your_line_channel_secret') {
    const body = JSON.stringify(req.body);
    const hash = crypto.createHmac('sha256', channelSecret).update(body).digest('base64');
    if (hash !== signature) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
  }

  const events: line.WebhookEvent[] = req.body.events ?? [];
  await Promise.all(events.map((e) => handleWebhookEvent(e)));
  res.json({ ok: true });
}

export async function getLandlordBinding(req: AuthRequest, res: Response) {
  const binding = await prisma.lineBinding.findUnique({
    where: { userId: req.userId! },
    select: { lineUserId: true, displayName: true, boundAt: true, bindingCode: true, bindingCodeExpiry: true },
  });
  res.json(binding ?? { lineUserId: null });
}

export async function generateLandlordBindingCode(req: AuthRequest, res: Response) {
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  const expiry = new Date(Date.now() + 30 * 60 * 1000);

  const existing = await prisma.lineBinding.findUnique({ where: { userId: req.userId! } });
  if (existing) {
    await prisma.lineBinding.update({
      where: { userId: req.userId! },
      data: { bindingCode: code, bindingCodeExpiry: expiry },
    });
  } else {
    await prisma.lineBinding.create({
      data: {
        userId: req.userId!,
        lineUserId: `pending_${req.userId}`,
        bindingCode: code,
        bindingCodeExpiry: expiry,
      },
    });
  }
  res.json({ code, expiry, botUrl: process.env.LINE_BOT_WEBHOOK_URL?.replace('/webhook', '') });
}

export async function unbindLandlord(req: AuthRequest, res: Response) {
  await prisma.lineBinding.deleteMany({ where: { userId: req.userId! } });
  res.json({ success: true });
}

export async function getTenantBindings(req: AuthRequest, res: Response) {
  const tenants = await prisma.tenant.findMany({
    where: { userId: req.userId! },
    include: {
      contracts: {
        where: { status: 'ACTIVE' },
        include: { unit: { select: { unitNumber: true } } },
        take: 1,
      },
    },
  });
  const result = tenants.map(({ id, name, phone, lineUserId, lineDisplayName, lineBoundAt, lineBindingCode, lineBindingCodeExpiry, contracts }) => ({
    id, name, phone, lineUserId, lineDisplayName, lineBoundAt, lineBindingCode, lineBindingCodeExpiry, contracts,
  }));
  res.json(result);
}
