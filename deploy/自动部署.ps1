# GoldPilot 自动部署脚本

$SERVER = "43.138.229.56"
$USER = "ubuntu"
$REPO = "git@github.com:dkm050302/ai--.git"
$PROJECT_DIR = "/var/www/goldpilot"

Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "   GoldPilot 自动部署"  -ForegroundColor Cyan
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host ""

# 检查SSH连接
Write-Host "正在检查SSH连接..."  -ForegroundColor Yellow
$result = ssh "$USER@$SERVER" "echo '连接成功'" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ SSH连接成功"  -ForegroundColor Green
} else {
    Write-Host "❌ SSH连接失败，请检查SSH密钥配置"  -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "开始部署..."  -ForegroundColor Cyan
Write-Host ""

# 第1步：更新代码
Write-Host "[1/5] 更新代码..."  -ForegroundColor Yellow
ssh "$USER@$SERVER" "cd $PROJECT_DIR && git pull" 2>&1 | Select-String -Pattern "Cloning|Updating|Already up"
Write-Host "✅ 代码更新完成"  -ForegroundColor Green

# 第2步：部署后端
Write-Host "[2/5] 部署后端..."  -ForegroundColor Yellow
ssh "$USER@$SERVER" "cd $PROJECT_DIR/goldpilot-backend && npm install 2>&1 | Select-String -Pattern 'added|audited'" 2>&1 | Out-Null
ssh "$USER@$SERVER" "cp $PROJECT_DIR/goldpilot-backend/.env.production $PROJECT_DIR/goldpilot-backend/.env" 2>&1 | Out-Null
ssh "$USER@$SERVER" "cd $PROJECT_DIR/goldpilot-backend && npm run build" 2>&1 | Select-String -Pattern "built|error" -CaseSensitive
Write-Host "✅ 后端部署完成"  -ForegroundColor Green

# 第3步：部署前端
Write-Host "[3/5] 部署前端..."  -ForegroundColor Yellow
ssh "$USER@$SERVER" "cd $PROJECT_DIR/goldpilot-frontend && npm install 2>&1 | Select-String -Pattern 'added|audited'" 2>&1 | Out-Null
ssh "$USER@$SERVER" "cp $PROJECT_DIR/goldpilot-frontend/.env.production $PROJECT_DIR/goldpilot-frontend/.env" 2>&1 | Out-Null
ssh "$USER@$SERVER" "cd $PROJECT_DIR/goldpilot-frontend && npm run build" 2>&1 | Select-String -Pattern "built|error" -CaseSensitive
Write-Host "✅ 前端部署完成"  -ForegroundColor Green

# 第4步：启动后端服务
Write-Host "[4/5] 启动服务..."  -ForegroundColor Yellow
ssh "$USER@$SERVER" "pm2 delete goldpilot-backend 2>/dev/null | true; pm2 start $PROJECT_DIR/goldpilot-backend/ecosystem.config.js --env production && pm2 save" 2>&1 | Select-String -Pattern "online|started"
Write-Host "✅ 服务启动完成"  -ForegroundColor Green

# 第5步：配置Nginx
Write-Host "[5/5] 配置Nginx..."  -ForegroundColor Yellow
$nginxConfig = @"
server {
    listen 80;
    server_name $SERVER _;

    location / {
        root $PROJECT_DIR/goldpilot-frontend/dist;
        index index.html;
        try_files `$$uri `$$uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade `$$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host `$$host;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade `$$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host `$$host;
    }
}
"@

$nginxConfig | ssh "$USER@$SERVER" "sudo tee /etc/nginx/sites-available/goldpilot > /dev/null"
ssh "$USER@$SERVER" "sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null | true"
ssh "$USER@$SERVER" "sudo ln -sf /etc/nginx/sites-available/goldpilot /etc/nginx/sites-enabled/"
ssh "$USER@$SERVER" "sudo nginx -t && sudo systemctl reload nginx" 2>&1 | Select-String -Pattern "test|successful"
Write-Host "✅ Nginx配置完成"  -ForegroundColor Green

Write-Host ""
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "   🎉 部署完成！"  -ForegroundColor Green
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host ""
Write-Host "📍 访问地址: http://$SERVER"  -ForegroundColor Yellow
Write-Host ""
Write-Host "查看服务状态："  -ForegroundColor Gray
Write-Host "   pm2 list"  -ForegroundColor Gray
Write-Host "   pm2 logs goldpilot-backend"  -ForegroundColor Gray
Write-Host ""
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "   部署完成！访问地址: http://43.138.229.56"  -ForegroundColor Green
Write-Host "========================================"  -ForegroundColor Cyan

# 自动打开浏览器
$url = "http://" + $SERVER
Start-Process $url
