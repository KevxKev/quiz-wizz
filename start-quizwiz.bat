@echo off
setlocal
REM ------------------------------------------------------------
REM QuizWiz starter
REM This file starts the local QuizWiz server and opens the host page.
REM If the server is already running, it just opens the game in your browser.
REM ------------------------------------------------------------

REM Move into the project folder this BAT file is saved in
cd /d "%~dp0"

echo Starting QuizWiz...
echo.

REM Check whether port 3001 is already being used
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if %errorlevel%==0 (
    echo QuizWiz is already running on port 3001.
) else (
    echo Opening the server in a new terminal window...
    start "QuizWiz Server" cmd /k "cd /d ""%~dp0"" && npm run dev -- --hostname 0.0.0.0 --port 3001"
    echo Waiting for the app to start...
    timeout /t 8 /nobreak >nul
)

REM Open the host screen in your default browser
start "" "http://localhost:3001/host"

REM Try to find the local network IP so phones can join
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' -or $_.IPAddress -like '172.16.*' -or $_.IPAddress -like '172.17.*' -or $_.IPAddress -like '172.18.*' -or $_.IPAddress -like '172.19.*' -or $_.IPAddress -like '172.2?.*' -or $_.IPAddress -like '172.30.*' -or $_.IPAddress -like '172.31.*' } | Select-Object -First 1 -ExpandProperty IPAddress; if ($ip) { $ip }"`) do set LAN_IP=%%I

echo.
echo Host screen:
echo http://localhost:3001/host
if defined LAN_IP (
    echo Phones can join here:
    echo http://%LAN_IP%:3001/join
) else (
    echo If phones need to join, run ipconfig and use:
    echo http://YOUR-IP:3001/join
)

endlocal
exit /b 0
