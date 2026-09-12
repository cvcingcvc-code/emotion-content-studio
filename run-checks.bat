@echo off
cd /d "C:\Users\lin\Documents\ChatGPT\情绪灵感库\emotion-content-studio"
echo ========================================
echo Running TypeCheck...
echo ========================================
npm run typecheck
if %errorlevel% neq 0 (
    echo TypeCheck FAILED!
    pause
    exit /b 1
)
echo TypeCheck PASSED
echo.

echo ========================================
echo Running Tests...
echo ========================================
npm test
if %errorlevel% neq 0 (
    echo Tests FAILED!
    pause
    exit /b 1
)
echo Tests PASSED
echo.

echo ========================================
echo Running Build...
echo ========================================
npm run build
if %errorlevel% neq 0 (
    echo Build FAILED!
    pause
    exit /b 1
)
echo Build PASSED
echo.

echo ========================================
echo Checking Git Status...
echo ========================================
git status
echo.

echo ========================================
echo Checking Git Diff...
echo ========================================
git diff --check
if %errorlevel% neq 0 (
    echo Git diff has issues!
) else (
    echo Git diff is clean
)
echo.

echo ========================================
echo All checks completed successfully!
echo ========================================
pause