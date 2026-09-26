"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaymentProvider = getPaymentProvider;
const config_1 = require("../../config");
const sandboxProvider_1 = require("./sandboxProvider");
let provider = null;
// 依設定回傳啟用中的金流 provider。
// 正式串接 LINE Pay / 銀行虛擬帳號時，在此 new 對應實作即可，上層程式碼完全不變。
function getPaymentProvider() {
    if (provider)
        return provider;
    switch (config_1.config.payment.provider) {
        // case 'LINEPAY':
        //   provider = new LinePayProvider(config.payment.linePay);
        //   break;
        // case 'BANK':
        //   provider = new BankVirtualAccountProvider(...);
        //   break;
        case 'SANDBOX':
        default:
            provider = new sandboxProvider_1.SandboxProvider();
            break;
    }
    return provider;
}
__exportStar(require("./types"), exports);
