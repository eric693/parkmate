#!/bin/bash
set -e

echo "=== RentMate 啟動腳本 ==="

# Start PostgreSQL
echo "1. 啟動 PostgreSQL..."
docker-compose up -d postgres
echo "等待資料庫就緒..."
until docker exec rentmate_db pg_isready -U rentmate 2>/dev/null; do sleep 1; done
echo "PostgreSQL 已就緒"

# Backend setup
echo "2. 安裝後端依賴..."
cd backend
npm install

echo "3. 產生 Prisma client..."
npx prisma generate

echo "4. 執行資料庫 migration..."
npx prisma migrate dev --name init --skip-seed

echo "5. 填充測試資料..."
npx ts-node prisma/seed.ts

echo "6. 啟動後端 (port 3001)..."
npm run dev &
BACKEND_PID=$!
cd ..

# Frontend setup
echo "7. 安裝前端依賴..."
cd frontend
npm install

echo "8. 啟動前端 (port 5173)..."
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "=== 啟動完成 ==="
echo "前端：http://localhost:5173"
echo "後端：http://localhost:3001"
echo "測試帳號：landlord@example.com / password123"
echo ""
echo "按 Ctrl+C 停止所有服務"

wait $BACKEND_PID $FRONTEND_PID
