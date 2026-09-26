"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assistantChat = assistantChat;
exports.getFinancialInsights = getFinancialInsights;
exports.draftClauses = draftClauses;
const aiService_1 = require("../services/aiService");
// 業者 AI 助理：自然語言查詢即時營運資料
async function assistantChat(req, res) {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: '缺少對話內容' });
        return;
    }
    const history = messages
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-20);
    const reply = await (0, aiService_1.chatWithAssistant)(req.userId, history);
    res.json({ reply, aiEnabled: (0, aiService_1.aiEnabled)() });
}
// 財務異常洞察
async function getFinancialInsights(req, res) {
    const result = await (0, aiService_1.financialInsights)(req.userId);
    res.json(result);
}
// 合約特約條款草擬
async function draftClauses(req, res) {
    const { propertyType, monthlyRent, petAllowed, notes } = req.body;
    const clauses = await (0, aiService_1.draftContractClauses)({ propertyType, monthlyRent, petAllowed, notes });
    res.json({ clauses, aiEnabled: (0, aiService_1.aiEnabled)() });
}
