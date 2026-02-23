@echo off
cd /d "%~dp0"

echo Installing Serpent...

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: npm is not installed.
    exit /b 1
)

where code >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: 'code' CLI not found. Open VS Code and run:
    echo   Ctrl+Shift+P ^> Shell Command: Install 'code' command in PATH
    exit /b 1
)

call npm install --silent
call npm run compile --silent
call npx @vscode/vsce package --no-dependencies -o serpent.vsix 2>nul
call code --install-extension serpent.vsix --force

del /f serpent.vsix 2>nul

echo.
echo Done! Serpent is installed.
echo Reload VS Code and it will prompt you for your Telegram credentials on first use.
