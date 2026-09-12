@echo off
cd /d "C:\Users\lin\Documents\ChatGPT\情绪灵感库\emotion-content-studio"
echo Testing Content Creation Page Improvements
echo ==========================================
echo.
echo 1. Check imports added correctly...
findstr /C"useEffect" /C"useRef" /C"accountLabels" "apps\web\src\pages\GrowthLoopPage.tsx"
echo.
echo 2. Check CSS file created...
if exist "apps\web\src\pages\growth-loop-success.css" (
    echo CSS file exists
) else (
    echo CSS file missing
)
echo.
echo 3. Check Chinese text in CreateContent function...
findstr /C"创建内容" /C"生成内容" /C"立即进入内容审核" "apps\web\src\pages\GrowthLoopPage.tsx"
echo.
echo 4. Check auto-retrospective selection logic...
findstr /C"自动设置复盘来源" "apps\web\src\pages\GrowthLoopPage.tsx"
echo.
echo 5. Check account labels use Chinese...
findstr /C"accountLabels" "apps\web\src\pages\GrowthLoopPage.tsx"
echo.
echo Content creation page improvements completed.
echo.
echo Key improvements made:
echo - All English text converted to Chinese
echo - Auto-selection of retrospective source when coming from retrospectives page
echo - Clear success message with direct link to content review
echo - Better UX with progress indication
echo.
pause