// 全系統 API 煙霧測試：建立一個臨時業者帳號、灌入測試資料，逐一呼叫所有 API
// （含新增／編輯／刪除、員工權限、車主端），最後清空並刪除臨時帳號。
// 不會碰到任何既有帳號的資料；臨時車主沒有 LINE，不會推播給真人。
//
// 用法：node scripts/smoke-test.mjs            （預設打 http://localhost:3001/api）
//       API=https://example.com/api node scripts/smoke-test.mjs
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const API = process.env.API ?? 'http://localhost:3001/api';
const stamp = Date.now().toString(36);
const results = [];

async function call(method, path, { token, body, expect = [200, 201], label } = {}) {
  const started = Date.now();
  let status = 0;
  let data = null;
  try {
    const res = await fetch(API + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    status = res.status;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text; }
  } catch (e) {
    data = String(e);
  }
  const ok = expect.includes(status);
  results.push({ ok, method, path: label ?? path, status, ms: Date.now() - started, error: ok ? '' : JSON.stringify(data).slice(0, 160) });
  return { status, data };
}

const id = (r) => r?.data?.id;
const today = new Date();
const ym = { year: today.getFullYear(), month: today.getMonth() + 1 };

async function main() {
  // ── 帳號 ──
  // 正式環境關閉了公開註冊，臨時帳號直接寫進資料庫
  await call('POST', '/auth/register', { body: { email: `zz-smoke-x-${stamp}`, password: 'smoke12345', name: 'x' }, expect: [403], label: '/auth/register (應關閉)' });
  await prisma.user.create({ data: { email: `zz-smoke-${stamp}`, password: await bcrypt.hash('smoke12345', 10), name: '煙霧測試' } });
  const reg = await call('POST', '/auth/login', { body: { email: `zz-smoke-${stamp}`, password: 'smoke12345' } });
  const T = reg.data.token;
  await call('POST', '/auth/login', { body: { email: `ZZ-SMOKE-${stamp}`, password: 'smoke12345' }, label: '/auth/login (大小寫不同)' });
  await call('POST', '/auth/login', { body: { email: `zz-smoke-${stamp}`, password: 'wrong' }, expect: [401], label: '/auth/login (錯誤密碼)' });
  for (let i = 0; i < 8; i++) await call('POST', '/auth/login', { body: { email: `zz-smoke-lock-${stamp}`, password: 'x' }, expect: [401, 429], label: '/auth/login (連續錯誤)' });
  await call('POST', '/auth/login', { body: { email: `zz-smoke-lock-${stamp}`, password: 'x' }, expect: [429], label: '/auth/login (錯太多次應鎖住)' });
  await call('GET', '/auth/me', { token: T });
  await call('PUT', '/auth/me', { token: T, body: { name: '煙霧測試2' } });
  await call('PUT', '/auth/me', { token: T, body: { newPassword: 'x1234567', currentPassword: 'bad' }, expect: [400], label: '/auth/me (目前密碼錯)' });
  await call('GET', '/dashboard', { token: T, label: '/dashboard (空資料)' });

  // ── 車位 ──
  const P = id(await call('POST', '/properties', { token: T, body: { name: '測試大樓', address: '台北市測試路1號' } }));
  await call('PUT', `/properties/${P}`, { token: T, body: { name: '測試大樓A', address: '台北市測試路1號' } });
  await call('GET', '/properties', { token: T });
  const U1 = id(await call('POST', `/properties/${P}/units`, { token: T, body: { unitNumber: '101', floor: '1', type: '套房', monthlyRent: '8000' } }));
  const U2 = id(await call('POST', `/properties/${P}/units`, { token: T, body: { unitNumber: '102', floor: '', monthlyRent: '9000' } }));
  const U3 = id(await call('POST', `/properties/${P}/units`, { token: T, body: { unitNumber: '103', monthlyRent: '7000' } }));
  await call('PUT', `/units/${U3}`, { token: T, body: { unitNumber: '103', floor: '1', type: '雅房', monthlyRent: '7200' } });
  await call('PUT', `/units/${U3}`, { token: T, body: { monthlyRent: 'abc' }, expect: [400], label: '/units/:id (格式錯誤)' });
  await call('GET', `/properties/${P}/units`, { token: T });

  // ── 車主 ──
  const T1 = id(await call('POST', '/tenants', { token: T, body: { name: '車主甲', phone: '0911000001' } }));
  const T2 = id(await call('POST', '/tenants', { token: T, body: { name: '車主乙', phone: '0911000002' } }));
  await call('PUT', `/tenants/${T1}`, { token: T, body: { name: '車主甲', phone: '0911000001', email: 'a@example.com' } });
  await call('GET', '/tenants', { token: T });
  const code = (await call('POST', `/tenants/${T1}/line-code`, { token: T })).data;

  // ── 合約（表單送字串數字、押金空白、繳租日 31）──
  const start = `${ym.year - 1}-${String(ym.month).padStart(2, '0')}-01`;
  const end = `${ym.year + 1}-${String(ym.month).padStart(2, '0')}-01`;
  const C1 = id(await call('POST', '/contracts', { token: T, body: { unitId: U1, tenantId: T1, startDate: start, endDate: end, monthlyRent: '8000', depositAmount: '', rentDueDay: '5', notes: '' } }));
  const C2 = id(await call('POST', '/contracts', { token: T, body: { unitId: U2, tenantId: T2, startDate: start, endDate: end, monthlyRent: '9000', depositAmount: '18000', rentDueDay: '31' } }));
  await call('POST', '/contracts', { token: T, body: { unitId: U3, tenantId: 'nope', startDate: start, endDate: end, monthlyRent: '1' }, expect: [404], label: '/contracts (他人車主)' });
  await call('GET', '/contracts', { token: T });
  await call('PUT', `/contracts/${C1}`, { token: T, body: { monthlyRent: '8100', rentDueDay: '5', notes: '測試' } });
  const sign = await call('POST', `/contracts/${C1}/sign-invite`, { token: T });
  const signToken = sign.data?.token;
  await call('GET', `/contracts/sign/${signToken}`, { label: '/contracts/sign/:token' });
  await call('GET', `/contracts/sign/${signToken}/document`, { label: '/contracts/sign/:token/document' });
  await call('POST', `/contracts/sign/${signToken}`, { body: { signerName: '車主甲', agreed: true }, label: 'POST /contracts/sign/:token' });
  await call('POST', `/contracts/${C1}/compliance-check`, { token: T });

  // 租約書與範本
  await call('GET', `/contracts/${C2}/document`, { token: T });
  await call('PUT', `/contracts/${C2}/document`, { token: T, body: { body: '租約內容 {{tenantName}}' } });
  await call('POST', `/contracts/${C2}/document/preview`, { token: T, body: { body: '預覽 {{tenantName}}' } });
  await call('POST', `/contracts/${C2}/document/reset`, { token: T });
  await call('POST', `/contracts/${C2}/document/send`, { token: T, expect: [200, 400] });
  const tpl = id(await call('POST', '/contract-templates', { token: T, body: { name: '範本', body: '內容' } }));
  await call('PUT', `/contract-templates/${tpl}`, { token: T, body: { name: '範本2' } });
  await call('GET', '/contract-templates', { token: T });
  await call('DELETE', `/contract-templates/${tpl}`, { token: T });

  // 點交
  const H = id(await call('POST', `/contracts/${C1}/handovers`, { token: T, body: { type: 'MOVE_IN', items: [{ id: 'a', area: '客廳', description: '牆面', condition: 'GOOD', photos: [] }], note: '' } }));
  await call('GET', `/contracts/${C1}/handovers`, { token: T });
  await call('PUT', `/handovers/${H}`, { token: T, body: { note: '更新' } });
  const hs = await call('POST', `/handovers/${H}/send`, { token: T });
  await call('GET', `/handovers/confirm/${hs.data?.confirmToken}`, { label: '/handovers/confirm/:token' });
  await call('POST', `/handovers/confirm/${hs.data?.confirmToken}`, { body: { signerName: '車主甲' }, label: 'POST /handovers/confirm/:token' });

  // 押金退還
  await call('GET', `/contracts/${C2}/deposit-refund`, { token: T });
  await call('POST', `/contracts/${C2}/deposit-refund`, { token: T, body: { deductions: [{ description: '清潔', amount: 500, category: 'CLEANING' }], notes: '' } });
  await call('PUT', `/contracts/${C2}/deposit-refund/confirm`, { token: T });
  await call('POST', `/contracts/${C2}/deposit-refund/notify`, { token: T, expect: [200, 400] });

  // ── 租金 ──
  const recs = await call('GET', `/rent-records?year=${ym.year}&month=${ym.month}`, { token: T });
  const r1 = recs.data.find?.((r) => r.contractId === C1);
  const r2 = recs.data.find?.((r) => r.contractId === C2);
  const newRec = id(await call('POST', '/rent-records', { token: T, body: { contractId: C1, year: ym.year + 3, month: 2 } }));
  await call('POST', '/rent-records', { token: T, body: { contractId: C1, year: ym.year + 3, month: 2 }, expect: [409], label: '/rent-records (重複)' });
  await call('PUT', `/rent-records/${newRec}`, { token: T, body: { status: 'PAID', paidAmount: 8100, paymentMethod: '現金' } });
  await call('DELETE', `/rent-records/${newRec}`, { token: T });
  if (r1) await call('PUT', `/rent-records/${r1.id}/confirm`, { token: T, body: { paidAmount: r1.amount } });
  if (r2) await call('POST', `/rent-records/${r2.id}/remind`, { token: T, expect: [200, 400] });
  await call('POST', '/rent-records/mark-overdue', { token: T });
  await call('GET', '/rent-alerts/today?rentDaysBefore=7&elecDaysBefore=7', { token: T });
  await call('GET', `/stats/rent-electricity?year=${ym.year}`, { token: T });
  await call('GET', `/dorm-records?year=${ym.year}`, { token: T });
  await call('GET', `/dorm-records?year=${ym.year}&month=${ym.month}&unitId=${U1}`, { token: T });

  // ── 預付電費 ──
  await call('GET', '/prepaid/candidates', { token: T });
  await call('PUT', `/prepaid/${U1}/config`, { token: T, body: { prepaidEnabled: true, unitPrice: 5 } });
  await call('POST', `/prepaid/${U1}/topup`, { token: T, body: { amount: 1000, note: '儲值' } });
  await call('POST', `/prepaid/${U1}/usage`, { token: T, body: { kwh: 20 } });
  await call('POST', `/prepaid/${U1}/adjust`, { token: T, body: { amount: -50, note: '校正' } });
  const pr = await call('GET', `/prepaid/${U1}/records`, { token: T });
  const topupRec = pr.data?.records?.find((r) => r.type === 'TOPUP');
  await call('PUT', `/prepaid-records/${topupRec?.id}`, { token: T, body: { amount: 800 } });
  const after = await call('GET', `/prepaid/${U1}/records`, { token: T, label: '/prepaid/:unitId/records (重算後)' });
  const bal = after.data?.records?.[0]?.balanceAfter;
  results.push({ ok: bal === 800 - 100 - 50, method: 'CHECK', path: '預付電費餘額重算 (800-100-50=650)', status: bal, ms: 0, error: bal === 650 ? '' : `實際 ${bal}` });
  const adj = after.data?.records?.find((r) => r.type === 'ADJUST');
  await call('DELETE', `/prepaid-records/${adj?.id}`, { token: T });
  await call('GET', '/prepaid', { token: T });
  await call('POST', '/prepaid/check', { token: T });

  // ── 水電 ──
  await call('POST', '/utility-bills/preview', { token: T, body: { propertyId: P, totalAmount: 900, method: 'EVEN', inputs: [] } });
  const bill = id(await call('POST', '/utility-bills', { token: T, body: { propertyId: P, category: 'ELECTRICITY', periodStart: `${ym.year}-${String(ym.month).padStart(2, '0')}-01`, periodEnd: `${ym.year}-${String(ym.month).padStart(2, '0')}-02`, totalAmount: 900, method: 'EVEN', inputs: [] } }));
  const bills = await call('GET', '/utility-bills', { token: T });
  const allocs = bills.data?.find?.((b) => b.id === bill)?.allocations ?? [];
  await call('PUT', `/utility-bills/${bill}`, { token: T, body: { note: '改', allocations: allocs.map((a) => ({ id: a.id, amount: 300 })) } });
  await call('POST', `/utility-bills/${bill}/bill`, { token: T });
  await call('DELETE', `/utility-bills/${bill}`, { token: T });

  // ── 支出 ──
  const E = id(await call('POST', '/expenses', { token: T, body: { propertyId: P, category: 'REPAIR', amount: '1200', date: `${ym.year}-${String(ym.month).padStart(2, '0')}-01`, description: '修水管' } }));
  await call('PUT', `/expenses/${E}`, { token: T, body: { amount: '1300', description: '修水管2' } });
  await call('PUT', `/expenses/${E}/confirm`, { token: T });
  await call('GET', `/expenses?year=${ym.year}&month=${ym.month}`, { token: T });
  await call('GET', '/expenses/trend', { token: T });
  await call('DELETE', `/expenses/${E}`, { token: T });

  // ── 報修 ──
  const M = id(await call('POST', '/maintenance', { token: T, body: { unitId: U1, tenantId: T1, title: '冷氣不冷', description: '冷氣不冷', priority: 'HIGH' } }));
  await call('PUT', `/maintenance/${M}`, { token: T, body: { status: 'IN_PROGRESS', cost: '500' } });
  await call('GET', '/maintenance', { token: T });
  await call('POST', `/maintenance/${M}/analyze`, { token: T });
  await call('DELETE', `/maintenance/${M}`, { token: T });

  // ── 刊登 ──
  await call('GET', '/listings/vacant', { token: T });
  const L = id(await call('POST', `/listings/units/${U3}`, { token: T, body: { platform: '591', url: '', notes: '' } }));
  await call('PUT', `/listings/${L}`, { token: T, body: { status: 'CLOSED' } });
  await call('DELETE', `/listings/${L}`, { token: T });

  // ── 金流對帳 ──
  await call('GET', `/contracts/${C2}/virtual-account`, { token: T });
  await call('POST', '/payments/simulate', { token: T, body: { contractId: C2, amount: 1234 }, expect: [200, 403] });
  await call('GET', '/payments/unmatched', { token: T });
  // 透過虛擬帳號入帳會自動對到該合約（金額不足記為部分繳納）；已銷帳的入帳不可刪
  const all = await call('GET', '/payments', { token: T });
  const pay = (Array.isArray(all.data) ? all.data : all.data?.payments ?? []).find((x) => x.contractId === C2);
  results.push({ ok: !!pay && ['MATCHED', 'MANUAL'].includes(pay.status), method: 'CHECK', path: '虛擬帳號入帳自動銷帳', status: pay?.status ?? 'none', ms: 0, error: pay ? '' : '找不到入帳' });
  if (pay) {
    await call('GET', `/payments/${pay.id}/suggestions`, { token: T });
    await call('DELETE', `/payments/${pay.id}`, { token: T, expect: [400], label: '/payments/:id (已銷帳不可刪)' });
  }
  await call('GET', '/payments', { token: T });

  // ── 報表／分析 ──
  for (const p of ['/calendar', '/collection-workbench', '/finance-overview', '/roi', `/tax-export/precheck?year=${ym.year}`, '/rent-comps', `/units/${U1}/pricing`, '/tenant-credit', `/tenants/${T1}/credit`]) {
    await call('GET', p, { token: T });
  }
  await call('GET', `/tax-export?year=${ym.year}`, { token: T });
  await call('GET', '/dashboard', { token: T });

  // ── AI ──
  await call('POST', '/ai/assistant', { token: T, body: { messages: [{ role: 'user', content: '這個月收了多少租金？請簡短回答' }] } });
  await call('GET', '/ai/insights', { token: T });
  await call('POST', '/ai/draft-clauses', { token: T, body: { propertyType: '套房', monthlyRent: 8000, petAllowed: false, notes: '' } });

  // ── 設定／通知 ──
  await call('GET', '/settings/reminder', { token: T });
  await call('PUT', '/settings/reminder', { token: T, body: { enabled: true, daysBefore: 3, remindOnDue: true, overdueEnabled: true, overdueInterval: 3 } });
  await call('POST', '/settings/reminder/trigger', { token: T });
  await call('GET', '/notification-rules', { token: T });
  await call('PUT', '/notification-rules/RENT_DUE', { token: T, body: { enabled: true, hour: 9, minute: 0, daysBefore: [3] } });
  await call('POST', '/notification-rules/RENT_DUE/trigger', { token: T });
  await call('GET', '/line/binding', { token: T });
  await call('POST', '/line/binding/generate', { token: T });
  await call('DELETE', '/line/binding', { token: T });
  await call('GET', '/line/tenants', { token: T });

  // ── 車主端 ──
  await call('GET', '/tenant/auth/config');
  const tl = await call('POST', '/tenant/auth/login', { body: { bindingCode: code?.code ?? code?.bindingCode } });
  const TT = tl.data?.token;
  for (const p of ['/tenant/me', '/tenant/contracts', '/tenant/rent-records', '/tenant/payment-info', '/tenant/maintenance', '/tenant/handovers', '/tenant/credit']) {
    await call('GET', p, { token: TT, label: `${p} (車主)` });
  }
  await call('POST', '/tenant/maintenance', { token: TT, body: { title: '燈壞了', description: '車位燈不亮', photos: [] }, label: 'POST /tenant/maintenance (車主)' });
  await call('GET', '/properties', { token: TT, expect: [401], label: '/properties (車主 token 應被拒)' });

  // ── 員工帳號與權限 ──
  await call('GET', '/users/modules', { token: T });
  const S = id(await call('POST', '/users', { token: T, body: { email: `zz-smoke-staff-${stamp}`, password: 'staff12345', name: '員工', permissions: ['finance'] } }));
  await call('GET', '/users', { token: T });
  const ST = (await call('POST', '/auth/login', { body: { email: `zz-smoke-staff-${stamp}`, password: 'staff12345' }, label: '/auth/login (員工)' })).data?.token;
  await call('GET', '/rent-alerts/today', { token: ST, label: '/rent-alerts/today (員工有權限)' });
  await call('GET', '/dorm-records', { token: ST, label: '/dorm-records (員工有權限)' });
  await call('GET', '/properties', { token: ST, expect: [403], label: '/properties (員工無權限)' });
  await call('GET', '/users', { token: ST, expect: [403], label: '/users (員工非管理員)' });
  await call('PUT', `/users/${S}`, { token: T, body: { active: false } });
  await call('GET', '/rent-alerts/today', { token: ST, expect: [401], label: '/rent-alerts/today (員工已停用)' });
  await call('DELETE', `/users/${S}`, { token: T });

  // ── 停車位：車輛與車牌 ──
  const V1 = id(await call('POST', `/tenants/${T1}/vehicles`, { token: T, body: { plateNumber: 'abc 1234', type: 'CAR', brand: 'Toyota', color: '白' } }));
  await call('POST', `/tenants/${T2}/vehicles`, { token: T, body: { plateNumber: 'ABC1234' }, expect: [409], label: '/tenants/:id/vehicles (車牌重複)' });
  const V2 = id(await call('POST', `/tenants/${T2}/vehicles`, { token: T, body: { plateNumber: 'MKT-777', type: 'MOTORCYCLE' } }));
  await call('PUT', `/vehicles/${V2}`, { token: T, body: { color: '黑' } });
  await call('PUT', `/contracts/${C1}`, { token: T, body: { vehicleId: V1, accessCard: 'R-012', accessCardDeposit: '500' } });
  const found = await call('GET', '/vehicles?q=c123', { token: T, label: '/vehicles?q= (車牌片段、小寫)' });
  const hit = found.data?.[0];
  const okV = hit && hit.plateNumber === 'ABC1234' && hit.spaces?.[0]?.accessCard === 'R-012' && hit.spaces?.[0]?.registered;
  results.push({ ok: !!okV, method: 'CHECK', path: '車牌查詢：找到車位與遙控器', status: hit?.plateNumber ?? 'none', ms: 0, error: okV ? '' : JSON.stringify(hit).slice(0, 150) });
  const byName = await call('GET', `/vehicles?q=${encodeURIComponent('車主乙')}`, { token: T, label: '/vehicles?q= (車主姓名)' });
  results.push({ ok: byName.data?.length === 1, method: 'CHECK', path: '用車主姓名查車輛', status: byName.data?.length, ms: 0, error: '' });
  await call('PUT', `/contracts/${C1}`, { token: T, body: { vehicleId: V2 }, label: '/contracts/:id (他人車輛應被忽略)' });
  const cs = await call('GET', '/contracts', { token: T, label: '/contracts (含車輛)' });
  const c1 = cs.data?.find?.((x) => x.id === C1);
  results.push({ ok: c1?.vehicleId === null, method: 'CHECK', path: '合約不能登記別人的車', status: String(c1?.vehicleId), ms: 0, error: '' });
  await call('DELETE', `/vehicles/${V1}`, { token: T });

  // ── 連帶刪除 ──
  await call('DELETE', `/contracts/${C2}`, { token: T });
  await call('DELETE', `/tenants/${T2}`, { token: T });
  const leftV = await call('GET', '/vehicles?q=MKT', { token: T, label: '/vehicles (刪車主後)' });
  results.push({ ok: leftV.data?.length === 0, method: 'CHECK', path: '刪除車主時車輛一併刪除', status: leftV.data?.length, ms: 0, error: '' });
  await call('DELETE', `/units/${U1}`, { token: T, label: '/units/:id (有合約、電費、報修)' });
  await call('GET', '/data/summary', { token: T });
  await call('POST', '/data/wipe', { token: T, body: { password: 'bad', confirmText: '清空全部資料' }, expect: [400], label: '/data/wipe (錯誤密碼)' });
  await call('POST', '/data/wipe', { token: T, body: { password: 'smoke12345', confirmText: '清空全部資料' } });
  const sum = (await call('GET', '/data/summary', { token: T, label: '/data/summary (清空後)' })).data;
  const left = Object.values(sum ?? {}).reduce((a, b) => a + b, 0);
  results.push({ ok: left === 0, method: 'CHECK', path: '清空後資料為 0', status: left, ms: 0, error: left === 0 ? '' : JSON.stringify(sum) });

  return reg.data?.user?.id;
}

