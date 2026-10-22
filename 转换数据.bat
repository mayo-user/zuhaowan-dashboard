@echo off
chcp 65001 >nul
echo ========================================
echo   租号玩看板 - 数据转换工具（增强版）
echo ========================================
echo.
echo 此工具将 data\ 目录下的 xlsx 文件转换为：
echo   1. 原始明细 JSON（向后兼容）
echo   2. 预计算摘要 JSON（速度提升 10-50 倍！）
echo   3. 环比对比 JSON（跳过前端环比计算）
echo.
echo 【分销双系统合并】
echo   支持分销加价系统 + 转租分销融合需求系统两套数据
echo   自动识别文件名含"分销加价"和"融合需求"的文件
echo   按日期范围自动区分本周/上周，合并生成 dist_current / dist_previous
echo.
echo 【文件放置说明】
echo   转租数据：sublet_current.xlsx（本周）、sublet_previous.xlsx（上周）
echo   分销数据（单系统）：dist_current.xlsx（本周）、dist_previous.xlsx（上周）
echo   分销数据（双系统）：2个"分销加价"文件 + 2个"融合需求"文件
echo.
echo 转换后，页面打开速度从 15-20 分钟 降到 30 秒以内
echo.
pause

cd /d "%~dp0"

echo.
echo 开始批量转换...
echo.

set "PYTHON=C:\Users\Administrator\AppData\Local\Programs\Python\Python312\python.exe"

"%PYTHON%" "%~dp0convert_xlsx_to_json.py" --batch "%~dp0data"

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   转换成功！
    echo ========================================
    echo.
    echo 生成的文件（data\目录下）：
    echo   dist_current.xlsx     - 分销本周合并数据（双系统合并后）
    echo   dist_previous.xlsx    - 分销上周合并数据（双系统合并后）
    echo   *_summary.json        - 单周预计算摘要（核心加速）
    echo   *_comparison.json     - 环比对比数据
    echo.
    echo 提示：
    echo   1. 将 data\ 目录下所有 .json 文件提交到 GitHub/Gitee
    echo   2. 页面会自动优先加载摘要数据，速度提升 10-50 倍
    echo   3. 如果摘要文件不存在，会自动回退到原始数据模式
    echo   4. 建议保留原始 xlsx 文件作为备份和数据源
    echo   5. 分销双系统合并：文件名包含"分销加价"和"融合需求"即可自动识别
) else (
    echo.
    echo ========================================
    echo   转换失败，请查看上方错误信息
    echo ========================================
)

echo.
pause
