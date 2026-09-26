import { config } from '../../config';
import { PaymentProvider } from './types';
import { SandboxProvider } from './sandboxProvider';

let provider: PaymentProvider | null = null;

// 依設定回傳啟用中的金流 provider。
// 正式串接 LINE Pay / 銀行虛擬帳號時，在此 new 對應實作即可，上層程式碼完全不變。
export function getPaymentProvider(): PaymentProvider {
  if (provider) return provider;

  switch (config.payment.provider) {
    // case 'LINEPAY':
    //   provider = new LinePayProvider(config.payment.linePay);
    //   break;
    // case 'BANK':
    //   provider = new BankVirtualAccountProvider(...);
    //   break;
    case 'SANDBOX':
    default:
      provider = new SandboxProvider();
      break;
  }
  return provider;
}

export * from './types';
