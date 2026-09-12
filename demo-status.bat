@echo off
cd /d "C:\Users\lin\Documents\ChatGPT\情绪灵感库\emotion-content-studio"
echo DEMO STATUS REPORT
echo ==================
echo.
echo Git Status:
git status --short
echo.
echo Git Branch:
git branch --show-current
echo.
echo Git Diff Check:
git diff --check
echo.
echo Node Version:
node --version
echo.
echo NPM Version:
npm --version
echo.
echo Environment Settings:
type .env
echo.
echo Directory Listing:
dir /b | findstr /i "bat js json tsx ts"
echo.
echo Press any key to continue...
pause