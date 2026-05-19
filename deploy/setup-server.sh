#!/bin/bash
echo "🔧 开始安装服务器环境..."

# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装MongoDB
sudo apt-get install -y mongodb
sudo systemctl start mongodb
sudo systemctl enable mongodb

# 安装Nginx
sudo apt-get install -y nginx

# 安装PM2
sudo npm install -g pm2

# 安装Git
sudo apt-get install -y git

# 安装构建工具
sudo apt-get install -y build-essential

echo "✅ 服务器环境安装完成"
node --version
npm --version
mongod --version
