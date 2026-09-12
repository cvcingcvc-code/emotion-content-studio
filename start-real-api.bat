@echo off
cd /d "C:\Users\lin\Documents\ChatGPT\情绪灵感库\emotion-content-studio"
echo Starting API server...
cd apps/api
echo Checking dependencies...
call npm run build:dependencies
echo Starting server with tsx...
npx tsx watch src/server.ts
echo API server started.
pause