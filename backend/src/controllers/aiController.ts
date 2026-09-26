import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { aiEnabled, chatWithAssistant, draftContractClauses, financialInsights, ChatMessage } from '../services/aiService';

// 業者 AI 助理：自然語言查詢即時營運資料
export async function assistantChat(req: AuthRequest, res: Response) {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: '缺少對話內容' });
    return;
  }
  const history: ChatMessage[] = messages
    .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-20);
  const reply = await chatWithAssistant(req.userId!, history);
  res.json({ reply, aiEnabled: aiEnabled() });
}

// 財務異常洞察
export async function getFinancialInsights(req: AuthRequest, res: Response) {
  const result = await financialInsights(req.userId!);
  res.json(result);
}

// 合約特約條款草擬
export async function draftClauses(req: AuthRequest, res: Response) {
  const { propertyType, monthlyRent, petAllowed, notes } = req.body;
  const clauses = await draftContractClauses({ propertyType, monthlyRent, petAllowed, notes });
  res.json({ clauses, aiEnabled: aiEnabled() });
}
