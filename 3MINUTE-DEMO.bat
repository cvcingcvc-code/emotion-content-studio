@echo off
echo ========================================
echo 3-MINUTE DEMO SCRIPT FOR SEPT 12
echo ========================================
echo.
echo PRE-DEMO SETUP (30 seconds):
echo 1. Close all browser windows
echo 2. Run: start-servers.bat
echo 3. Wait for "Servers started" message
echo 4. Open http://localhost:5173
echo.
echo DEMO FLOW (3 minutes):
echo.
echo [0:00-0:30] Dashboard Overview
echo - Show left navigation with Chinese labels
echo - Explain "内容总览", "数据表现", "历史记录"
echo - Show account switching (个人成长/趣味英语/情绪灵感库)
echo.
echo [0:30-1:15] Growth Loop Demo  
echo - Click "复盘记录" → Create demo retrospective
echo - Show AI analysis and content potential
echo - Navigate to "内容创作" → Generate from insights
echo - Show content editing and approval flow
echo.
echo [1:15-2:00] Performance & Metrics
echo - Go to "数据表现" → Show manual metrics entry
echo - Display KEEP/CHANGE/NEXT EXPERIMENT analysis
echo - Show historical comparisons
echo.
echo [2:00-2:45] English Workflow Bonus
echo - Switch to "趣味英语" → Select demo topic  
echo - Show 50-sentence content generation
echo - Demonstrate Preview and PNG export
echo.
echo [2:45-3:00] Conclusion
echo - Summarize three-account system
echo - Emphasize offline demo capability
echo - Open output folder to show PNG exports
echo.
echo KEY DEMO POINTS:
echo - Chinese UI for professional presentation
echo - Complete content creation pipeline
echo - Mock AI for stable demo
echo - Real PNG exports functionality
echo - No external dependencies required
echo.
echo Press any key to open demo page...
pause >nul
start http://localhost:5173