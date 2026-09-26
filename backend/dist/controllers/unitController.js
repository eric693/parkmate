"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUnits = getUnits;
exports.createUnit = createUnit;
exports.updateUnit = updateUnit;
exports.deleteUnit = deleteUnit;
const app_1 = require("../app");
const deletionService_1 = require("../services/deletionService");
async function getUnits(req, res) {
    const { propertyId } = req.params;
    const property = await app_1.prisma.property.findFirst({ where: { id: propertyId, userId: req.userId } });
    if (!property) {
        res.status(404).json({ error: '找不到停車場' });
        return;
    }
    const units = await app_1.prisma.unit.findMany({
        where: { propertyId },
        include: {
            contracts: {
                where: { status: 'ACTIVE' },
                include: { tenant: true },
                take: 1,
            },
            maintenanceRequests: {
                where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
                take: 3,
            },
        },
        orderBy: [{ floor: 'asc' }, { unitNumber: 'asc' }],
    });
    res.json(units);
}
async function createUnit(req, res) {
    const { propertyId } = req.params;
    const property = await app_1.prisma.property.findFirst({ where: { id: propertyId, userId: req.userId } });
    if (!property) {
        res.status(404).json({ error: '找不到停車場' });
        return;
    }
    const { unitNumber, floor, type, monthlyRent, description } = req.body;
    if (!unitNumber || !monthlyRent) {
        res.status(400).json({ error: '請填寫車位編號與月租金' });
        return;
    }
    const unit = await app_1.prisma.unit.create({
        data: { propertyId, unitNumber, floor: floor ? Number(floor) : null, type, monthlyRent, description },
    });
    res.status(201).json(unit);
}
async function updateUnit(req, res) {
    const { id } = req.params;
    const unit = await app_1.prisma.unit.findFirst({
        where: { id },
        include: { property: true },
    });
    if (!unit || unit.property.userId !== req.userId) {
        res.status(404).json({ error: '找不到車位' });
        return;
    }
    const { unitNumber, floor, type, monthlyRent, status, description } = req.body;
    const updated = await app_1.prisma.unit.update({
        where: { id },
        data: { unitNumber, floor: floor ? Number(floor) : undefined, type, monthlyRent, status, description },
    });
    res.json(updated);
}
async function deleteUnit(req, res) {
    const { id } = req.params;
    const unit = await app_1.prisma.unit.findFirst({ where: { id }, include: { property: true } });
    if (!unit || unit.property.userId !== req.userId) {
        res.status(404).json({ error: '找不到車位' });
        return;
    }
    await (0, deletionService_1.removeUnit)(id); // 連同合約、租金單、報修、支出、水電分攤、預付電表紀錄
    res.json({ success: true });
}
