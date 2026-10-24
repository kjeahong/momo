@echo off
chcp 65001 > nul
echo ========================================================
echo   Momo (모모) - 기억을 찾아주는 스마트 메모앱 실행
echo   브라우저 주소: http://localhost:3001
echo ========================================================
start http://localhost:3001
node src/server/index.js
pause
