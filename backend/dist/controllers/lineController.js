"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhook = webhook;
exports.getLandlordBinding = getLandlordBinding;
exports.generateLandlordBindingCode = generateLandlordBindingCode;
exports.unbindLandlord = unbindLandlord;
exports.getTenantBindings = getTenantBindings;
const app_1 = require("../app");
const lineService_1 = require("../services/lineService");
const crypto_1 = __importDefault(require("crypto"));
async function webhook(req, res) {
    const signature = req.headers['x-line-signature'];
    const channelSecret = process.env.LINE_CHANNEL_SECRET ?? '';
    if (channelSecret && channelSecret !== 'your_line_channel_secret') {
        const body = JSON.stringify(req.body);
        const hash = crypto_1.default.createHmac('sha256', channelSecret).update(body).digest('base64');
        if (hash !== signature) {
            res.status(401).json({ error: 'Invalid signature' });
            return;
        }
    }
    const events = req.body.events ?? [];
    await Promise.all(events.map((e) => (0, lineService_1.handleWebhookEvent)(e)));
    res.json({ ok: true });
}
async function getLandlordBinding(req, res) {
    const binding = await app_1.prisma.lineBinding.findUnique({
        where: { userId: req.userId },
        select: { lineUserId: true, displayName: true, boundAt: true, bindingCode: true, bindingCodeExpiry: true },
    });
    res.json(binding ?? { lineUserId: null });
}
async function generateLandlordBindingCode(req, res) {
    const code = crypto_1.default.randomBytes(4).toString('hex').toUpperCase();
    const expiry = new Date(Date.now() + 30 * 60 * 1000);
    const existing = await app_1.prisma.lineBinding.findUnique({ where: { userId: req.userId } });
    if (existing) {
        await app_1.prisma.lineBinding.update({
            where: { userId: req.userId },
            data: { bindingCode: code, bindingCodeExpiry: expiry },
        });
    }
    else {
        await app_1.prisma.lineBinding.create({
            data: {
                userId: req.userId,
                lineUserId: `pending_${req.userId}`,
                bindingCode: code,
                bindingCodeExpiry: expiry,
            },
        });
    }
    res.json({ code, expiry, botUrl: process.env.LINE_BOT_WEBHOOK_URL?.replace('/webhook', '') });
}
async function unbindLandlord(req, res) {
    await app_1.prisma.lineBinding.deleteMany({ where: { userId: req.userId } });
    res.json({ success: true });
}
async function getTenantBindings(req, res) {
    const tenants = await app_1.prisma.tenant.findMany({
        where: { userId: req.userId },
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
