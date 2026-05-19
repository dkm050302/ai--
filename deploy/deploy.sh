#!/bin/bash
set -e

SERVER_IP="43.138.229.56"
PROJECT_DIR="/var/www/goldpilot"
REPO_URL="https://github.com/dkm050302/ai--.git"

echo "🚀 开始部署 GoldPilot..."

# 拉取代码
if [ -d "$PROJECT_DIR" ]; then
  echo "📁 项目目录已存在，拉取最新代码..."
  cd $PROJECT_DIR
  git pull
else
  echo "📁 克隆代码仓库..."
  sudo mkdir -p $PROJECT_DIR
  sudo chown $USER:$USER $PROJECT_DIR
  git clone $REPO_URL $PROJECT_DIR
  cd $PROJECT_DIR
fi

# 部署后端
echo "📦 部署后端..."
cd $PROJECT_DIR/goldpilot-backend
npm install --production
cp .env.production .env

# 编译TypeScript
npm run build

# 使用PM2启动后端
pm2 delete goldpilot-backend 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup

# 部署前端
echo "📦 部署前端..."
cd $PROJECT_DIR/goldpilot-frontend
npm install
cp .env.production .env
npm run build

# 配置Nginx
echo "⚙️  配置Nginx..."
sudo tee /etc/nginx/sites-available/goldpilot > /dev/null <<EOF
server {
    listen 80;
    server_name $SERVER_IP _;

    # 前端静态文件
    location / {
        root $PROJECT_DIR/goldpilot-frontend/dist;
        index index.html;
        try_files \\\$uri \\\$uri/ /index.html;
    }

    # API代理
    location /api {
        proxy_pass http://localhost:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\\$host;
        proxy_cache_bypass \\\$http_upgrade;
    }

    # WebSocket代理
    location /socket.io/ {
        proxy_pass http://localhost:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\\$host;
        proxy_cache_bypass \\\$http_upgrade;
    }
}
EOF

# 删除默认站点（避免冲突）
sudo rm -f /etc/nginx/sites-enabled/default

# 启用站点
sudo ln -sf /etc/nginx/sites-available/goldpilot /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

echo "✅ 部署完成！"
echo "📍 访问地址: http://$SERVER_IP"
echo ""
echo "查看服务状态:"
echo "  pm2 list"
echo "  pm2 logs goldpilot-backend"
echo "  sudo tail -f /var/log/nginx/error.log"
