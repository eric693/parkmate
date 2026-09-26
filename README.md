# ParkMate 微停 — 停車位月租管理平台

以 RentMate 為模板的**停車場月租**版本：停車場 → 車位 → 車主 → 月租合約。

- 正式網址：https://partmate.crownai.ink（後端 port 3005，同時提供前端頁面）
- 資料庫：PostgreSQL `parkmate`
- pm2：`parkmate`
- 新增功能：車輛／車牌管理、車牌查詢（車主、車位、遙控器、繳費狀態）、合約登記車輛與遙控器／感應卡（押金、歸還）
- 隱藏住宅功能：水電帳單、預付電費、租金行情、點交、住宅法規合規檢查（開關在 frontend/src/lib/features.ts）

部署：`cd backend && npx tsc && pm2 restart parkmate`；前端 `cd frontend && npm run build`。
全系統測試：`cd backend && API=http://localhost:3005/api npm run test:smoke`

---

# RentMate 微租 — 租屋管理平台

專為房東打造的租屋管理平台，整合收租追蹤、逾期提醒、報修紀錄、合約到期通知與 LINE Bot 通知。

## 功能

- **概覽 Dashboard** — 本月收租進度、6個月趨勢圖、入住率、待處理報修
- **房務管理** — 物業/房間 CRUD、租客建檔、合約新增與終止
- **帳務管理** — 確認收款、水電費帳單、支出分類、趨勢圖
- **報修管理** — 報修單建立、狀態追蹤（待處理→處理中→已完成）
- **設定** — 房東 LINE 綁定、租客 LINE 邀請碼
- **LINE Bot 自動通知**
  - 每月1日：自動產生租金記錄並發送繳費提醒給租客
  - 到期前3天：催繳提醒給租客
  - 逾期第1/3/7/14/30天：通知房東與租客
  - 合約到期前30/14/7天：提醒房東與租客
  - 新報修：即時通知房東

## 快速啟動

### 前置需求
- Node.js 18+
- PostgreSQL（或 Docker）

### 使用現有 PostgreSQL
```bash
# 建立資料庫
sudo -u postgres psql -c "CREATE USER rentmate WITH PASSWORD 'rentmate123' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE rentmate OWNER rentmate;"

# 後端
cd backend
npm install
npx prisma migrate dev --name init
npx ts-node prisma/seed.ts    # 填充示範資料
npm run dev                   # port 3001

# 前端（另開終端）
cd frontend
npm install
npm run dev                   # port 5173
```

### 使用 Docker（PostgreSQL）
```bash
docker compose up -d postgres   # 使用 port 5433（避免衝突）
cd backend && npm install && ...
```

## 測試帳號
- Email: `landlord@example.com`
- 密碼: `password123`

## LINE Bot 設定

1. 前往 [LINE Developers](https://developers.line.biz) 建立 Messaging API Channel
2. 在 `backend/.env` 填入：
   ```
   LINE_CHANNEL_SECRET=your_channel_secret
   LINE_CHANNEL_ACCESS_TOKEN=your_access_token
   LINE_BOT_WEBHOOK_URL=https://your-domain.com/api/line/webhook
   ```
3. 使用 [ngrok](https://ngrok.com) 做本機開發：
   ```bash
   ngrok http 3001
   # 複製 HTTPS URL 填入 LINE webhook 設定
   ```
4. 在 LINE Developers Console 設定 Webhook URL：`https://xxx.ngrok.io/api/line/webhook`
5. 在 RentMate 設定頁面產生綁定碼，傳送至 LINE Bot 完成綁定

## 技術架構

```
RentMate/
├── backend/           # Express + TypeScript + Prisma
│   ├── src/
│   │   ├── controllers/   # API controllers
│   │   ├── routes/        # API routes
│   │   ├── services/      # LINE Bot service
│   │   ├── jobs/          # Cron jobs (自動提醒)
│   │   └── app.ts
│   └── prisma/
│       └── schema.prisma  # 資料庫 schema
└── frontend/          # React + Vite + TypeScript + Tailwind
    └── src/
        ├── pages/         # Dashboard, Properties, Finance, Maintenance, Settings
        ├── components/    # Layout, Sidebar
        └── context/       # Auth context
```
