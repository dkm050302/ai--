@echo off
chcp 65001 >nul
echo ========================================
echo    GoldPilot 开发环境启动
echo ========================================
echo.

echo [1/3] 启动后端服务器...
start "GoldPilot Backend" cmd /k "cd /d G:\_ai交易\goldpilot-backend && npm run dev"

timeout /t 3 /nobreak >nul

echo [2/3] 启动前端服务器...
start "GoldPilot Frontend" cmd /k "cd /d G:\_ai交易\goldpilot-frontend && npm run dev"

timeout /t 3 /nobreak >nul

echo [3/3] 打开浏览器...
start http://localhost:5176

echo.
echo ✅ 启动完成！
echo.
echo 后端地址: http://localhost:3006
echo 前端地址: http://localhost:5176
echo.
echo 按任意键关闭此窗口...
pause >nul
