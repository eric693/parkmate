"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVacantUnits = getVacantUnits;
exports.addListing = addListing;
exports.updateListing = updateListing;
exports.deleteListing = deleteListing;
const app_1 = require("../app");
async function getVacantUnits(req, res) {
    const properties = await app_1.prisma.property.findMany({
        where: { userId: req.userId },
        include: {
            units: {
                where: { status: 'VACANT' },
                include: { listings: { orderBy: { listedAt: 'desc' } } },
            },
        },
    });
    const units = properties.flatMap((p) => p.units.map((u) => ({
        ...u,
        propertyName: p.name,
        propertyAddress: p.address,
    })));
    res.json(units);
}
async function addListing(req, res) {
    const { unitId } = req.params;
    const unit = await app_1.prisma.unit.findFirst({
        where: { id: unitId, property: { userId: req.userId } },
    });
    if (!unit) {
        res.status(404).json({ error: '找不到車位' });
        return;
    }
    const { platform, url, notes, expiresAt } = req.body;
    if (!platform) {
        res.status(400).json({ error: '請選擇刊登平台' });
        return;
    }
    const listing = await app_1.prisma.listingRecord.create({
        data: {
            unitId,
            platform,
            url: url || null,
            notes: notes || null,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            status: 'ACTIVE',
        },
    });
    res.status(201).json(listing);
}
async function updateListing(req, res) {
    const { id } = req.params;
    const listing = await app_1.prisma.listingRecord.findFirst({
        where: { id, unit: { property: { userId: req.userId } } },
    });
    if (!listing) {
        res.status(404).json({ error: '找不到刊登紀錄' });
        return;
    }
    const updated = await app_1.prisma.listingRecord.update({
        where: { id },
        data: {
            status: req.body.status ?? listing.status,
            url: req.body.url ?? listing.url,
            notes: req.body.notes ?? listing.notes,
        },
    });
    res.json(updated);
}
async function deleteListing(req, res) {
    const { id } = req.params;
    const listing = await app_1.prisma.listingRecord.findFirst({
        where: { id, unit: { property: { userId: req.userId } } },
    });
    if (!listing) {
        res.status(404).json({ error: '找不到刊登紀錄' });
        return;
    }
    await app_1.prisma.listingRecord.delete({ where: { id } });
    res.json({ ok: true });
}
