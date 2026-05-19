# GoldPilot Auto Deployment Script v2
$ErrorActionPreference = "Stop"

$SERVER = "43.138.229.56"
$USER = "ubuntu"
$PROJECT_DIR = "/var/www/goldpilot"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   GoldPilot Auto Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check SSH connection
Write-Host "Checking SSH connection..." -ForegroundColor Yellow
ssh "$USER@$SERVER" "echo 'Connected'" 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "SSH connection successful" -ForegroundColor Green
} else {
    Write-Host "SSH connection failed" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Starting deployment..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Update code
Write-Host "[1/5] Updating code..." -ForegroundColor Yellow
ssh "$USER@$SERVER" "cd $PROJECT_DIR && git pull" 2>&1 | Out-Null
Write-Host "Code updated" -ForegroundColor Green

# Step 2: Deploy backend
Write-Host "[2/5] Deploying backend..." -ForegroundColor Yellow
Write-Host "  Installing dependencies..." -ForegroundColor Gray
ssh "$USER@$SERVER" "cd $PROJECT_DIR/goldpilot-backend && npm install 2>&1" | Out-Null
Write-Host "  Copying env file..." -ForegroundColor Gray
ssh "$USER@$SERVER" "cp $PROJECT_DIR/goldpilot-backend/.env.production $PROJECT_DIR/goldpilot-backend/.env" 2>&1 | Out-Null
Write-Host "  Building..." -ForegroundColor Gray
ssh "$USER@$SERVER" "cd $PROJECT_DIR/goldpilot-backend && npm run build" 2>&1 | Out-Null
Write-Host "Backend deployed" -ForegroundColor Green

# Step 3: Deploy frontend
Write-Host "[3/5] Deploying frontend..." -ForegroundColor Yellow
Write-Host "  Installing dependencies..." -ForegroundColor Gray
ssh "$USER@$SERVER" "cd $PROJECT_DIR/goldpilot-frontend && npm install 2>&1" | Out-Null
Write-Host "  Copying env file..." -ForegroundColor Gray
ssh "$USER@$SERVER" "cp $PROJECT_DIR/goldpilot-frontend/.env.production $PROJECT_DIR/goldpilot-frontend/.env" 2>&1 | Out-Null
Write-Host "  Building..." -ForegroundColor Gray
ssh "$USER@$SERVER" "cd $PROJECT_DIR/goldpilot-frontend && npm run build" 2>&1 | Out-Null
Write-Host "Frontend deployed" -ForegroundColor Green

# Step 4: Start service
Write-Host "[4/5] Starting service..." -ForegroundColor Yellow
ssh "$USER@$SERVER" "pm2 delete goldpilot-backend 2>/dev/null; pm2 start $PROJECT_DIR/goldpilot-backend/ecosystem.config.js --env production && pm2 save" 2>&1 | Out-Null
Write-Host "Service started" -ForegroundColor Green

# Step 5: Configure Nginx
Write-Host "[5/5] Configuring Nginx..." -ForegroundColor Yellow
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

$nginxConfig | ssh "$USER@$SERVER" "sudo tee /etc/nginx/sites-available/goldpilot > /dev/null" 2>&1 | Out-Null
ssh "$USER@$SERVER" "sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null" 2>&1 | Out-Null
ssh "$USER@$SERVER" "sudo ln -sf /etc/nginx/sites-available/goldpilot /etc/nginx/sites-enabled/" 2>&1 | Out-Null
ssh "$USER@$SERVER" "sudo nginx -t && sudo systemctl reload nginx" 2>&1 | Out-Null
Write-Host "Nginx configured" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Deployment Complete!" -ForegroundColor Green
Write-Host "   Access: http://$SERVER" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Open browser
Start-Process "http://$SERVER"
