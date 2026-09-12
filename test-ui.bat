@echo off
cd /d "C:\Users\lin\Documents\ChatGPT\情绪灵感库\emotion-content-studio"
echo Browser Test Instructions
echo ========================
echo.
echo 1. Open browser and navigate to: http://localhost:5173
echo 2. Check left navigation shows:
echo    - 内容总览
echo    - 复盘记录  
echo    - 内容创作
echo    - 数据表现
echo    - 历史记录
echo    - 趣味英语
echo    - 设置
echo    - 账号工作区
echo    - 统一素材库
echo    - 发布与数据
echo 3. Check top account switcher shows:
echo    - 个人成长
echo    - 趣味英语
echo    - 情绪灵感库
echo 4. Test clicking each navigation item
echo 5. Check no layout issues or text overflow
echo.
echo Press any key to open browser...
pause >nul
start http://localhost:5173