// 金流抽象介面：所有 provider（沙盒 / LINE Pay / 銀行虛擬帳號）共用同一份合約，
// 上層的對帳邏輯不需要知道底層是誰。日後接正式金流只要新增一個實作並切換 PAYMENT_PROVIDER。

export interface VirtualAccountInfo {
  bankCode: string;
  accountNumber: string;
  provider: string;
}

// provider 解析完 webhook 原始資料後，回傳的標準化入帳事件
export interface NormalizedPayment {
  accountNumber: string;       // 收款的虛擬帳號（對帳關鍵）
  amount: number;              // 入帳金額
  paidAt: Date;                // 入帳時間
  providerTxnId: string;       // provider 端唯一交易序號（用於冪等，避免重複入帳）
  payerName?: string;
  raw: unknown;                // 原始 payload，存檔備查
}

export interface PaymentProvider {
  readonly name: string;

  // 為某張合約產生專屬虛擬帳號
  generateVirtualAccount(contractId: string): Promise<VirtualAccountInfo>;

  // 將 provider 的 webhook 原始 payload 標準化為 NormalizedPayment
  // 回傳 null 代表無法解析（非入帳事件）
  parseWebhook(payload: unknown): NormalizedPayment | null;

  // 驗證 webhook 來源簽章（沙盒永遠回 true）
  verifyWebhook(payload: unknown, headers: Record<string, string | undefined>): boolean;
}
