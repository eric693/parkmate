// 集中管理外部憑證與功能旗標。
// 目前皆未設定憑證 → 各模組自動以「沙盒/手動模式」運作，日後填入即可切換正式串接。

export const config = {
  jwtSecret: process.env.JWT_SECRET ?? 'dev_secret_change_me',

  // 對外網址（產生付款連結、LIFF 導向等用）
  appUrl: process.env.APP_URL ?? 'http://localhost:6000',

  // LINE LIFF（車主端）
  liff: {
    id: process.env.LIFF_ID ?? '',
    channelId: process.env.LINE_LOGIN_CHANNEL_ID ?? '',
    get enabled() {
      return Boolean(process.env.LIFF_ID && process.env.LINE_LOGIN_CHANNEL_ID);
    },
  },

  // 金流 provider：SANDBOX（預設，內部模擬）| LINEPAY | BANK
  payment: {
    provider: (process.env.PAYMENT_PROVIDER ?? 'SANDBOX').toUpperCase(),
    bankCode: process.env.PAYMENT_BANK_CODE ?? '013', // 預設國泰世華，正式請依合作銀行
    linePay: {
      channelId: process.env.LINEPAY_CHANNEL_ID ?? '',
      channelSecret: process.env.LINEPAY_CHANNEL_SECRET ?? '',
    },
    get isSandbox() {
      return this.provider === 'SANDBOX';
    },
  },

  // 登入頁公開顯示的示範帳號。兩者都設定才會顯示；清空即隱藏。
  demo: {
    account: (process.env.DEMO_ACCOUNT ?? '').trim().toLowerCase(),
    password: process.env.DEMO_PASSWORD ?? '',
    get enabled() {
      return Boolean(this.account && this.password);
    },
  },

  // Claude AI 助理
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8',
    get enabled() {
      return Boolean(process.env.ANTHROPIC_API_KEY);
    },
  },
};
