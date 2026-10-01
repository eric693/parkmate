// 模組權限：員工（STAFF）只能呼叫有權限模組的 API。管理員不受限。

export const MODULES = [
  { key: 'dashboard', label: '總覽' },
  { key: 'properties', label: '車位與候補名單' },
  { key: 'tenants', label: '車主與車牌' },
  { key: 'contracts', label: '合約' },
  { key: 'finance', label: '帳務（月租收費、紀錄、統計、鈴聲）' },
  { key: 'maintenance', label: '報修' },
  { key: 'listings', label: '空位刊登' },
  { key: 'roi', label: '投報分析' },
  { key: 'settings', label: '設定（通知、LINE 綁定）' },
] as const;

export const MODULE_KEYS: string[] = MODULES.map((m) => m.key);

/**
 * API 路徑前綴 → 模組。依序比對，先中先贏（較長、較特定的放前面）。
 * 沒列到的路徑（例如 /auth/me）只要登入即可。
 */
const PATH_MODULES: [RegExp, string][] = [
  [/^\/dashboard/, 'dashboard'],
  [/^\/calendar/, 'dashboard'],
  [/^\/units\/[^/]+\/pricing/, 'market'],
  [/^\/(properties|units|waitlist)/, 'properties'],
  [/^\/tenants\/[^/]+\/credit/, 'tenants'],
  [/^\/(tenants|tenant-credit|line\/tenants|vehicles)/, 'tenants'],
  [/^\/(contracts|handovers|contract-templates)/, 'contracts'],
  [/^\/(rent-records|rent-alerts|stats|dorm-records|collection-workbench|finance-overview|utility-bills|expenses|payments|prepaid|prepaid-records|tax-export|ai)/, 'finance'],
  [/^\/maintenance/, 'maintenance'],
  [/^\/listings/, 'listings'],
  [/^\/roi/, 'roi'],
  [/^\/rent-comps/, 'market'],
  [/^\/(settings|notification-rules|line\/binding)/, 'settings'],
];

export function moduleForPath(path: string): string | null {
  for (const [re, key] of PATH_MODULES) if (re.test(path)) return key;
  return null;
}

export function sanitizePermissions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((k): k is string => typeof k === 'string' && MODULE_KEYS.includes(k)))];
}
