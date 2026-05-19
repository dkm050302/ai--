@echo off
chcp 65001 >nul
echo ========================================
echo   GoldPilot 自动部署脚本
echo ========================================
echo.

set SERVER=43.138.229.56
set USER=ubuntu
set PASSWORD=Dkm050302
set REPO=https://github.com/dkm050302/ai--.git

echo 正在连接服务器...
echo.

REM 创建临时SSH命令文件
echo %PASSWORD% > temp_pass.txt

echo 请按以下步骤操作：
echo.
echo 1. 打开一个新的 PowerShell 窗口
echo 2. 复制以下命令并执行：
echo.
echo ssh ubuntu@%SERVER%
echo （输入密码: %PASSWORD%）
echo.
echo 3. 连接成功后，复制以下完整命令并粘贴到服务器终端：
echo.
echo ========================================批处理命令开始========================================
curl -fsSL https://raw.githubusercontent.com/dkm050302/ai--/main/deploy/setup-server.sh -o ~/setup-server.sh ^&^& bash ~/setup-server.sh
echo.
echo 等待安装完成后再执行：
echo.
echo curl -fsSL https://raw.githubusercontent.com/dkm050302/ai--/main/deploy/deploy.sh -o ~/deploy.sh ^&^& bash ~/deploy.sh
echo ========================================批处理命令结束========================================
echo.
pause
