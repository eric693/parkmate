"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFloor = parseFloor;
exports.getUnits = getUnits;
exports.createUnit = createUnit;
exports.updateUnit = updateUnit;
exports.deleteUnit = deleteUnit;
const app_1 = require("../app");
const deletionService_1 = require("../services/deletionService");
const waitlistService_1 = require("../services/waitlistService");
const VEHICLE_KINDS = ['CAR', 'MOTORCYCLE', 'OTHER'];
const SPOT_TYPES = ['FLAT', 'MECHANICAL_UPPER', 'MECHANICAL_LOWER', 'OTHER'];
/** 樓層可輸入「B1」「b2」「-1」「3」「3F」；地下樓層存負數。空字串 = 清空。無法辨識回傳 NaN。 */
function parseFloor(v) {
    if (v === undefined)
        return undefined;
    if (v === null || v === '')
        return null;
    const t = String(v).trim().toUpperCase();
    const m = /^B(\d+)F?$/.exec(t);
    if (m)
        return -Number(m[1]);
    const n = /^(-?\d+)F?$/.exec(t);
    if (n)
        return Number(n[1]);
    return NaN;
}
/** 車位表單的規格欄位。只處理有送來的欄位（undefined = 不改）。 */
function specData(body) {
    const data = {};
    const optInt = (v) => (v === '' || v === null ? null : Math.round(Number(v)));
    const optMoney = (v) => (v === '' || v === null ? null : Number(v));
    const floor = parseFloor(body.floor);
    if (Number.isNaN(floor))
        return { data, error: '樓層格式不正確，例如 B1、1、2F' };
    if (floor !== undefined)
        data.floor = floor;
    if (body.vehicleKind !== undefined) {
        if (body.vehicleKind && !VEHICLE_KINDS.includes(body.vehicleKind))
            return { data, error: '車位車種不正確' };
        data.vehicleKind = body.vehicleKind || null;
    }
    if (body.spotType !== undefined) {
        if (body.spotType && !SPOT_TYPES.includes(body.spotType))
            return { data, error: '車位類型不正確' };
        data.spotType = body.spotType || null;
    }
    for (const k of ['maxHeightCm', 'maxWidthCm']) {
        if (body[k] === undefined)
            continue;
        const n = optInt(body[k]);
        if (n !== null && !(n > 0))
            return { data, error: '限高／限寬需大於 0' };
        data[k] = n;
    }
    for (const k of ['dailyRate', 'weeklyRate']) {
        if (body[k] === undefined)
            continue;
        const n = optMoney(body[k]);
        if (n !== null && !(n >= 0))
            return { data, error: '短租價格不正確' };
        data[k] = n;
    }
    if (typeof body.hasCharger === 'boolean')
        data.hasCharger = body.hasCharger;
    return { data };
}
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
    const { unitNumber, type, monthlyRent, description } = req.body;
    if (!unitNumber || !monthlyRent) {
        res.status(400).json({ error: '請填寫車位編號與月租金' });
        return;
    }
    const spec = specData(req.body);
    if (spec.error) {
        res.status(400).json({ error: spec.error });
        return;
    }
    const unit = await app_1.prisma.unit.create({
        data: { propertyId, unitNumber, type: type || null, monthlyRent, description, ...spec.data },
    });
    await (0, waitlistService_1.onUnitVacated)(unit.id); // 新車位一開始是空位，有人候補就通知
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
    const { unitNumber, type, monthlyRent, status, description } = req.body;
    const spec = specData(req.body);
    if (spec.error) {
        res.status(400).json({ error: spec.error });
        return;
    }
    const updated = await app_1.prisma.unit.update({
        where: { id },
        data: { unitNumber, type, monthlyRent, status, description, ...spec.data },
    });
    if (unit.status !== 'VACANT' && updated.status === 'VACANT')
        await (0, waitlistService_1.onUnitVacated)(id);
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
