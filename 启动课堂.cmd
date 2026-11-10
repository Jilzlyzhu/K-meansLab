@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "TAIHU_NODE=%LOCALAPPDATA%\..\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "TAIHU_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%TAIHU_NODE%" set "TAIHU_NODE=node"
echo 正在启动课堂。浏览器访问 http://localhost:4173/?view=teacher
echo 请保持此窗口开启；结束课堂后按 Ctrl+C 停止。
"%TAIHU_NODE%" server.js
pause
