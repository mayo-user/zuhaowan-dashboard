@echo off
chcp 65001 >nul
echo ========================================
echo   租号玩看板 - 数据格式转换工具
echo ========================================
echo.
echo 此工具将 data\ 目录下的 xlsx 文件转换为 JSON 格式，
echo 可以大幅提升页面加载速度（快 10 倍以上）。
echo.
echo 转换后的 JSON 文件会自动保存在 data\ 目录下，
echo 部署到 GitHub Pages 后，页面会优先加载 JSON 版本。
echo.
pause

cd /d "%~dp0"

echo.
echo 开始转换...
echo.

set "PYTHON=C:\Users\Administrator\AppData\Local\Programs\Python\Python312\python.exe"

set "count=0"
for %%f in (data\*.xlsx) do (
    echo [%%~nf] 正在转换...
    "%PYTHON%" "%~dp0convert_xlsx_to_json.py" "%%f"
    if %errorlevel% equ 0 (
        set /a count+=1
        echo [%%~nf] 完成
    ) else (
        echo [%%~nf] 失败
    )
    echo.
)

echo ========================================
echo  转换完成！共处理 %count% 个文件
echo ========================================
echo.
echo 提示：
echo   1. 将 data\ 目录下的 .json 文件一起提交到 GitHub
echo   2. 页面会自动优先加载 JSON 格式
echo   3. 如果 JSON 文件不存在，会自动回退到 xlsx
echo.
pause
