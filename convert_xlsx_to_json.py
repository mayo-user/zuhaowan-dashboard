#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
xlsx 转 JSON 转换工具
将 Excel 文件转换为紧凑的 JSON 格式（数组形式），供前端看板快速加载。

JSON 格式:
{
    "sheetName": "Sheet1",
    "headers": ["列名1", "列名2", ...],
    "rows": [
        ["值1", "值2", ...],
        ...
    ]
}
"""

import sys
import os
import json
from openpyxl import load_workbook


def convert_xlsx_to_json(xlsx_path):
    """将 xlsx 文件转换为 JSON 格式"""
    if not os.path.exists(xlsx_path):
        print(f"错误: 文件不存在 - {xlsx_path}", file=sys.stderr)
        return False

    file_size = os.path.getsize(xlsx_path)

    def read_sheet(use_readonly):
        """读取工作表，返回 (headers, rows, sheet_name)"""
        wb = load_workbook(xlsx_path, read_only=use_readonly, data_only=True)
        ws = wb[wb.sheetnames[0]]
        sheet_name = wb.sheetnames[0]

        headers = []
        rows = []

        for row_idx, row in enumerate(ws.iter_rows(values_only=True), 1):
            if row_idx == 1:
                headers = [str(cell) if cell is not None else '' for cell in row]
            else:
                row_data = []
                for cell in row:
                    if cell is None:
                        row_data.append('')
                    elif isinstance(cell, (int, float)):
                        row_data.append(cell)
                    else:
                        row_data.append(str(cell))
                rows.append(row_data)

        wb.close()
        return headers, rows, sheet_name

    try:
        # 先用 read_only 模式（大文件更省内存）
        headers, rows, sheet_name = read_sheet(True)

        # 校验数据合理性：文件大于 50KB 但行数极少或列数为 1，
        # 说明 read_only 模式下维度信息不完整，回退到普通模式
        if file_size > 50 * 1024 and (len(rows) < 10 or len(headers) <= 1):
            print(f"  检测到 read_only 模式数据不完整（{len(headers)}列, {len(rows)}行），回退到普通模式...")
            headers, rows, sheet_name = read_sheet(False)

        # 构建 JSON 数据
        result = {
            "sheetName": sheet_name,
            "headers": headers,
            "rows": rows
        }

        # 生成输出路径（同名 .json 文件）
        json_path = os.path.splitext(xlsx_path)[0] + '.json'

        # 写入 JSON
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, separators=(',', ':'))

        json_size = os.path.getsize(json_path)

        print(f"转换成功: {os.path.basename(xlsx_path)}")
        print(f"  行数: {len(rows)}, 列数: {len(headers)}")
        print(f"  xlsx: {file_size:,} 字节 → json: {json_size:,} 字节")

        return True

    except Exception as e:
        print(f"转换失败: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return False


def main():
    if len(sys.argv) < 2:
        print("用法: python convert_xlsx_to_json.py <xlsx文件路径>", file=sys.stderr)
        sys.exit(1)

    xlsx_path = sys.argv[1]

    # 支持相对路径，转成绝对路径
    if not os.path.isabs(xlsx_path):
        xlsx_path = os.path.abspath(xlsx_path)

    success = convert_xlsx_to_json(xlsx_path)
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
