@echo off
echo ========================================
echo Discord Lua Bot - Setup Script
echo ========================================
echo.

echo [1/3] Installing dependencies...
call npm install

echo.
echo [2/3] Checking folders...
if not exist "lua_files" mkdir lua_files
if not exist "fix_files" mkdir fix_files
if not exist "online_fix" mkdir online_fix
if not exist "logs" mkdir logs

echo.
echo [3/3] Setup complete!
echo.
echo ========================================
echo Next steps:
echo   1. Edit .env file with your tokens
echo   2. Run: npm start
echo   3. (Optional) Run: npm run collect-lua
echo ========================================
echo.
pause
