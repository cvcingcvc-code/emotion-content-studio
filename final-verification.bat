@echo off
cd /d "C:\Users\lin\Documents\ChatGPT\情绪灵感库\emotion-content-studio"
echo Final Demo Verification
echo ======================
echo.
echo 1. Running automated checks...
call run-checks.bat
echo.
echo 2. Testing UI modifications...
call test-ui.bat
echo.
echo 3. Testing full browser flow...
call test-full-flow.bat  
echo.
echo 4. Testing offline mode...
call test-offline.bat
echo.
echo 5. Verifying server startup...
call start-servers.bat
echo.
echo All tests completed. Check results above.
pause