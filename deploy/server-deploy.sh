#!/bin/bash
set -e

echo "========================================"
echo "   GoldPilot Auto Deployment v3"
echo "========================================"
echo ""

PROJECT_DIR="/var/www/goldpilot"
REPO="git@github.com:dkm050302/ai--.git"

# Step 1: Update code
echo "[1/5] Updating code..."
if [ -d "$PROJECT_DIR" ]; then
    cd $PROJECT_DIR
    git pull
else
    echo "Cloning repository..."
    sudo mkdir -p $PROJECT_DIR
    sudo chown $USER:$USER $PROJECT_DIR
    git clone $REPO $PROJECT_DIR
    cd $PROJECT_DIR
fi

# Step 2: Deploy backend
echo "[2/5] Deploying backend..."
cd $PROJECT_DIR/goldpilot-backend
npm install
cp .env.production .env
npm run build

# Step 3: Deploy frontend
echo "[3/5] Deploying frontend..."
cd ../goldpilot-frontend
npm install
cp .env.production .env
npm run build

# Step 4: Start service
echo "[4/5] Starting service..."
pm2 delete goldpilot-backend 2>/dev/null || true
pm2 start $PROJECT_DIR/goldpilot-backend/ecosystem.config.js --env production
pm2 save

# Step 5: Configure Nginx
echo "[5/5] Configuring Nginx..."
sudo tee /etc/nginx/sites-available/goldpilot > /dev/null <<'NGINX_EOF'
server {
    listen 80;
    server_name 43.138.229.56 _;

    location / {
        root /var/www/goldpilot/goldpilot-frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
NGINX_EOF

sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/goldpilot /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "========================================"
echo "   Deployment Complete!"
echo "   Access: http://43.138.229.56"
echo "========================================"
echo ""
echo "Service status:"
pm2 list
