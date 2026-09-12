@echo off
cd /d "C:\Users\lin\Documents\ChatGPT\情绪灵感库\emotion-content-studio"
echo Offline Demo Test
echo =================
echo.
echo This test verifies Demo works without:
echo - Docker
echo - PostgreSQL  
echo - Real AI API
echo - External network
echo.
echo Test Steps:
echo 1. Ensure no Docker containers running
echo 2. Ensure no PostgreSQL services running
echo 3. Ensure .env has AI_PROVIDER=mock and CONTENT_REPOSITORY=memory
echo 4. Start servers with start-servers.bat
echo 5. Open http://localhost:5173
echo 6. Load demo data with "加载7篇离线演示数据"
echo 7. Verify all features work offline
echo.
echo Current .env settings:
type .env
echo.
echo Press any key to continue...
pause