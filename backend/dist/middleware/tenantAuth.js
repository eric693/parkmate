"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireTenant = requireTenant;
exports.signTenantToken = signTenantToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
// 車主端 JWT 與業者端分開：payload 帶 kind='tenant'，避免業者 token 能存取車主 API（反之亦然）。
function requireTenant(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret);
        if (payload.kind !== 'tenant') {
            res.status(401).json({ error: 'Invalid token' });
            return;
        }
        req.tenantId = payload.tenantId;
        next();
    }
    catch {
        res.status(401).json({ error: 'Invalid token' });
    }
}
function signTenantToken(tenantId) {
    return jsonwebtoken_1.default.sign({ tenantId, kind: 'tenant' }, config_1.config.jwtSecret, { expiresIn: '30d' });
}
