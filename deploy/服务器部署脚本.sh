#!/bin/bash
# 服务器部署脚本 - 解决 GitHub TLS 问题
# 在服务器上执行此脚本

set -e

echo "========================================"
echo "  GoldPilot 部署脚本"
echo "========================================"
echo ""

# 切换到项目目录
cd /var/www/goldpilot

# 配置 git 使用 http 而不是 https（解决 TLS 问题）
echo "📝 配置 Git..."
git config --global http.sslVerify false

# 尝试拉取代码
echo "📥 拉取代码..."
if git pull origin main; then
    echo "✅ 代码拉取成功"
else
    echo "⚠️  git pull 失败，尝试手动同步..."
    # 如果 git pull 失败，需要手动处理
    echo "请在服务器上手动执行："
    echo "  cd /var/www/goldpilot"
    echo "  git fetch --all"
    echo "  git reset --hard origin/main"
    exit 1
fi

# 构建前端
echo "🔨 构建前端..."
cd goldpilot-frontend
npm install
npm run build

# 重启服务
echo "🔄 重启服务..."
pm2 restart all
sudo nginx -s reload

echo ""
echo "========================================"
echo "  ✅ 部署完成！"
echo "  访问地址: http://43.138.229.56"
echo "========================================"
