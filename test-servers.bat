@echo off
cd /d "C:\Users\lin\Documents\ChatGPT\情绪灵感库\emotion-content-studio"
echo Testing API health...
curl -s http://127.0.0.1:8787/api/v1/health
echo.
echo Testing web server...
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
pause