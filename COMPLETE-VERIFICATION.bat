@echo off
cd /d "C:\Users\lin\Documents\ChatGPT\情绪灵感库\emotion-content-studio"
echo ========================================
echo EMOTION CONTENT STUDIO - FINAL DEMO VERIFICATION
echo ========================================
echo.
echo [STEP 1] Project Verification
echo ========================================
call verify-project.bat
echo.
echo [STEP 2] Automated Tests
echo ========================================
call run-checks.bat
echo.
echo [STEP 3] Server Startup Test
echo ========================================
echo Testing API server startup...
timeout /t 2 >nul
start "API Test" cmd /k "call start-real-api.bat"
echo Waiting for API...
timeout /t 10 >nul
echo Testing API health...
curl -s http://127.0.0.1:8787/api/v1/health
if %errorlevel% equ 0 (
    echo API: PASS
) else (
    echo API: FAIL
)
echo.
echo Testing Web server startup...
start "Web Test" cmd /k "call start-real-web.bat"
echo Waiting for Web...
timeout /t 5 >nul
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
if %errorlevel% equ 0 (
    echo Web: PASS
) else (
    echo Web: FAIL
)
echo.
echo [STEP 4] Status Report
echo ========================================
call demo-status.bat
echo.
echo [STEP 5] Manual Browser Testing
echo ========================================
echo Please manually test browser flows:
echo 1. Open http://localhost:5173
echo 2. Verify Chinese UI navigation
echo 3. Test demo data loading
echo 4. Test Growth Loop workflow
echo 5. Test English workflow
echo 6. Test PNG exports
echo.
echo ========================================
echo VERIFICATION COMPLETE
echo ========================================
echo.
echo For manual testing, run:
echo - test-ui.bat
echo - test-full-flow.bat  
echo - test-offline.bat
echo.
echo To start servers for demo:
echo - start-servers.bat
echo.
pause