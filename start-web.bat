@echo off
cd /d "C:\Users\lin\Documents\ChatGPT\情绪灵感库\emotion-content-studio"
echo Starting Web server...
cd apps/web
npx vite --host 127.0.0.1
pause