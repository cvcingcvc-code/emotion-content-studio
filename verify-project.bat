@echo off
cd /d "C:\Users\lin\Documents\ChatGPT\情绪灵感库\emotion-content-studio"
echo Current directory:
cd
echo.
echo Git top-level:
git rev-parse --show-toplevel
echo.
echo Git branch:
git branch --show-current
echo.
echo Git status:
git status --short
echo.
echo Git diff check:
git diff --check
echo.
echo Checking modified files...
if exist "apps\web\src\components\AppShell.tsx" echo AppShell.tsx exists
if exist "apps\web\src\pages\DashboardPage.tsx" echo DashboardPage.tsx exists
if exist "apps\web\src\pages\ImportPage.tsx" echo ImportPage.tsx exists
if exist "apps\web\src\pages\LibraryPage.tsx" echo LibraryPage.tsx exists
if exist "apps\web\src\pages\GrowthContentReview.tsx" echo GrowthContentReview.tsx exists
if exist "apps\web\src\pages\GrowthLoopPage.tsx" echo GrowthLoopPage.tsx exists
if exist "apps\web\src\lib\accounts.ts" echo accounts.ts exists
pause