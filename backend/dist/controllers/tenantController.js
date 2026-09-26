"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTenants = getTenants;
exports.createTenant = createTenant;
exports.updateTenant = updateTenant;
exports.deleteTenant = deleteTenant;
exports.generateTenantBindingCode = generateTenantBindingCode;
const app_1 = require("../app");
const crypto_1 = __importDefault(require("crypto"));
const deletionService_1 = require("../services/deletionService");
async function getTenants(req, res) {
    const tenants = await app_1.prisma.tenant.findMany({
        where: { userId: req.userId },
        include: {
            contracts: {
                where: { status: 'ACTIVE' },
                include: { unit: { include: { property: true } } },
                take: 1,
            },
            vehicles: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
    });
    res.json(tenants);
}
async function createTenant(req, res) {
    const { name, phone, email, idNumber, emergencyContact } = req.body;
    if (!name || !phone) {
        res.status(400).json({ error: '請填寫姓名與電話' });
        return;
    }
    const tenant = await app_1.prisma.tenant.create({
        data: { userId: req.userId, name, phone, email, idNumber, emergencyContact },
    });
    res.status(201).json(tenant);
}
async function updateTenant(req, res) {
    const { id } = req.params;
    const tenant = await app_1.prisma.tenant.findFirst({ where: { id, userId: req.userId } });
    if (!tenant) {
        res.status(404).json({ error: '找不到車主' });
        return;
    }
    const { name, phone, email, idNumber, emergencyContact } = req.body;
    const updated = await app_1.prisma.tenant.update({
        where: { id },
        data: { name, phone, email, idNumber, emergencyContact },
    });
    res.json(updated);
}
async function deleteTenant(req, res) {
    const { id } = req.params;
    const tenant = await app_1.prisma.tenant.findFirst({ where: { id, userId: req.userId } });
    if (!tenant) {
        res.status(404).json({ error: '找不到車主' });
        return;
    }
    await (0, deletionService_1.removeTenant)(id); // 連同該車主的合約與租金單
    res.json({ success: true });
}
async function generateTenantBindingCode(req, res) {
    const { id } = req.params;
    const tenant = await app_1.prisma.tenant.findFirst({ where: { id, userId: req.userId } });
    if (!tenant) {
        res.status(404).json({ error: '找不到車主' });
        return;
    }
    const code = crypto_1.default.randomBytes(4).toString('hex').toUpperCase();
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await app_1.prisma.tenant.update({
        where: { id },
        data: { lineBindingCode: code, lineBindingCodeExpiry: expiry },
    });
    res.json({ code, expiry });
}
