@echo off
cd /d "C:\Users\lin\Documents\ChatGPT\情绪灵感库\emotion-content-studio"
echo Starting API server...
cd apps/api
npx tsx watch src/server.ts
pause