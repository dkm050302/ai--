@echo off
chcp 65001 >nul
echo ========================================
echo   GoldPilot Quick Deploy
echo ========================================
echo.

echo [1/3] Building frontend locally...
cd goldpilot-frontend
call npm run build
if %errorlevel% neq 0 (
    echo Build FAILED! Check errors above
    pause
    exit /b 1
)
echo Build OK!
cd ..
echo.

echo [2/3] Uploading to server...
echo Enter server password when prompted
echo.

echo Please use Method 2 instead (SSH to server)
echo This requires PuTTY tools installed
echo.
echo ========================================
echo Method 2: SSH to server and run:
echo ========================================
echo.
echo ssh root@43.138.229.56
echo.
echo Then run these commands on server:
echo   cd /var/www/goldpilot
echo   git pull
echo   cd goldpilot-frontend
echo   npm run build
echo   pm2 restart all
echo   nginx -s reload
echo.
pause
