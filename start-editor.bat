@echo off
REM ============================================================
REM  Rin9 Website Editor - one-click launcher
REM  Double-click this file to open the visual editor
REM ============================================================
cd /d "%~dp0"

set PY=""
where py >nul 2>nul && set PY=py
if "%PY%"=="" (
    where python >nul 2>nul && set PY=python
)
if "%PY%"=="" (
    echo.
    echo   [ERROR] Python not found in PATH.
    echo   Install Python 3 from https://www.python.org/downloads/
    echo   and make sure "Add to PATH" is checked.
    echo.
    pause
    exit /b 1
)

echo.
echo   Starting Rin9 website editor...
echo   The browser will open automatically.
echo   Close this window to stop the server.
echo.
%PY% tools\serve.py --port 8123
pause
