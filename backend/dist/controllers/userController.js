"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listModules = listModules;
exports.listUsers = listUsers;
exports.createUser = createUser;
exports.updateUser = updateUser;
exports.deleteUser = deleteUser;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const app_1 = require("../app");
const permissions_1 = require("../middleware/permissions");
const authController_1 = require("./authController");
const userSelect = {
    id: true, email: true, name: true, role: true, permissions: true, active: true, lastLoginAt: true, createdAt: true,
};
async function accountTaken(account, exceptId) {
    return app_1.prisma.user.findFirst({
        where: { email: { equals: account, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
}
function listModules(_req, res) {
    res.json(permissions_1.MODULES);
}
async function listUsers(req, res) {
    const [self, staff] = await Promise.all([
        app_1.prisma.user.findUnique({ where: { id: req.authUserId }, select: userSelect }),
        app_1.prisma.user.findMany({ where: { ownerId: req.authUserId }, select: userSelect, orderBy: { createdAt: 'asc' } }),
    ]);
    res.json({ self, staff });
}
async function createUser(req, res) {
    const account = (0, authController_1.normalizeAccount)(req.body.email ?? req.body.account);
    const { password, name, permissions } = req.body;
    if (!account || !password || !name) {
        res.status(400).json({ error: '請填寫帳號、密碼與姓名' });
        return;
    }
    if (account.length < 3) {
        res.status(400).json({ error: '帳號至少 3 個字' });
        return;
    }
    if (String(password).length < 6) {
        res.status(400).json({ error: '密碼至少 6 碼' });
        return;
    }
    if (await accountTaken(account)) {
        res.status(409).json({ error: '此帳號已被使用' });
        return;
    }
    const user = await app_1.prisma.user.create({
        data: {
            email: account,
            password: await bcryptjs_1.default.hash(String(password), 10),
            name,
            role: 'STAFF',
            ownerId: req.authUserId,
            permissions: (0, permissions_1.sanitizePermissions)(permissions),
        },
        select: userSelect,
    });
    res.status(201).json(user);
}
/** 編輯員工：帳號、姓名、權限、啟用狀態、重設密碼 */
async function updateUser(req, res) {
    const target = await app_1.prisma.user.findFirst({ where: { id: req.params.id, ownerId: req.authUserId } });
    if (!target) {
        res.status(404).json({ error: '找不到帳號' });
        return;
    }
    const { name, permissions, password, active } = req.body;
    const account = req.body.email !== undefined ? (0, authController_1.normalizeAccount)(req.body.email) : undefined;
    if (account !== undefined) {
        if (account.length < 3) {
            res.status(400).json({ error: '帳號至少 3 個字' });
            return;
        }
        if (await accountTaken(account, target.id)) {
            res.status(409).json({ error: '此帳號已被使用' });
            return;
        }
    }
    if (password && String(password).length < 6) {
        res.status(400).json({ error: '密碼至少 6 碼' });
        return;
    }
    const updated = await app_1.prisma.user.update({
        where: { id: target.id },
        data: {
            email: account || undefined,
            name: name || undefined,
            permissions: permissions !== undefined ? (0, permissions_1.sanitizePermissions)(permissions) : undefined,
            active: typeof active === 'boolean' ? active : undefined,
            password: password ? await bcryptjs_1.default.hash(String(password), 10) : undefined,
        },
        select: userSelect,
    });
    res.json(updated);
}
async function deleteUser(req, res) {
    const target = await app_1.prisma.user.findFirst({ where: { id: req.params.id, ownerId: req.authUserId } });
    if (!target) {
        res.status(404).json({ error: '找不到帳號' });
        return;
    }
    await app_1.prisma.user.delete({ where: { id: target.id } });
    res.json({ ok: true });
}
