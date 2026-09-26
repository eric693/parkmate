"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiEnabled = aiEnabled;
exports.classifyMaintenance = classifyMaintenance;
exports.analyzeMaintenance = analyzeMaintenance;
exports.checkContractCompliance = checkContractCompliance;
exports.chatWithAssistant = chatWithAssistant;
exports.draftContractClauses = draftContractClauses;
exports.financialInsights = financialInsights;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const config_1 = require("../config");
const app_1 = require("../app");
let client = null;
function getClient() {
    if (!config_1.config.ai.enabled)
        return null;
    if (!client)
        client = new sdk_1.default({ apiKey: config_1.config.ai.apiKey });
    return client;
}
function aiEnabled() {
    return config_1.config.ai.enabled;
}
const MAINTENANCE_CATEGORIES = ['水電', '家電', '管路漏水', '結構', '門窗鎖具', '網路', '清潔', '其他'];
async function classifyMaintenance(title, description) {
    const cl = getClient();
    if (!cl)
        return ruleBasedClassify(title, description);
    try {
        const msg = await cl.messages.create({
            model: config_1.config.ai.model,
            max_tokens: 200,
            system: [
                {
                    type: 'text',
                    text: `你是租屋停車場維修分類助理。根據車主的報修標題與描述，判斷維修類別與緊急程度。
類別只能從以下擇一：${MAINTENANCE_CATEGORIES.join('、')}。
緊急程度 priority：HIGH（漏水、停電、瓦斯、無法上鎖等安全或居住急迫問題）、MEDIUM（一般故障影響使用）、LOW（外觀、輕微、不影響使用）。
只回傳 JSON，格式：{"category":"...","priority":"HIGH|MEDIUM|LOW"}`,
                    cache_control: { type: 'ephemeral' },
                },
            ],
            messages: [{ role: 'user', content: `標題：${title}\n描述：${description}` }],
        });
        const text = msg.content.find((c) => c.type === 'text');
        const parsed = JSON.parse(text?.text ?? '{}');
        const priority = ['LOW', 'MEDIUM', 'HIGH'].includes(parsed.priority) ? parsed.priority : 'MEDIUM';
        const category = MAINTENANCE_CATEGORIES.includes(parsed.category) ? parsed.category : '其他';
        return { priority, category, aiClassified: true };
    }
    catch (err) {
        console.error('AI classify error:', err);
        return ruleBasedClassify(title, description);
    }
}
function ruleBasedClassify(title, description) {
    const t = `${title} ${description}`;
    let category = '其他';
    if (/漏水|滲水|積水|水管|馬桶|排水/.test(t))
        category = '管路漏水';
    else if (/停電|跳電|插座|電燈|電線|開關/.test(t))
        category = '水電';
    else if (/冷氣|冰箱|洗衣機|熱水器|電視|家電/.test(t))
        category = '家電';
    else if (/門|窗|鎖|玻璃/.test(t))
        category = '門窗鎖具';
    else if (/網路|wifi|wi-fi|網路線/i.test(t))
        category = '網路';
    else if (/牆|壁癌|裂|天花板|地板|結構/.test(t))
        category = '結構';
    let priority = 'MEDIUM';
    if (/漏水|停電|瓦斯|無法上鎖|淹水|火|危險|安全/.test(t))
        priority = 'HIGH';
    else if (/外觀|油漆|輕微|不影響|小/.test(t))
        priority = 'LOW';
    return { priority, category, aiClassified: false };
}
const RESP_LABEL = {
    LANDLORD: '業者負擔',
    TENANT: '車主負擔',
    SHARED: '雙方分攤',
    UNCLEAR: '需現場判斷',
};
// 依台灣租賃慣例：自然耗損/結構/管線歸業者，可歸責於車主之故意過失歸車主。
async function analyzeMaintenance(title, description, category) {
    const cl = getClient();
    if (!cl)
        return ruleBasedAnalyze(title, description);
    try {
        const msg = await cl.messages.create({
            model: config_1.config.ai.model,
            max_tokens: 400,
            system: [
                {
                    type: 'text',
                    text: `你是台灣租屋修繕責任與費用評估顧問。依《民法》租賃與內政部定型化契約的修繕責任慣例判斷：
- 房屋本體、固定設備之自然耗損、老化、結構、管線問題 → 業者(LANDLORD)負擔。
- 因車主故意或過失、不當使用造成之損壞 → 車主(TENANT)負擔。
- 責任難以單方歸屬 → 雙方分攤(SHARED)；資訊不足無法判斷 → UNCLEAR。
並依台灣市場行情估算維修費用區間（新台幣）。
只回傳 JSON：{"responsibility":"LANDLORD|TENANT|SHARED|UNCLEAR","costMin":number,"costMax":number,"reasoning":"100字內判斷理由","tips":"給業者的處理建議與溝通話術，100字內"}`,
                    cache_control: { type: 'ephemeral' },
                },
            ],
            messages: [{ role: 'user', content: `類別：${category ?? '未分類'}\n標題：${title}\n描述：${description}` }],
        });
        const text = msg.content.find((c) => c.type === 'text');
        const p = JSON.parse(text?.text ?? '{}');
        const responsibility = ['LANDLORD', 'TENANT', 'SHARED', 'UNCLEAR'].includes(p.responsibility)
            ? p.responsibility
            : 'UNCLEAR';
        return {
            responsibility,
            responsibilityLabel: RESP_LABEL[responsibility],
            costMin: Number(p.costMin) || 0,
            costMax: Number(p.costMax) || 0,
            reasoning: String(p.reasoning ?? ''),
            tips: String(p.tips ?? ''),
            aiAnalyzed: true,
        };
    }
    catch (err) {
        console.error('AI maintenance analyze error:', err);
        return ruleBasedAnalyze(title, description);
    }
}
function ruleBasedAnalyze(title, description) {
    const t = `${title} ${description}`;
    let responsibility = 'UNCLEAR';
    let costMin = 0;
    let costMax = 0;
    if (/漏水|滲水|壁癌|管路|水管|結構|老化|自然|龜裂|天花板/.test(t)) {
        responsibility = 'LANDLORD';
        costMin = 1500;
        costMax = 8000;
    }
    else if (/打破|摔|撞|刮|燒|堵塞|養寵物|抽菸|人為|弄壞|遺失鑰匙/.test(t)) {
        responsibility = 'TENANT';
        costMin = 500;
        costMax = 3000;
    }
    return {
        responsibility,
        responsibilityLabel: RESP_LABEL[responsibility],
        costMin,
        costMax,
        reasoning: 'AI 未啟用，依關鍵字規則初判，僅供參考。',
        tips: '建議保留現場照片與單據，依租約修繕條款與車主溝通責任歸屬。',
        aiAnalyzed: false,
    };
}
async function checkContractCompliance(contract) {
    // 規則式硬檢查（不依賴 AI，務必命中的法規紅線）
    const issues = [];
    // 押金上限：不得超過二個月租金（土地法 §99）
    if (contract.depositAmount > contract.monthlyRent * 2) {
        issues.push({
            severity: 'HIGH',
            type: 'PROHIBITED',
            item: '押金上限',
            detail: `押金 NT$${contract.depositAmount.toLocaleString()} 超過二個月租金上限（NT$${(contract.monthlyRent * 2).toLocaleString()}），依土地法第99條應予返還超收部分。`,
        });
    }
    // 不得約定事項常見項目（以 notes 文字偵測）
    const notes = contract.notes ?? '';
    const prohibitedPatterns = [
        { re: /拋棄.*審閱|不得審閱|放棄審閱/, item: '審閱期', detail: '不得約定承租人拋棄契約審閱期間（至少3日）。' },
        { re: /不得遷.*戶籍|禁止遷入戶籍|不得設籍/, item: '戶籍登記', detail: '不得約定限制承租人遷入戶籍。' },
        { re: /不得申報|不得報稅|禁止申報租賃/, item: '租賃所得申報', detail: '不得約定限制承租人申報租賃費用或租金支出。' },
        { re: /概括拋棄|拋棄一切權利|放棄一切/, item: '概括拋棄權利', detail: '不得約定承租人概括拋棄權利。' },
    ];
    for (const p of prohibitedPatterns) {
        if (p.re.test(notes)) {
            issues.push({ severity: 'HIGH', type: 'PROHIBITED', item: p.item, detail: p.detail });
        }
    }
    // 電費超收（113/7/15 租屋電費新制）：按度計費不得超過台電帳單「當期每度平均電價」，
    // 且應向承租人揭露當期平均電價與用電度數。違者可處 3 萬～30 萬元罰鍰。
    const kwhMatch = /[每一]\s*度(?:\s*電)?(?:\s*費)?[^0-9]{0,6}(\d+(?:\.\d+)?)\s*元/.exec(notes);
    if (kwhMatch) {
        const price = parseFloat(kwhMatch[1]);
        issues.push({
            severity: price > 4 ? 'HIGH' : 'MEDIUM',
            type: 'PROHIBITED',
            item: '電費計收',
            detail: `合約約定電費每度 NT$${price}。依租屋電費新制（113/7/15），按度計費不得超過台電當期每度平均電價` +
                (price > 4
                    ? `，NT$${price}/度極可能超收（可處 3 萬～30 萬元罰鍰），請改為依台電帳單實際金額分攤。`
                    : `，請確認未超過當期平均電價，並向房客揭露平均電價與用電度數。`),
        });
    }
    const cl = getClient();
    if (!cl) {
        const score = Math.max(0, 100 - issues.length * 25);
        return {
            score,
            passed: issues.filter((i) => i.severity === 'HIGH').length === 0,
            issues,
            summary: issues.length
                ? `偵測到 ${issues.length} 項潛在問題（規則檢查）。AI 未啟用，建議再人工核對應記載事項。`
                : '規則檢查未發現明顯違規。AI 未啟用，建議再人工核對應記載事項。',
            aiChecked: false,
        };
    }
    try {
        const msg = await cl.messages.create({
            model: config_1.config.ai.model,
            max_tokens: 900,
            system: [
                {
                    type: 'text',
                    text: `你是台灣住宅租賃法務稽核，依《住宅租賃契約應約定及不得約定事項》檢查租約。
找出：缺漏的「應記載事項」(MISSING)、違反的「不得記載事項」(PROHIBITED)、以及保護業者/車主的建議(SUGGESTION)。
只回傳 JSON：{"score":0-100整數,"summary":"100字內總評","issues":[{"severity":"HIGH|MEDIUM|LOW","type":"MISSING|PROHIBITED|SUGGESTION","item":"短標題","detail":"說明"}]}`,
                    cache_control: { type: 'ephemeral' },
                },
            ],
            messages: [
                {
                    role: 'user',
                    content: `月租金：NT$${contract.monthlyRent.toLocaleString()}
押金：NT$${contract.depositAmount.toLocaleString()}（${(contract.depositAmount / Math.max(contract.monthlyRent, 1)).toFixed(1)} 個月）
租期：${contract.startDate.toISOString().split('T')[0]} ~ ${contract.endDate.toISOString().split('T')[0]}
繳租日：每月 ${contract.rentDueDay} 日
特約條款／備註：${notes || '（無）'}`,
                },
            ],
        });
        const text = msg.content.find((c) => c.type === 'text');
        const p = JSON.parse(text?.text ?? '{}');
        const aiIssues = Array.isArray(p.issues) ? p.issues : [];
        // 合併規則式硬檢查結果（去重以 item）
        const merged = [...issues];
        for (const ai of aiIssues) {
            if (!merged.some((m) => m.item === ai.item))
                merged.push(ai);
        }
        const highCount = merged.filter((i) => i.severity === 'HIGH').length;
        return {
            score: typeof p.score === 'number' ? Math.min(100, Math.max(0, p.score)) : Math.max(0, 100 - merged.length * 15),
            passed: highCount === 0,
            issues: merged,
            summary: String(p.summary ?? ''),
            aiChecked: true,
        };
    }
    catch (err) {
        console.error('AI compliance error:', err);
        const score = Math.max(0, 100 - issues.length * 25);
        return { score, passed: issues.filter((i) => i.severity === 'HIGH').length === 0, issues, summary: '規則檢查完成（AI 檢查失敗）。', aiChecked: false };
    }
}
// ── 業者 AI 助理（tool-use 迴圈）────────────────────────────────
const TOOLS = [
    {
        name: 'get_unpaid_rents',
        description: '查詢目前尚未繳清（待繳/逾期/部分繳納）的租金，回傳車主、車位、應繳與已繳金額。',
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'get_monthly_income',
        description: '查詢某年某月已實收的租金總額。',
        input_schema: {
            type: 'object',
            properties: { year: { type: 'number' }, month: { type: 'number' } },
            required: ['year', 'month'],
        },
    },
    {
        name: 'get_vacancies',
        description: '查詢目前空置（待出租）的車位。',
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'get_pending_maintenance',
        description: '查詢尚未完成的維修申請。',
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'get_expiring_contracts',
        description: '查詢即將到期的租約。',
        input_schema: {
            type: 'object',
            properties: { withinDays: { type: 'number', description: '幾天內到期，預設 60' } },
        },
    },
];
async function runTool(userId, name, input) {
    switch (name) {
        case 'get_unpaid_rents': {
            const records = await app_1.prisma.rentRecord.findMany({
                where: {
                    status: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] },
                    contract: { status: 'ACTIVE', unit: { property: { userId } } },
                },
                include: { contract: { include: { tenant: true, unit: { include: { property: true } } } } },
                orderBy: [{ year: 'asc' }, { month: 'asc' }],
            });
            return records.map((r) => ({
                tenant: r.contract.tenant.name,
                property: r.contract.unit.property.name,
                unit: r.contract.unit.unitNumber,
                period: `${r.year}/${r.month}`,
                amount: Number(r.amount),
                paid: r.paidAmount ? Number(r.paidAmount) : 0,
                status: r.status,
                dueDate: r.dueDate.toISOString().split('T')[0],
            }));
        }
        case 'get_monthly_income': {
            const records = await app_1.prisma.rentRecord.findMany({
                where: {
                    year: input.year,
                    month: input.month,
                    status: { in: ['PAID', 'PARTIAL'] },
                    contract: { unit: { property: { userId } } },
                },
            });
            const total = records.reduce((s, r) => s + (r.paidAmount ? Number(r.paidAmount) : 0), 0);
            return { year: input.year, month: input.month, totalReceived: total, count: records.length };
        }
        case 'get_vacancies': {
            const units = await app_1.prisma.unit.findMany({
                where: { status: 'VACANT', property: { userId } },
                include: { property: true },
            });
            return units.map((u) => ({
                property: u.property.name,
                unit: u.unitNumber,
                monthlyRent: Number(u.monthlyRent),
            }));
        }
        case 'get_pending_maintenance': {
            const reqs = await app_1.prisma.maintenanceRequest.findMany({
                where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, unit: { property: { userId } } },
                include: { unit: true, tenant: true },
                orderBy: { priority: 'desc' },
            });
            return reqs.map((m) => ({
                unit: m.unit.unitNumber,
                title: m.title,
                category: m.category,
                priority: m.priority,
                status: m.status,
                tenant: m.tenant?.name,
            }));
        }
        case 'get_expiring_contracts': {
            const withinDays = input.withinDays ?? 60;
            const limit = new Date(Date.now() + withinDays * 86400000);
            const contracts = await app_1.prisma.contract.findMany({
                where: { status: 'ACTIVE', endDate: { lte: limit }, unit: { property: { userId } } },
                include: { tenant: true, unit: { include: { property: true } } },
                orderBy: { endDate: 'asc' },
            });
            return contracts.map((c) => ({
                tenant: c.tenant.name,
                property: c.unit.property.name,
                unit: c.unit.unitNumber,
                endDate: c.endDate.toISOString().split('T')[0],
                daysLeft: Math.ceil((c.endDate.getTime() - Date.now()) / 86400000),
            }));
        }
        default:
            return { error: 'unknown tool' };
    }
}
const ASSISTANT_SYSTEM = `你是 RentMate 微租的業者 AI 助理，協助台灣業者管理租屋。
你可以使用工具查詢業者自己的即時資料（繳租、空位、維修、租約到期、收入）。
回答原則：
- 用繁體中文、口語、精簡。
- 涉及金額用 NT$ 並加千分位。
- 需要資料時務必呼叫工具，不要臆測數字。
- 若查無資料，據實說明。`;
async function chatWithAssistant(userId, history) {
    const cl = getClient();
    if (!cl) {
        return 'AI 助理尚未啟用（缺少 ANTHROPIC_API_KEY）。設定後即可用自然語言查詢繳租、空位、維修與收入等即時資料。';
    }
    const messages = history.map((m) => ({ role: m.role, content: m.content }));
    // tool-use 迴圈：最多 5 輪，避免無限循環
    for (let i = 0; i < 5; i++) {
        const resp = await cl.messages.create({
            model: config_1.config.ai.model,
            max_tokens: 1024,
            system: [{ type: 'text', text: ASSISTANT_SYSTEM, cache_control: { type: 'ephemeral' } }],
            tools: TOOLS,
            messages,
        });
        if (resp.stop_reason === 'tool_use') {
            messages.push({ role: 'assistant', content: resp.content });
            const toolResults = [];
            for (const block of resp.content) {
                if (block.type === 'tool_use') {
                    const result = await runTool(userId, block.name, block.input);
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: block.id,
                        content: JSON.stringify(result),
                    });
                }
            }
            messages.push({ role: 'user', content: toolResults });
            continue;
        }
        const text = resp.content.find((c) => c.type === 'text');
        return text?.text ?? '（無回應）';
    }
    return '查詢過於複雜，請換個方式詢問。';
}
// ── 合約特約條款草擬 ───────────────────────────────────────────
async function draftContractClauses(params) {
    const cl = getClient();
    if (!cl) {
        return [
            '一、承租人應於每月約定日期前繳納租金，逾期經催告仍不繳納者，出租人得依法終止租約。',
            '二、承租人應維持房屋及設備之正常使用，因可歸責於承租人之故意或過失致損壞者，應負修復或賠償責任。',
            '三、未經出租人書面同意，承租人不得將房屋全部或一部轉租、出借或以其他變相方法供他人使用。',
            '四、租賃期滿或租約終止時，承租人應將房屋回復原狀返還，並結清水電、瓦斯、管理費等費用。',
            '（AI 助理未啟用，以上為通用範本，請依個案調整並確認符合內政部應記載及不得記載事項。）',
        ].join('\n');
    }
    const msg = await cl.messages.create({
        model: config_1.config.ai.model,
        max_tokens: 800,
        system: [
            {
                type: 'text',
                text: `你是台灣租賃法務助理，依《住宅租賃契約應約定及不得約定事項》草擬住宅租賃契約的特約條款。
條款須合法、公平、可執行，不得出現內政部明定的「不得約定事項」（如拋棄審閱期、預收逾二個月押金、限制報稅或遷入戶籍、概括拋棄權利等）。
以條列方式輸出 4-8 條，繁體中文。`,
                cache_control: { type: 'ephemeral' },
            },
        ],
        messages: [
            {
                role: 'user',
                content: `房屋類型：${params.propertyType ?? '一般住宅'}\n月租金：NT$${(params.monthlyRent ?? 0).toLocaleString()}\n可否養寵物：${params.petAllowed ? '可' : '不可'}\n業者補充需求：${params.notes ?? '無'}`,
            },
        ],
    });
    const text = msg.content.find((c) => c.type === 'text');
    return text?.text ?? '';
}
// ── 財務異常洞察 ───────────────────────────────────────────────
async function financialInsights(userId) {
    // 蒐集近 6 個月收支數據
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const [records, expenses, vacancies, overdue] = await Promise.all([
        app_1.prisma.rentRecord.findMany({
            where: { dueDate: { gte: sixMonthsAgo }, contract: { unit: { property: { userId } } } },
        }),
        app_1.prisma.expense.findMany({
            where: { date: { gte: sixMonthsAgo }, OR: [{ property: { userId } }, { unit: { property: { userId } } }] },
        }),
        app_1.prisma.unit.count({ where: { status: 'VACANT', property: { userId } } }),
        app_1.prisma.rentRecord.count({
            where: { status: 'OVERDUE', contract: { unit: { property: { userId } } } },
        }),
    ]);
    const income = records.reduce((s, r) => s + (r.paidAmount ? Number(r.paidAmount) : 0), 0);
    const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const data = {
        近6月實收租金: income,
        近6月支出: expenseTotal,
        淨現金流: income - expenseTotal,
        空置車位數: vacancies,
        逾期未繳筆數: overdue,
        支出筆數: expenses.length,
    };
    const cl = getClient();
    if (!cl) {
        const lines = [
            `近 6 個月實收租金 NT$${income.toLocaleString()}、支出 NT$${expenseTotal.toLocaleString()}、淨現金流 NT$${(income - expenseTotal).toLocaleString()}。`,
            vacancies > 0 ? `目前有 ${vacancies} 間空位，建議盡快招租以減少閒置損失。` : '目前無空位，出租率良好。',
            overdue > 0 ? `有 ${overdue} 筆租金逾期，建議加強催收。` : '無逾期租金，收款狀況健康。',
            '（AI 未啟用，以上為規則式摘要。）',
        ];
        return { insights: lines.join('\n'), aiEnabled: false };
    }
    const msg = await cl.messages.create({
        model: config_1.config.ai.model,
        max_tokens: 600,
        system: [
            {
                type: 'text',
                text: '你是租屋投資財務顧問。根據業者近半年的收支數據，用繁體中文給出 3-5 點精簡、可執行的洞察與建議，指出異常或風險。金額用 NT$ 千分位。',
                cache_control: { type: 'ephemeral' },
            },
        ],
        messages: [{ role: 'user', content: JSON.stringify(data) }],
    });
    const text = msg.content.find((c) => c.type === 'text');
    return { insights: text?.text ?? '', aiEnabled: true };
}