const prisma = new PrismaClient();
let userId;
try {
  userId = await main();
} catch (e) {
  results.push({ ok: false, method: 'SCRIPT', path: '測試腳本中斷', status: 0, ms: 0, error: String(e?.stack ?? e).slice(0, 300) });
} finally {
  // 清掉臨時帳號（以及萬一中斷時留下的資料）
  const users = await prisma.user.findMany({ where: { email: { startsWith: `zz-smoke-` } }, select: { id: true } });
  for (const u of users) {
    const uid = u.id;
    const props = await prisma.property.findMany({ where: { userId: uid }, select: { id: true } });
    if (props.length) console.warn('⚠️ 腳本中斷留下資料，請用 /data/wipe 清除：', uid);
    await prisma.tenant.deleteMany({ where: { userId: uid, contracts: { none: {} } } });
    await prisma.lineBinding.deleteMany({ where: { userId: uid } });
    await prisma.reminderSetting.deleteMany({ where: { userId: uid } });
    if (!props.length) await prisma.user.deleteMany({ where: { OR: [{ id: uid }, { ownerId: uid }] } });
  }
  await prisma.$disconnect();
}

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? '✅' : '❌'} ${r.method.padEnd(6)} ${r.path.padEnd(52)} ${String(r.status).padStart(4)} ${String(r.ms).padStart(6)}ms ${r.error}`);
}
console.log(`\n共 ${results.length} 項，通過 ${results.length - failed.length}，失敗 ${failed.length}`);
process.exit(failed.length ? 1 : 0);
