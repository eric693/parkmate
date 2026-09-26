"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireAdmin = requireAdmin;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const app_1 = require("../app");
const permissions_1 = require("./permissions");
async function requireAuth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    let payload;
    try {
        payload = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
    }
    catch {
        res.status(401).json({ error: 'Invalid token' });
        return;
    }
    if (!payload.userId) {
        res.status(401).json({ error: 'Invalid token' });
        return;
    }
    const user = await app_1.prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, role: true, ownerId: true, permissions: true, active: true },
    });
    if (!user || !user.active) {
        res.status(401).json({ error: user ? '此帳號已停用' : 'Invalid token' });
        return;
    }
    req.authUserId = user.id;
    req.userId = user.role === 'STAFF' && user.ownerId ? user.ownerId : user.id;
    req.role = user.role;
    req.permissions = user.permissions;
    if (user.role === 'STAFF') {
        const module = (0, permissions_1.moduleForPath)(req.path);
        if (module && !user.permissions.includes(module)) {
            res.status(403).json({ error: '您沒有使用此功能的權限，請聯絡管理員' });
            return;
        }
    }
    next();
}
/** 僅限管理員（帳號管理） */
function requireAdmin(req, res, next) {
    if (req.role !== 'ADMIN') {
        res.status(403).json({ error: '僅管理員可執行此操作' });
        return;
    }
    next();
}
