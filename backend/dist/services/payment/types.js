"use strict";
// 金流抽象介面：所有 provider（沙盒 / LINE Pay / 銀行虛擬帳號）共用同一份合約，
// 上層的對帳邏輯不需要知道底層是誰。日後接正式金流只要新增一個實作並切換 PAYMENT_PROVIDER。
Object.defineProperty(exports, "__esModule", { value: true });
