import crypto from 'crypto';
import { config } from '../../config';
import { NormalizedPayment, PaymentProvider, VirtualAccountInfo } from './types';

// 沙盒金流：虛擬帳號由內部演算法產生（穩定、唯一），入帳事件由模擬 API 觸發。
// 行為與正式金流一致，方便完整測試自動對帳流程，正式上線時換成真實 provider 即可。
export class SandboxProvider implements PaymentProvider {
  readonly name = 'SANDBOX';

  async generateVirtualAccount(contractId: string): Promise<VirtualAccountInfo> {
    // 由合約 id 衍生穩定的 14 碼帳號（同一合約永遠拿到同一組）
    const digest = crypto.createHash('sha256').update(contractId).digest('hex');
    const num = (BigInt('0x' + digest.slice(0, 16)) % 100000000000000n)
      .toString()
      .padStart(14, '0');
    return {
      bankCode: config.payment.bankCode,
      accountNumber: num,
      provider: this.name,
    };
  }

  parseWebhook(payload: unknown): NormalizedPayment | null {
    const p = payload as any;
    if (!p || !p.accountNumber || p.amount == null) return null;
    return {
      accountNumber: String(p.accountNumber),
      amount: Number(p.amount),
      paidAt: p.paidAt ? new Date(p.paidAt) : new Date(),
      providerTxnId: String(p.providerTxnId ?? `SBX-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`),
      payerName: p.payerName ? String(p.payerName) : undefined,
      raw: payload,
    };
  }

  verifyWebhook(): boolean {
    return true; // 沙盒不驗章
  }
}
