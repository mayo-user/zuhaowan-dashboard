/**
 * Excel 解析 Web Worker
 * 将大文件 xlsx 解析放到后台线程，避免阻塞主线程导致页面卡顿
 * 
 * 消息协议：
 *   接收: { type: 'parse', data: ArrayBuffer, fileName: string }
 *   发送: { type: 'progress', percent: number }
 *   发送: { type: 'done', result: { sheetNames, rows, headers } }
 *   发送: { type: 'error', message: string }
 */

importScripts('xlsx.full.min.js');

// 由于 XLSX 库本身不支持进度回调，这里模拟分阶段进度
const STAGES = [
  { name: '读取文件', weight: 5 },
  { name: '解析工作簿', weight: 25 },
  { name: '读取工作表', weight: 30 },
  { name: '转换数据', weight: 40 }
];

let currentStage = 0;
let stageProgress = 0;

function sendProgress(percent) {
  self.postMessage({ type: 'progress', percent: Math.round(percent) });
}

function updateStageProgress(stageIndex, subPercent) {
  let total = 0;
  for (let i = 0; i < stageIndex; i++) {
    total += STAGES[i].weight;
  }
  total += STAGES[stageIndex].weight * (subPercent / 100);
  sendProgress(total);
}

self.onmessage = function(e) {
  const msg = e.data;
  
  if (msg.type === 'parse') {
    parseExcel(msg.data, msg.fileName);
  }
};

function parseExcel(arrayBuffer, fileName) {
  try {
    updateStageProgress(0, 100); // 读取文件完成（数据已从主线程传来）

    // 解析工作簿
    updateStageProgress(1, 10);
    const data = new Uint8Array(arrayBuffer);
    
    updateStageProgress(1, 50);
    const workbook = XLSX.read(data, { type: 'array' });
    
    updateStageProgress(1, 100);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // 读取工作表（使用 sheet_to_json 但分块处理以报告进度）
    updateStageProgress(2, 30);
    
    // 获取数据范围估算行数
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
    const totalRows = range.e.r - range.s.r;
    
    updateStageProgress(2, 70);

    // 转换为 JSON
    updateStageProgress(3, 10);
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    
    updateStageProgress(3, 100);

    const result = {
      sheetNames: workbook.SheetNames,
      rows: jsonData,
      headers: jsonData.length > 0 ? Object.keys(jsonData[0]) : [],
      rowCount: jsonData.length
    };

    sendProgress(100);
    
    self.postMessage({ type: 'done', result: result });
    
  } catch (err) {
    console.error('[Worker] 解析失败:', err);
    self.postMessage({ 
      type: 'error', 
      message: err.message || '文件解析失败' 
    });
  }
}
