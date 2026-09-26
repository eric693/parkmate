"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveBase64Image = saveBase64Image;
exports.saveBase64Images = saveBase64Images;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const app_1 = require("../app");
const MIME_EXT = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
};
// 接收 data URL（data:image/png;base64,xxxx），寫入 uploads/<subdir>，回傳可公開存取的相對路徑。
function saveBase64Image(dataUrl, subdir) {
    const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
    if (!match)
        return null;
    const ext = MIME_EXT[match[1]];
    if (!ext)
        return null;
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > 8 * 1024 * 1024)
        return null; // 單張上限 8MB
    const name = `${Date.now()}-${crypto_1.default.randomBytes(4).toString('hex')}.${ext}`;
    const dir = path_1.default.join(app_1.UPLOAD_DIR, subdir);
    fs_1.default.mkdirSync(dir, { recursive: true });
    fs_1.default.writeFileSync(path_1.default.join(dir, name), buf);
    return `/uploads/${subdir}/${name}`;
}
function saveBase64Images(dataUrls, subdir, max = 6) {
    return dataUrls
        .slice(0, max)
        .map((d) => saveBase64Image(d, subdir))
        .filter((p) => Boolean(p));
}
