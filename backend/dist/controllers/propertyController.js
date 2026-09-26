"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProperties = getProperties;
exports.createProperty = createProperty;
exports.updateProperty = updateProperty;
exports.deleteProperty = deleteProperty;
const app_1 = require("../app");
const deletionService_1 = require("../services/deletionService");
async function getProperties(req, res) {
    const properties = await app_1.prisma.property.findMany({
        where: { userId: req.userId },
        include: {
            units: {
                include: {
                    contracts: {
                        where: { status: 'ACTIVE' },
                        include: { tenant: true },
                        take: 1,
                    },
                },
            },
        },
    });
    res.json(properties);
}
async function createProperty(req, res) {
    const { name, address, description, purchasePrice } = req.body;
    if (!name || !address) {
        res.status(400).json({ error: '請填寫名稱與地址' });
        return;
    }
    const property = await app_1.prisma.property.create({
        data: {
            userId: req.userId,
            name,
            address,
            description,
            purchasePrice: purchasePrice ? Number(purchasePrice) : null,
        },
    });
    res.status(201).json(property);
}
async function updateProperty(req, res) {
    const { id } = req.params;
    const { name, address, description, purchasePrice } = req.body;
    const property = await app_1.prisma.property.findFirst({ where: { id, userId: req.userId } });
    if (!property) {
        res.status(404).json({ error: '找不到停車場' });
        return;
    }
    const updated = await app_1.prisma.property.update({
        where: { id },
        data: {
            name,
            address,
            description,
            purchasePrice: purchasePrice !== undefined
                ? (purchasePrice ? Number(purchasePrice) : null)
                : undefined,
        },
    });
    res.json(updated);
}
async function deleteProperty(req, res) {
    const { id } = req.params;
    const property = await app_1.prisma.property.findFirst({ where: { id, userId: req.userId } });
    if (!property) {
        res.status(404).json({ error: '找不到停車場' });
        return;
    }
    await (0, deletionService_1.removeProperty)(id); // 連同車位、合約、租金單、支出、水電帳單
    res.json({ success: true });
}
