#!/bin/bash
set -e

echo "========================================"
echo "   GoldPilot 快速部署"
echo "========================================"

SERVER="root@43.138.229.56"
PROJECT_DIR="/var/www/goldpilot"

echo "📦 构建前端..."
cd goldpilot-frontend
npm run build

echo "📤 上传到服务器..."
# 上传前端构建文件
ssh $SERVER "mkdir -p $PROJECT_DIR/goldpilot-frontend"
scp -r dist/* $SERVER:$PROJECT_DIR/goldpilot-frontend/

# 重启后端
ssh $SERVER "cd $PROJECT_DIR/goldpilot-backend && pm2 restart goldpilot-backend || pm2 start ecosystem.config.js"

# 重载Nginx
ssh $SERVER "sudo nginx -s reload"

echo ""
echo "✅ 部署完成！"
echo "🌐 访问地址: http://43.138.229.56"
