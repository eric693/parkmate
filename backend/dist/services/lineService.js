"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendLandlordMessage = sendLandlordMessage;
exports.sendTenantMessage = sendTenantMessage;
exports.handleWebhookEvent = handleWebhookEvent;
const line = __importStar(require("@line/bot-sdk"));
const app_1 = require("../app");
let client = null;
function getClient() {
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
async function sendLandlordMessage(userId, text) {
    const cl = getClient();
    if (!cl)
        return false;
    const binding = await app_1.prisma.lineBinding.findUnique({ where: { userId } });
    // pending_ 為產生綁定碼時的佔位值，尚未完成 LINE 綁定，不可推播
    if (!binding?.lineUserId || binding.lineUserId.startsWith('pending_'))
        return false;
    try {
        await cl.pushMessage({ to: binding.lineUserId, messages: [{ type: 'text', text }] });
        return true;
    }
    catch (err) {
        console.error('LINE push error:', err);
        return false;
    }
}
async function sendTenantMessage(tenantId, text) {
    const cl = getClient();
    if (!cl)
        return false;
    const tenant = await app_1.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant?.lineUserId)
        return false;
    try {
        await cl.pushMessage({ to: tenant.lineUserId, messages: [{ type: 'text', text }] });
        return true;
    }
    catch (err) {
        console.error('LINE push error:', err);
        return false;
    }
}
async function handleWebhookEvent(event, userId) {
    const cl = getClient();
    if (!cl || event.type !== 'message' || event.message.type !== 'text')
        return;
    const lineUserId = event.source.userId;
    if (!lineUserId)
        return;
    const text = event.message.text.trim();
    // Check if this is a landlord binding code
    const landlordBinding = await app_1.prisma.lineBinding.findFirst({
        where: {
            bindingCode: text,
            bindingCodeExpiry: { gt: new Date() },
        },
        include: { user: true },
    });
    if (landlordBinding) {
        await app_1.prisma.lineBinding.update({
            where: { id: landlordBinding.id },
            data: { lineUserId, bindingCode: null, bindingCodeExpiry: null, boundAt: new Date() },
        });
        await cl.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: `✅ 綁定成功！歡迎 ${landlordBinding.user.name}，您現在可以透過 LINE 接收租屋管理通知。` }],
        });
        return;
    }
    // Check if this is a tenant binding code
    const tenant = await app_1.prisma.tenant.findFirst({
        where: {
            lineBindingCode: text,
            lineBindingCodeExpiry: { gt: new Date() },
        },
    });
    if (tenant) {
        await app_1.prisma.tenant.update({
            where: { id: tenant.id },
            data: {
                lineUserId,
                lineBindingCode: null,
                lineBindingCodeExpiry: null,
                lineBoundAt: new Date(),
            },
        });
        await cl.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: `✅ 車主綁定成功！${tenant.name} 您好，您現在可以透過 LINE 接收業者通知。` }],
        });
        return;
    }
    // Default welcome message
    if (text === '你好' || text === 'hi' || text === 'hello') {
        await cl.replyMessage({
            replyToken: event.replyToken,
            messages: [{
                    type: 'text',
                    text: '您好！請輸入綁定碼完成帳號綁定。\n\n業者請在 RentMate 設定頁面取得綁定碼，車主請向業者索取邀請碼。',
                }],
        });
    }
}
