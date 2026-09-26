"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TEMPLATE = exports.DOCUMENT_VARIABLES = void 0;
exports.renderTemplate = renderTemplate;
exports.getDocument = getDocument;
exports.renderDocument = renderDocument;
const app_1 = require("../app");
// 租約書全文。內容存 {{變數}} 佔位符，顯示與傳送時才代入合約的實際欄位，
// 這樣改了月租金或起訖日，租約書不用重打。
exports.DOCUMENT_VARIABLES = [
    { key: 'landlord', label: '業者姓名' },
    { key: 'tenant', label: '承租人姓名' },
    { key: 'property', label: '停車場名稱' },
    { key: 'address', label: '停車場地址' },
    { key: 'unit', label: '車位編號' },
    { key: 'area', label: '坪數' },
    { key: 'startDate', label: '起租日' },
    { key: 'endDate', label: '到期日' },
    { key: 'months', label: '租期月數' },
    { key: 'rent', label: '月租金' },
    { key: 'deposit', label: '押金' },
    { key: 'dueDay', label: '每月繳租日' },
    { key: 'today', label: '今日日期' },
    { key: 'notes', label: '合約備註' },
];
/** 內政部住宅租賃定型化契約的常見條款，作為新合約的起始範本。 */
exports.DEFAULT_TEMPLATE = `住宅租賃契約書

出租人（以下簡稱甲方）：{{landlord}}
承租人（以下簡稱乙方）：{{tenant}}

第一條　租賃標的
甲方將坐落於 {{address}} 之 {{property}} {{unit}} 房（面積約 {{area}} 坪）出租予乙方使用。

第二條　租賃期間
自 {{startDate}} 起至 {{endDate}} 止，共計 {{months}} 個月。
租期屆滿前，經雙方合意得續訂租約。

第三條　租金及押金
一、月租金新臺幣 {{rent}} 元整，乙方應於每月 {{dueDay}} 日前繳納。
二、押金新臺幣 {{deposit}} 元整，於本契約簽訂時由乙方交付甲方。
三、押金於租期屆滿、乙方遷空返還租賃標的並結清相關費用後，由甲方無息返還。

第四條　使用限制
一、乙方應以善良管理人之注意義務使用租賃標的，非經甲方書面同意，不得轉租、頂讓或供他人使用。
二、乙方不得將租賃標的用於違法用途。
三、乙方如需變更室內裝修或格局，應事先取得甲方書面同意。

第五條　水電及管理費用
一、電費依台灣電力公司計價標準計收，不得超過台電夏月／非夏月每度平均電價。
二、水費、瓦斯費及其他費用之分擔方式，依雙方另行約定辦理。
三、上開費用之抄表與分攤明細，甲方應提供乙方查閱。

第六條　修繕義務
一、租賃標的之結構、固定設備因自然損耗或非可歸責於乙方之事由而須修繕者，由甲方負責。
二、因乙方使用不當所致之損壞，由乙方負責修復或賠償。
三、乙方發現損壞應即時通知甲方，甲方應於合理期間內修繕。

第七條　提前終止
一、任一方擬於期滿前終止本契約者，應至少於一個月前以書面通知他方。
二、未依前項規定通知而逕行終止者，應賠償他方一個月租金額之違約金。

第八條　返還租賃標的
租期屆滿或契約終止時，乙方應即時遷空、返還租賃標的，並回復原狀。

第九條　其他約定
{{notes}}

第十條　契約效力
本契約自雙方簽署之日起生效，未盡事宜依民法及住宅租賃相關法令辦理。

立契約書人
出租人（甲方）：{{landlord}}
承租人（乙方）：{{tenant}}

中華民國 {{today}}
`;
async function buildContext(contractId) {
    const c = await app_1.prisma.contract.findUniqueOrThrow({
        where: { id: contractId },
        include: {
            tenant: true,
            unit: { include: { property: { include: { user: true } } } },
        },
    });
    const fmt = (d) => d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
    const months = Math.max(1, Math.round((c.endDate.getTime() - c.startDate.getTime()) / (30.44 * 86400000)));
    return {
        landlord: c.unit.property.user.name ?? '',
        tenant: c.tenant.name,
        property: c.unit.property.name,
        address: c.unit.property.address ?? '',
        unit: c.unit.unitNumber,
        area: c.unit.areaPing ? String(Number(c.unit.areaPing)) : '—',
        startDate: fmt(c.startDate),
        endDate: fmt(c.endDate),
        months: String(months),
        rent: Number(c.monthlyRent).toLocaleString(),
        deposit: Number(c.depositAmount).toLocaleString(),
        dueDay: String(c.rentDueDay),
        today: fmt(new Date()),
        notes: c.notes?.trim() || '（無）',
    };
}
/** 把 {{變數}} 換成實際值；未知變數原樣保留，讓使用者看得出是哪裡打錯。 */
function renderTemplate(body, ctx) {
    return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key) => key in ctx ? ctx[key] : whole);
}
/** 取得某合約的租約書：原始內容（含佔位符）與代入後的完稿。 */
async function getDocument(contractId) {
    const contract = await app_1.prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
    const ctx = await buildContext(contractId);
    const body = contract.documentBody ?? exports.DEFAULT_TEMPLATE;
    return {
        body,
        rendered: renderTemplate(body, ctx),
        isDefault: contract.documentBody === null,
        updatedAt: contract.documentUpdatedAt,
        sentAt: contract.documentSentAt,
        signedAt: contract.signedAt,
        signerName: contract.signerName,
        variables: exports.DOCUMENT_VARIABLES.map((v) => ({ ...v, value: ctx[v.key] ?? '' })),
    };
}
/** 取得代入後的完稿（給車主端簽署頁與 LINE 用）。 */
async function renderDocument(contractId) {
    const contract = await app_1.prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
    const ctx = await buildContext(contractId);
    return renderTemplate(contract.documentBody ?? exports.DEFAULT_TEMPLATE, ctx);
}
