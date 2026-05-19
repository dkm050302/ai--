@echo off
setlocal enabledelayedexpansion

set SERVER=43.138.229.56
set USER=ubuntu
set PASSWORD=Dkm050302
set REPO=git@github.com:dkm050302/ai--.git

echo ========================================
echo   GoldPilot 自动部署脚本 v2
echo ========================================
echo.

echo 正在生成部署命令...
echo.

echo 第1步：更新代码
echo ssh %USER%@%SERVER% "cd /var/www/goldpilot && git pull"
echo.

echo 第2步：部署后端
echo ssh %USER%@%SERVER% "cd /var/www/goldpilot/goldpilot-backend && npm install && cp .env.production .env && npm run build"
echo.

echo 第3步：部署前端
echo ssh %USER%@%SERVER% "cd /var/www/goldpilot/goldpilot-frontend && npm install && cp .env.production .env && npm run build"
echo.

echo 第4步：启动服务
echo ssh %USER%@%SERVER% "pm2 delete goldpilot-backend 2^>^/dev/null ^|^^| true && pm2 start /var/www/goldpilot/ecosystem.config.js --env production && pm2 save"
echo.

echo 第5步：重启Nginx
echo ssh %USER%@%SERVER% "sudo nginx -t ^&^& sudo systemctl reload nginx"
echo.

echo ========================================
echo   部署完成！
echo   访问地址: http://%SERVER%
echo ========================================
echo.

echo 按任意键打开部署页面...
pause > nul
start http://%SERVER%
