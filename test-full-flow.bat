@echo off
cd /d "C:\Users\lin\Documents\ChatGPT\情绪灵感库\emotion-content-studio"
echo Complete Browser Flow Test
echo =========================
echo.
echo Step 1: Open browser
echo Navigate to: http://localhost:5173
echo.
echo Step 2: Test Offline Demo
echo - Click "加载7篇离线演示数据"
echo - Verify dashboard shows 7 demo items
echo - Check Growth/English/Emotion content appears
echo.
echo Step 3: Test Growth Loop
echo - Go to "复盘记录"
echo - Create/select a retrospective
echo - Navigate to "内容创作"
echo - Create Growth Content
echo - Review and approve content
echo - Go to "数据表现" for metrics
echo.
echo Step 4: Test English Workflow
echo - Go to "趣味英语"
echo - Select demo topic (e.g., 尴尬时刻英语50句)
echo - Generate and edit content
echo - Test Preview and Export
echo.
echo Step 5: Test PNG Exports
echo - Try Growth PNG export
echo - Try English PNG export
echo.
echo Step 6: Test All Navigation
echo - Click each menu item
echo - Verify pages load without errors
echo.
echo Press any key to open browser...
pause >nul
start http://localhost:5173