/**
 * 数据处理模块
 * 负责Excel文件读取、数据解析、聚合计算、环比分析
 */
const DataProcessor = (function() {
    'use strict';

    // ========== 字段映射配置 ==========
    const SUBLET_FIELDS = {
        date: 'part_day(day)',
        month: 'part_day(month)',
        channel: '三方渠道',
        sublessorId: 'pid',
        sublessorName: 'pusername',
        gameName: 'game_name',
        gameService: 'game_service',
        shopId: 'shop_id',
        shopName: 'shop_name',
        isSelfOperated: '是否自营',
        isAutoOrder: '是否自动化订单',
        orderCount: '订单量',
        settledOrderCount: '结算订单量',
        cancelCount: '撤单量',
        orderAmount: '订单金额',
        settledAmount: '结算订单金额',
        sublessorProfit: '转租商收益',
        platformProfit: '平台收益（含服务费）',
        thirdPartyOrders: '三方订单量',
        thirdPartyShipments: '三方发货量',
        thirdPartyAmount: '三方订单金额'
    };

    const DIST_FIELDS = {
        date: 'part_day(day)',
        distributorId: 'user_id',
        distributorType: 'add_from',
        gameName: 'game_name',
        orderPortal: '下单端口',
        isSelfOperated: '是否自营',
        orderCount: '订单量',
        normalOrderCount: '正常订单量',
        settledOrderCount: '正常结算订单量',
        cancelCount: '撤单量',
        orderAmount: '订单金额',
        userPayment: '用户实付',
        platformProfit: '平台收益',
        platformMarkup: '平台加价',
        distributorProfit: '分销收益',
        distributorMarkup: '分销加价',
        ownerProfit: '号主收益',
        selfOperatedOrders: '自营结算订单量',
        nonSelfOperatedOrders: '非自营结算订单量'
    };

    // ========== 工具函数 ==========
    function safeNum(val) {
        if (val === null || val === undefined || val === '') return 0;
        const num = parseFloat(val);
        return isNaN(num) ? 0 : num;
    }

    // 构建店铺聚合的唯一key：优先用 sublessorId，其次用 sublessorName 兜底
    // 确保手动开单（shopId为空）按实际转租商分开归属
    function shopAggKey(sublessorId, sublessorName, shopId, gameName, channel) {
        const subId = sublessorId || ('name:' + (sublessorName || '未知转租商'));
        const parts = [subId, shopId || '', gameName];
        if (channel !== undefined && channel !== null && channel !== '') {
            parts.push(channel);
        }
        return parts.join('||');
    }

    function formatMoney(val) {
        const num = safeNum(val);
        if (Math.abs(num) >= 10000) {
            return (num / 10000).toFixed(2) + '万';
        }
        return num.toFixed(2);
    }

    function formatInt(val) {
        const num = safeNum(val);
        if (Math.abs(num) >= 10000) {
            return (num / 10000).toFixed(2) + '万';
        }
        return Math.round(num).toLocaleString();
    }

    function formatPercent(val) {
        const num = safeNum(val);
        return (num * 100).toFixed(2) + '%';
    }

    function calcChangeRate(cur, prev) {
        if (prev === 0) {
            if (cur === 0) return 0;
            return cur > 0 ? 1 : -1;
        }
        return (cur - prev) / Math.abs(prev);
    }

    function getDateRange(rows, dateField) {
        if (!rows || rows.length === 0) return { min: null, max: null };
        let min = null, max = null;
        rows.forEach(row => {
            const d = row[dateField];
            if (d) {
                const ds = String(d);
                if (!min || ds < min) min = ds;
                if (!max || ds > max) max = ds;
            }
        });
        return { min, max };
    }

    function formatDateDisplay(dateStr) {
        if (!dateStr) return '--';
        const s = String(dateStr);
        if (s.length === 8) {
            return s.substring(0, 4) + '-' + s.substring(4, 6) + '-' + s.substring(6, 8);
        }
        return s;
    }

    // ========== 数据类型检测 ==========
    function detectDataType(headers) {
        if (!headers || headers.length === 0) {
            console.warn('[DataProcessor] detectDataType: 表头为空，无法识别数据类型');
            return 'unknown';
        }
        const headerSet = new Set(headers.map(h => String(h).trim()));

        // 转租数据特征：核心唯一字段 + 辅助字段
        // 强特征（转租独有）+ 弱特征（金额类字段）
        const subletStrongMarkers = ['三方渠道', '转租商收益', 'shop_id', 'shop_name', 'pid', 'pusername', '三方订单量', '三方发货量', '三方订单金额'];
        let subletStrongScore = 0;
        subletStrongMarkers.forEach(m => { if (headerSet.has(m)) subletStrongScore++; });

        const subletWeakMarkers = ['结算订单金额', '平台收益（含服务费）', 'quick_type'];
        let subletWeakScore = 0;
        subletWeakMarkers.forEach(m => { if (headerSet.has(m)) subletWeakScore++; });

        const subletScore = subletStrongScore * 2 + subletWeakScore;

        // 分销数据特征：核心唯一字段 + 辅助字段
        const distStrongMarkers = ['分销收益', '分销加价', 'add_from', '号主收益', '平台加价'];
        let distStrongScore = 0;
        distStrongMarkers.forEach(m => { if (headerSet.has(m)) distStrongScore++; });

        const distWeakMarkers = ['用户实付', '下单端口', '自营结算订单量', '非自营结算订单量', '正常结算订单量'];
        let distWeakScore = 0;
        distWeakMarkers.forEach(m => { if (headerSet.has(m)) distWeakScore++; });

        const distScore = distStrongScore * 2 + distWeakScore;

        if (subletScore > distScore && subletStrongScore >= 1) return 'sublet';
        if (distScore > subletScore && distStrongScore >= 1) return 'distribution';

        // 退一步：仅靠强特征判断
        if (subletStrongScore > distStrongScore && subletStrongScore >= 2) return 'sublet';
        if (distStrongScore > subletStrongScore && distStrongScore >= 2) return 'distribution';

        return 'unknown';
    }

    // ========== Excel 读取 ==========
    function readExcelFile(file) {
        return new Promise((resolve, reject) => {
            // 防御性检查：XLSX 库是否加载成功
            if (typeof XLSX === 'undefined' || typeof XLSX.read !== 'function') {
                console.error('[DataProcessor] XLSX 库未加载，当前 XLSX =', typeof XLSX);
                const err = new Error('Excel 解析组件加载失败，请刷新页面重试。如问题持续，请联系技术支持。');
                err.name = 'XLSXNotLoadedError';
                reject(err);
                return;
            }

            if (!file || !file.name) {
                reject(new Error('文件无效，请重新选择文件'));
                return;
            }

            console.log('[DataProcessor] 开始读取文件:', file.name, '大小:', file.size, '字节');

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    console.log('[DataProcessor] 文件读取完成，数据长度:', data.length, '字节');

                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

                    console.log('[DataProcessor] Excel 解析完成，工作表:', workbook.SheetNames.join(', '), '，行数:', jsonData.length);

                    resolve({
                        sheetNames: workbook.SheetNames,
                        rows: jsonData,
                        headers: jsonData.length > 0 ? Object.keys(jsonData[0]) : []
                    });
                } catch (err) {
                    console.error('[DataProcessor] Excel 解析失败:', err);
                    // 包装错误信息，提供用户友好的提示
                    let userMsg = '文件解析失败，请确认文件格式正确（.xlsx 或 .xls）';
                    if (err.message && err.message.indexOf('password') >= 0) {
                        userMsg = '文件已加密，无法读取，请取消密码保护后重新上传';
                    } else if (err.message && err.message.indexOf('Corrupt') >= 0) {
                        userMsg = '文件已损坏，请重新导出数据后再上传';
                    }
                    const wrappedErr = new Error(userMsg);
                    wrappedErr.originalError = err;
                    reject(wrappedErr);
                }
            };
            reader.onerror = function() {
                reject(new Error('文件读取失败，请检查文件是否被其他程序占用'));
            };
            reader.readAsArrayBuffer(file);
        });
    }

    // ========== 转租数据处理 ==========
    function processSubletData(rawRows, headers) {
        const f = SUBLET_FIELDS;
        const headerSet = new Set(headers.map(h => String(h).trim()));

        // 字段兼容性：根据实际表头选择可用字段
        // 日期字段：优先 part_day(day)，退而求其次 day/日期
        const dateField = headerSet.has(f.date) ? f.date
            : (headerSet.has('day') ? 'day'
            : (headerSet.has('日期') ? '日期' : f.date));

        // 月份字段：优先 part_day(month)，其次从日期截取
        const monthField = headerSet.has(f.month) ? f.month : null;

        // 渠道字段：优先 三方渠道，备选 渠道/channel
        const channelField = headerSet.has(f.channel) ? f.channel
            : (headerSet.has('渠道') ? '渠道'
            : (headerSet.has('channel') ? 'channel' : null));

        // 转租商ID：优先 pid，备选 转租商ID/sublessor_id
        const sublessorIdField = headerSet.has(f.sublessorId) ? f.sublessorId
            : (headerSet.has('转租商ID') ? '转租商ID' : null);

        // 转租商名称：优先 pusername，备选 转租商名/sublessor_name
        const sublessorNameField = headerSet.has(f.sublessorName) ? f.sublessorName
            : (headerSet.has('转租商名') ? '转租商名'
            : (headerSet.has('pname') ? 'pname' : null));

        // 店铺ID：优先 shop_id，备选 店铺ID
        const shopIdField = headerSet.has(f.shopId) ? f.shopId
            : (headerSet.has('店铺ID') ? '店铺ID' : f.shopId);

        // 店铺名：优先 shop_name，备选 店铺名
        const shopNameField = headerSet.has(f.shopName) ? f.shopName
            : (headerSet.has('店铺名') ? '店铺名' : f.shopName);

        // 结算订单量：优先 结算订单量，备选 正常结算订单量/正常订单量
        const settledOrderField = headerSet.has(f.settledOrderCount) ? f.settledOrderCount
            : (headerSet.has('正常结算订单量') ? '正常结算订单量'
            : (headerSet.has('正常订单量') ? '正常订单量' : f.orderCount));

        // 结算金额：优先 结算订单金额，备选 结算金额
        const settledAmountField = headerSet.has(f.settledAmount) ? f.settledAmount
            : (headerSet.has('结算金额') ? '结算金额' : f.settledAmount);

        // 平台收益：优先 平台收益（含服务费），备选 平台收益
        const platformProfitField = headerSet.has(f.platformProfit) ? f.platformProfit
            : (headerSet.has('平台收益') ? '平台收益' : f.platformProfit);

        // 标记是否有渠道数据
        const hasChannelData = !!channelField && Array.from(headerSet).some(h => {
            const val = rawRows.length > 0 ? rawRows[0][h] : '';
            return h === channelField && val && val !== '';
        }) || (channelField && rawRows.some(r => r[channelField] && String(r[channelField]).trim() !== ''));

        // 标准化字段名
        const rows = rawRows.map(row => {
            const dateVal = row[dateField];
            return {
                date: dateVal,
                month: monthField ? row[monthField] : (dateVal ? String(dateVal).substring(0, 6) : ''),
                channel: channelField ? (row[channelField] || '未知渠道') : '未知渠道',
                sublessorId: sublessorIdField ? (row[sublessorIdField] || '') : '',
                sublessorName: sublessorNameField ? (row[sublessorNameField] || '') : '',
                gameName: row[f.gameName] || '未知游戏',
                gameService: row[f.gameService] || '',
                shopId: shopIdField ? (String(row[shopIdField] || '')) : '',
                shopName: shopNameField ? (row[shopNameField] || '') : '',
                isSelfOperated: row[f.isSelfOperated] || '',
                isAutoOrder: row[f.isAutoOrder] || '',
                orderCount: safeNum(row[f.orderCount]),
                settledOrderCount: safeNum(row[settledOrderField]),
                cancelCount: safeNum(row[f.cancelCount]),
                orderAmount: safeNum(row[f.orderAmount]),
                settledAmount: safeNum(row[settledAmountField]),
                sublessorProfit: safeNum(row[f.sublessorProfit]),
                platformProfit: safeNum(row[platformProfitField]),
                thirdPartyOrders: safeNum(row[f.thirdPartyOrders]),
                thirdPartyShipments: safeNum(row[f.thirdPartyShipments]),
                thirdPartyAmount: safeNum(row[f.thirdPartyAmount])
            };
        });

        const dateRange = getDateRange(rows, 'date');

        // 总览 KPI
        const totals = rows.reduce((acc, r) => {
            acc.orderCount += r.orderCount;
            acc.settledOrderCount += r.settledOrderCount;
            acc.cancelCount += r.cancelCount;
            acc.orderAmount += r.orderAmount;
            acc.settledAmount += r.settledAmount;
            acc.platformProfit += r.platformProfit;
            acc.sublessorProfit += r.sublessorProfit;
            acc.thirdPartyOrders += r.thirdPartyOrders;
            acc.thirdPartyShipments += r.thirdPartyShipments;
            return acc;
        }, {
            orderCount: 0,
            settledOrderCount: 0,
            cancelCount: 0,
            orderAmount: 0,
            settledAmount: 0,
            platformProfit: 0,
            sublessorProfit: 0,
            thirdPartyOrders: 0,
            thirdPartyShipments: 0
        });

        totals.cancelRate = totals.orderCount > 0 ? totals.cancelCount / totals.orderCount : 0;
        // 发货成功率 = 三方发货量 / 三方订单量，上限100%（防止发货量因跨期统计等原因超过订单量）
        totals.shipSuccessRate = totals.thirdPartyOrders > 0
            ? Math.min(1, totals.thirdPartyShipments / totals.thirdPartyOrders)
            : 0;

        // 分渠道聚合
        const channelMap = {};
        rows.forEach(r => {
            const ch = r.channel;
            if (!channelMap[ch]) {
                channelMap[ch] = {
                    channel: ch,
                    settledOrderCount: 0,
                    platformProfit: 0,
                    settledAmount: 0,
                    cancelCount: 0,
                    orderCount: 0
                };
            }
            channelMap[ch].settledOrderCount += r.settledOrderCount;
            channelMap[ch].platformProfit += r.platformProfit;
            channelMap[ch].settledAmount += r.settledAmount;
            channelMap[ch].cancelCount += r.cancelCount;
            channelMap[ch].orderCount += r.orderCount;
        });
        const channelData = Object.values(channelMap).sort((a, b) => b.settledOrderCount - a.settledOrderCount);

        // 闲鱼渠道细分（按quick_type或order_source，如果有的话用原始字段）
        const xianyuRows = rows.filter(r => r.channel === '闲鱼');
        const xianyuDetailMap = {};
        // 使用 order_source 或 闲鱼订单 字段作为细分，没有的话用 shop 维度近似
        xianyuRows.forEach(r => {
            // 尝试从原始数据获取细分类型
            const type = r.orderSource || '闲鱼';
            if (!xianyuDetailMap[type]) {
                xianyuDetailMap[type] = { type, settledOrderCount: 0, settledAmount: 0, platformProfit: 0 };
            }
            xianyuDetailMap[type].settledOrderCount += r.settledOrderCount;
            xianyuDetailMap[type].settledAmount += r.settledAmount;
            xianyuDetailMap[type].platformProfit += r.platformProfit;
        });
        const xianyuDetail = Object.values(xianyuDetailMap);

        // 淘宝渠道细分
        const taobaoRows = rows.filter(r => r.channel === '淘宝' || r.channel === '淘宝中心场');
        const taobaoDetailMap = {};
        taobaoRows.forEach(r => {
            const type = r.channel;
            if (!taobaoDetailMap[type]) {
                taobaoDetailMap[type] = { type, settledOrderCount: 0, settledAmount: 0, platformProfit: 0 };
            }
            taobaoDetailMap[type].settledOrderCount += r.settledOrderCount;
            taobaoDetailMap[type].settledAmount += r.settledAmount;
            taobaoDetailMap[type].platformProfit += r.platformProfit;
        });
        const taobaoDetail = Object.values(taobaoDetailMap);

        // 分游戏聚合
        const gameMap = {};
        rows.forEach(r => {
            const g = r.gameName;
            if (!gameMap[g]) {
                gameMap[g] = {
                    gameName: g,
                    settledOrderCount: 0,
                    settledAmount: 0,
                    platformProfit: 0,
                    cancelCount: 0,
                    orderCount: 0
                };
            }
            gameMap[g].settledOrderCount += r.settledOrderCount;
            gameMap[g].settledAmount += r.settledAmount;
            gameMap[g].platformProfit += r.platformProfit;
            gameMap[g].cancelCount += r.cancelCount;
            gameMap[g].orderCount += r.orderCount;
        });
        const gameData = Object.values(gameMap);

        // 游戏维度撤单率
        gameData.forEach(g => {
            g.cancelRate = g.orderCount > 0 ? g.cancelCount / g.orderCount : 0;
        });

        // TOP20 按金额
        const top20ByAmount = [...gameData].sort((a, b) => b.settledAmount - a.settledAmount).slice(0, 20);
        // TOP20 按订单量
        const top20ByOrders = [...gameData].sort((a, b) => b.settledOrderCount - a.settledOrderCount).slice(0, 20);

        // TOP5游戏（按订单量）平均撤单率
        const top5Games = [...gameData].sort((a, b) => b.settledOrderCount - a.settledOrderCount).slice(0, 5);
        const top5AvgCancelRate = top5Games.length > 0
            ? top5Games.reduce((s, g) => s + g.cancelRate, 0) / top5Games.length
            : 0;

        // 店铺维度聚合（按转租商+店铺+游戏聚合，跨渠道汇总）
        // 使用 shopAggKey 确保手动开单按实际转租商分开归属（sublessorId为空时用 sublessorName 兜底）
        const shopMap = {};
        rows.forEach(r => {
            const key = shopAggKey(r.sublessorId, r.sublessorName, r.shopId, r.gameName);
            if (!shopMap[key]) {
                shopMap[key] = {
                    shopId: r.shopId,
                    shopName: r.shopName || (r.shopId ? '' : '手动开单'),
                    sublessorName: r.sublessorName,
                    sublessorId: r.sublessorId,
                    gameName: r.gameName,
                    channel: r.channel,
                    settledOrderCount: 0,
                    settledAmount: 0,
                    platformProfit: 0,
                    sublessorProfit: 0,
                    cancelCount: 0,
                    orderCount: 0
                };
            }
            shopMap[key].settledOrderCount += r.settledOrderCount;
            shopMap[key].settledAmount += r.settledAmount;
            shopMap[key].platformProfit += r.platformProfit;
            shopMap[key].sublessorProfit += r.sublessorProfit;
            shopMap[key].cancelCount += r.cancelCount;
            shopMap[key].orderCount += r.orderCount;
        });
        const shopData = Object.values(shopMap);

        // 店铺撤单率
        shopData.forEach(s => {
            s.cancelRate = s.orderCount > 0 ? s.cancelCount / s.orderCount : 0;
        });

        // 游戏下的店铺维度（用于异常预警下钻）
        // 使用 shopAggKey 避免不同转租商的手动开单被混淆
        const gameShopMap = {};
        rows.forEach(r => {
            if (!gameShopMap[r.gameName]) gameShopMap[r.gameName] = {};
            const key = shopAggKey(r.sublessorId, r.sublessorName, r.shopId);
            if (!gameShopMap[r.gameName][key]) {
                gameShopMap[r.gameName][key] = {
                    shopId: r.shopId,
                    shopName: r.shopName || (r.shopId ? '' : '手动开单'),
                    sublessorId: r.sublessorId,
                    sublessorName: r.sublessorName,
                    settledOrderCount: 0,
                    settledAmount: 0
                };
            }
            gameShopMap[r.gameName][key].settledOrderCount += r.settledOrderCount;
            gameShopMap[r.gameName][key].settledAmount += r.settledAmount;
        });

        // 商户-游戏撤单率预警数据（找出撤单率高于游戏均值的商户）
        const merchantCancelWarningList = [];
        shopData.forEach(s => {
            const game = gameData.find(g => g.gameName === s.gameName);
            if (game && s.orderCount >= 10 && s.cancelRate > game.cancelRate * 1.5) {
                merchantCancelWarningList.push({
                    shopName: s.shopName,
                    shopId: s.shopId,
                    gameName: s.gameName,
                    shopCancelRate: s.cancelRate,
                    gameCancelRate: game.cancelRate,
                    diff: s.cancelRate - game.cancelRate,
                    orderCount: s.orderCount
                });
            }
        });
        merchantCancelWarningList.sort((a, b) => b.diff - a.diff);

        // 渠道列表
        const channels = [...new Set(rows.map(r => r.channel))].filter(c => c && c !== '未知渠道');
        // 游戏列表
        const games = [...new Set(rows.map(r => r.gameName))].sort();

        return {
            dataType: 'sublet',
            dateRange,
            totals,
            channelData,
            xianyuDetail,
            taobaoDetail,
            gameData,
            top20ByAmount,
            top20ByOrders,
            top5AvgCancelRate,
            shopData,
            gameShopMap,
            merchantCancelWarningList,
            channels,
            games,
            rawRowCount: rows.length,
            hasChannelData: hasChannelData && channels.length > 0
        };
    }

    // ========== 分销数据处理 ==========
    function processDistributionData(rawRows, headers) {
        const f = DIST_FIELDS;
        const headerSet = new Set(headers.map(h => String(h).trim()));

        // 根据实际字段名调整
        const settledField = headerSet.has('正常结算订单量') ? '正常结算订单量' : (headerSet.has('正常订单量') ? '正常订单量' : '订单量');
        const selfOpField = headerSet.has('自营结算订单量') ? '自营结算订单量' : null;
        const nonSelfOpField = headerSet.has('非自营结算订单量') ? '非自营结算订单量' : null;

        // 分销商ID字段兼容：优先 user_id，若同时存在 userid 且 user_id 为短数值（内部ID），则用 userid（外部统一ID）
        let distIdField = f.distributorId;
        if (headerSet.has('userid') && headerSet.has(f.distributorId)) {
            // 检查 user_id 是否都是短数值（< 10位数字），如果是则用 userid
            const sampleId = rawRows.find(r => r[f.distributorId]);
            const sampleUserId = rawRows.find(r => r['userid']);
            if (sampleId && sampleUserId) {
                const idStr = String(sampleId[f.distributorId]);
                const uidStr = String(sampleUserId['userid']);
                // 如果 user_id 是短数字且 userid 更长（10+位），则 userid 是统一ID
                if (/^\d{1,9}$/.test(idStr) && uidStr.length >= 10) {
                    distIdField = 'userid';
                }
            }
        } else if (!headerSet.has(f.distributorId) && headerSet.has('userid')) {
            distIdField = 'userid';
        }

        // 用户实付字段兼容
        const userPayField = headerSet.has(f.userPayment) ? f.userPayment
            : (headerSet.has('实付金额') ? '实付金额' : f.orderAmount);

        const rows = rawRows.map(row => {
            return {
                date: row[f.date],
                distributorId: String(row[distIdField] || ''),
                distributorType: row[f.distributorType] || '未知类型',
                gameName: row[f.gameName] || '未知游戏',
                orderPortal: row[f.orderPortal] || '',
                isSelfOperated: row[f.isSelfOperated] || '',
                orderCount: safeNum(row[f.orderCount]),
                settledOrderCount: safeNum(row[settledField]),
                cancelCount: safeNum(row[f.cancelCount]),
                orderAmount: safeNum(row[f.orderAmount]),
                userPayment: safeNum(row[userPayField]),
                platformProfit: safeNum(row[f.platformProfit]),
                platformMarkup: safeNum(row[f.platformMarkup]),
                distributorProfit: safeNum(row[f.distributorProfit]),
                distributorMarkup: safeNum(row[f.distributorMarkup]),
                ownerProfit: safeNum(row[f.ownerProfit]),
                selfOperatedOrders: selfOpField ? safeNum(row[selfOpField]) : 0,
                nonSelfOperatedOrders: nonSelfOpField ? safeNum(row[nonSelfOpField]) : 0
            };
        });

        const dateRange = getDateRange(rows, 'date');

        // 总览 KPI
        const totals = rows.reduce((acc, r) => {
            acc.orderCount += r.orderCount;
            acc.settledOrderCount += r.settledOrderCount;
            acc.cancelCount += r.cancelCount;
            acc.orderAmount += r.orderAmount;
            acc.userPayment += r.userPayment;
            acc.platformProfit += r.platformProfit;
            acc.distributorProfit += r.distributorProfit;
            acc.distributorMarkup += r.distributorMarkup;
            acc.ownerProfit += r.ownerProfit;
            acc.selfOperatedOrders += r.selfOperatedOrders;
            acc.nonSelfOperatedOrders += r.nonSelfOperatedOrders;
            return acc;
        }, {
            orderCount: 0,
            settledOrderCount: 0,
            cancelCount: 0,
            orderAmount: 0,
            userPayment: 0,
            platformProfit: 0,
            distributorProfit: 0,
            distributorMarkup: 0,
            ownerProfit: 0,
            selfOperatedOrders: 0,
            nonSelfOperatedOrders: 0
        });

        totals.cancelRate = totals.orderCount > 0 ? totals.cancelCount / totals.orderCount : 0;
        totals.selfOperatedRatio = totals.settledOrderCount > 0 ? totals.selfOperatedOrders / totals.settledOrderCount : 0;
        totals.distributorTotalProfit = totals.distributorProfit + totals.distributorMarkup;

        // 分销商类型聚合
        const typeMap = {};
        rows.forEach(r => {
            const t = r.distributorType;
            if (!typeMap[t]) {
                typeMap[t] = {
                    type: t,
                    settledOrderCount: 0,
                    platformProfit: 0,
                    settledAmount: 0,
                    distributorProfit: 0,
                    orderCount: 0
                };
            }
            typeMap[t].settledOrderCount += r.settledOrderCount;
            typeMap[t].platformProfit += r.platformProfit;
            typeMap[t].settledAmount += r.userPayment;
            typeMap[t].distributorProfit += r.distributorProfit + r.distributorMarkup;
            typeMap[t].orderCount += r.orderCount;
        });
        const typeData = Object.values(typeMap).sort((a, b) => b.settledOrderCount - a.settledOrderCount);

        // 分游戏聚合
        const gameMap = {};
        rows.forEach(r => {
            const g = r.gameName;
            if (!gameMap[g]) {
                gameMap[g] = {
                    gameName: g,
                    settledOrderCount: 0,
                    settledAmount: 0,
                    platformProfit: 0,
                    distributorProfit: 0,
                    cancelCount: 0,
                    orderCount: 0
                };
            }
            gameMap[g].settledOrderCount += r.settledOrderCount;
            gameMap[g].settledAmount += r.userPayment;
            gameMap[g].platformProfit += r.platformProfit;
            gameMap[g].distributorProfit += r.distributorProfit + r.distributorMarkup;
            gameMap[g].cancelCount += r.cancelCount;
            gameMap[g].orderCount += r.orderCount;
        });
        const gameData = Object.values(gameMap);

        gameData.forEach(g => {
            g.cancelRate = g.orderCount > 0 ? g.cancelCount / g.orderCount : 0;
        });

        const top20ByAmount = [...gameData].sort((a, b) => b.settledAmount - a.settledAmount).slice(0, 20);
        const top20ByOrders = [...gameData].sort((a, b) => b.settledOrderCount - a.settledOrderCount).slice(0, 20);

        // TOP10游戏平均撤单率
        const top10Games = [...gameData].sort((a, b) => b.settledOrderCount - a.settledOrderCount).slice(0, 10);
        const top10AvgCancelRate = top10Games.length > 0
            ? top10Games.reduce((s, g) => s + g.cancelRate, 0) / top10Games.length
            : 0;

        // 分销商维度聚合（按游戏×分销商）
        const distMap = {};
        rows.forEach(r => {
            const key = r.distributorId + '_' + r.gameName;
            if (!distMap[key]) {
                distMap[key] = {
                    distributorId: r.distributorId,
                    gameName: r.gameName,
                    distributorType: r.distributorType,
                    settledOrderCount: 0,
                    settledAmount: 0,
                    platformProfit: 0,
                    distributorProfit: 0,
                    cancelCount: 0,
                    orderCount: 0
                };
            }
            distMap[key].settledOrderCount += r.settledOrderCount;
            distMap[key].settledAmount += r.userPayment;
            distMap[key].platformProfit += r.platformProfit;
            distMap[key].distributorProfit += r.distributorProfit + r.distributorMarkup;
            distMap[key].cancelCount += r.cancelCount;
            distMap[key].orderCount += r.orderCount;
        });
        const distributorGameData = Object.values(distMap);

        distributorGameData.forEach(d => {
            d.cancelRate = d.orderCount > 0 ? d.cancelCount / d.orderCount : 0;
        });

        // 分销商总维度（不区分游戏）
        const distTotalMap = {};
        rows.forEach(r => {
            const key = r.distributorId;
            if (!distTotalMap[key]) {
                distTotalMap[key] = {
                    distributorId: r.distributorId,
                    distributorType: r.distributorType,
                    settledOrderCount: 0,
                    settledAmount: 0,
                    platformProfit: 0,
                    distributorProfit: 0,
                    cancelCount: 0,
                    orderCount: 0
                };
            }
            distTotalMap[key].settledOrderCount += r.settledOrderCount;
            distTotalMap[key].settledAmount += r.userPayment;
            distTotalMap[key].platformProfit += r.platformProfit;
            distTotalMap[key].distributorProfit += r.distributorProfit + r.distributorMarkup;
            distTotalMap[key].cancelCount += r.cancelCount;
            distTotalMap[key].orderCount += r.orderCount;
        });
        const distributorData = Object.values(distTotalMap);

        // 游戏下的分销商维度（用于异常预警下钻）
        const gameDistributorMap = {};
        rows.forEach(r => {
            if (!gameDistributorMap[r.gameName]) gameDistributorMap[r.gameName] = {};
            const key = r.distributorId;
            if (!gameDistributorMap[r.gameName][key]) {
                gameDistributorMap[r.gameName][key] = {
                    distributorId: r.distributorId,
                    settledOrderCount: 0,
                    settledAmount: 0
                };
            }
            gameDistributorMap[r.gameName][key].settledOrderCount += r.settledOrderCount;
            gameDistributorMap[r.gameName][key].settledAmount += r.userPayment;
        });

        // 商户-游戏撤单率预警
        const merchantCancelWarningList = [];
        distributorGameData.forEach(d => {
            const game = gameData.find(g => g.gameName === d.gameName);
            if (game && d.orderCount >= 10 && d.cancelRate > game.cancelRate * 1.5) {
                merchantCancelWarningList.push({
                    distributorId: d.distributorId,
                    gameName: d.gameName,
                    merchantCancelRate: d.cancelRate,
                    gameCancelRate: game.cancelRate,
                    diff: d.cancelRate - game.cancelRate,
                    orderCount: d.orderCount
                });
            }
        });
        merchantCancelWarningList.sort((a, b) => b.diff - a.diff);

        const games = [...new Set(rows.map(r => r.gameName))].sort();
        const distributorTypes = [...new Set(rows.map(r => r.distributorType))].filter(t => t);

        return {
            dataType: 'distribution',
            dateRange,
            totals,
            typeData,
            gameData,
            top20ByAmount,
            top20ByOrders,
            top10AvgCancelRate,
            distributorGameData,
            distributorData,
            gameDistributorMap,
            merchantCancelWarningList,
            games,
            distributorTypes,
            rawRowCount: rows.length
        };
    }

    // ========== 环比计算 ==========
    function computeComparison(thisWeek, lastWeek, dataType) {
        if (!thisWeek || !lastWeek) return null;

        const result = {
            totals: {},
            dateRange: thisWeek.dateRange
        };

        // 总览KPI环比
        const tw = thisWeek.totals;
        const lw = lastWeek.totals;

        result.totals.settledAmount = {
            current: tw.settledAmount || tw.userPayment || 0,
            last: lw.settledAmount || lw.userPayment || 0,
            change: (tw.settledAmount || tw.userPayment || 0) - (lw.settledAmount || lw.userPayment || 0),
            changeRate: calcChangeRate(tw.settledAmount || tw.userPayment || 0, lw.settledAmount || lw.userPayment || 0)
        };

        result.totals.settledOrderCount = {
            current: tw.settledOrderCount,
            last: lw.settledOrderCount,
            change: tw.settledOrderCount - lw.settledOrderCount,
            changeRate: calcChangeRate(tw.settledOrderCount, lw.settledOrderCount)
        };

        result.totals.cancelRate = {
            current: tw.cancelRate,
            last: lw.cancelRate,
            change: tw.cancelRate - lw.cancelRate,
            changePct: (tw.cancelRate - lw.cancelRate) * 100 // 百分点变化
        };

        result.totals.platformProfit = {
            current: tw.platformProfit,
            last: lw.platformProfit,
            change: tw.platformProfit - lw.platformProfit,
            changeRate: calcChangeRate(tw.platformProfit, lw.platformProfit)
        };

        if (dataType === 'sublet') {
            result.totals.shipSuccessRate = {
                current: tw.shipSuccessRate || 0,
                last: lw.shipSuccessRate || 0,
                change: (tw.shipSuccessRate || 0) - (lw.shipSuccessRate || 0)
            };
            // 月累计估算（用当前数据日均值 * 当月天数，这里简化为直接展示当前数据）
            result.totals.monthPlatformProfit = tw.platformProfit;
            result.totals.monthOrders = tw.settledOrderCount;
        }

        if (dataType === 'distribution') {
            result.totals.distributorProfit = {
                current: tw.distributorTotalProfit || 0,
                last: lw.distributorTotalProfit || 0,
                change: (tw.distributorTotalProfit || 0) - (lw.distributorTotalProfit || 0),
                changeRate: calcChangeRate(tw.distributorTotalProfit || 0, lw.distributorTotalProfit || 0)
            };
            result.totals.selfOperatedRatio = tw.selfOperatedRatio || 0;
        }

        // 渠道环比（转租）
        if (dataType === 'sublet' && thisWeek.channelData && lastWeek.channelData) {
            const twHasChannel = thisWeek.hasChannelData !== false && thisWeek.channels && thisWeek.channels.length > 0;
            const lwHasChannel = lastWeek.hasChannelData !== false && lastWeek.channels && lastWeek.channels.length > 0;

            if (twHasChannel && lwHasChannel) {
                // 两周都有渠道数据，按渠道精确匹配
                result.channelComparison = thisWeek.channelData.map(ch => {
                    const lastCh = lastWeek.channelData.find(c => c.channel === ch.channel) || { settledOrderCount: 0, platformProfit: 0, settledAmount: 0 };
                    return {
                        channel: ch.channel,
                        currentOrders: ch.settledOrderCount,
                        lastOrders: lastCh.settledOrderCount,
                        ordersChange: ch.settledOrderCount - lastCh.settledOrderCount,
                        ordersChangeRate: calcChangeRate(ch.settledOrderCount, lastCh.settledOrderCount),
                        currentProfit: ch.platformProfit,
                        lastProfit: lastCh.platformProfit,
                        profitChange: ch.platformProfit - lastCh.platformProfit,
                        profitChangeRate: calcChangeRate(ch.platformProfit, lastCh.platformProfit),
                        currentAmount: ch.settledAmount,
                        lastAmount: lastCh.settledAmount
                    };
                });
            } else if (twHasChannel) {
                // 仅本周有渠道数据，上周无渠道细分，展示本周各渠道 + 上周总计
                const lwTotal = lastWeek.totals;
                result.channelComparison = thisWeek.channelData.map(ch => {
                    return {
                        channel: ch.channel,
                        currentOrders: ch.settledOrderCount,
                        lastOrders: 0,
                        ordersChange: ch.settledOrderCount,
                        ordersChangeRate: 1,
                        currentProfit: ch.platformProfit,
                        lastProfit: 0,
                        profitChange: ch.platformProfit,
                        profitChangeRate: 1,
                        currentAmount: ch.settledAmount,
                        lastAmount: 0
                    };
                });
                // 添加一个总计项用于对比
                result.channelComparison.push({
                    channel: '上周总计',
                    currentOrders: thisWeek.totals.settledOrderCount,
                    lastOrders: lwTotal.settledOrderCount,
                    ordersChange: thisWeek.totals.settledOrderCount - lwTotal.settledOrderCount,
                    ordersChangeRate: calcChangeRate(thisWeek.totals.settledOrderCount, lwTotal.settledOrderCount),
                    currentProfit: thisWeek.totals.platformProfit,
                    lastProfit: lwTotal.platformProfit,
                    profitChange: thisWeek.totals.platformProfit - lwTotal.platformProfit,
                    profitChangeRate: calcChangeRate(thisWeek.totals.platformProfit, lwTotal.platformProfit),
                    currentAmount: thisWeek.totals.settledAmount,
                    lastAmount: lwTotal.settledAmount,
                    isTotalRow: true
                });
            } else {
                // 都没有渠道数据，只有一条总计对比
                result.channelComparison = [{
                    channel: '总计',
                    currentOrders: thisWeek.totals.settledOrderCount,
                    lastOrders: lastWeek.totals.settledOrderCount,
                    ordersChange: thisWeek.totals.settledOrderCount - lastWeek.totals.settledOrderCount,
                    ordersChangeRate: calcChangeRate(thisWeek.totals.settledOrderCount, lastWeek.totals.settledOrderCount),
                    currentProfit: thisWeek.totals.platformProfit,
                    lastProfit: lastWeek.totals.platformProfit,
                    profitChange: thisWeek.totals.platformProfit - lastWeek.totals.platformProfit,
                    profitChangeRate: calcChangeRate(thisWeek.totals.platformProfit, lastWeek.totals.platformProfit),
                    currentAmount: thisWeek.totals.settledAmount,
                    lastAmount: lastWeek.totals.settledAmount
                }];
            }
        }

        // 游戏环比
        if (thisWeek.gameData && lastWeek.gameData) {
            const gameMap = {};
            thisWeek.gameData.forEach(g => {
                gameMap[g.gameName] = { gameName: g.gameName, current: g };
            });
            lastWeek.gameData.forEach(g => {
                if (!gameMap[g.gameName]) {
                    gameMap[g.gameName] = { gameName: g.gameName, current: { settledOrderCount: 0, settledAmount: 0, platformProfit: 0, cancelRate: 0, orderCount: 0 } };
                }
                gameMap[g.gameName].last = g;
            });

            result.gameComparison = Object.values(gameMap).map(item => {
                const cur = item.current;
                const lst = item.last || { settledOrderCount: 0, settledAmount: 0, platformProfit: 0, cancelRate: 0, orderCount: 0 };
                return {
                    gameName: item.gameName,
                    currentOrders: cur.settledOrderCount,
                    lastOrders: lst.settledOrderCount,
                    ordersChange: cur.settledOrderCount - lst.settledOrderCount,
                    ordersChangeRate: calcChangeRate(cur.settledOrderCount, lst.settledOrderCount),
                    currentAmount: cur.settledAmount,
                    lastAmount: lst.settledAmount,
                    amountChange: cur.settledAmount - lst.settledAmount,
                    amountChangeRate: calcChangeRate(cur.settledAmount, lst.settledAmount),
                    currentProfit: cur.platformProfit,
                    lastProfit: lst.platformProfit,
                    profitChange: cur.platformProfit - lst.platformProfit,
                    profitChangeRate: calcChangeRate(cur.platformProfit, lst.platformProfit),
                    currentCancelRate: cur.cancelRate || 0,
                    lastCancelRate: lst.cancelRate || 0
                };
            });

            // 增长TOP20
            result.growthTop20 = result.gameComparison
                .filter(g => g.ordersChange > 0 && g.lastOrders > 0)
                .sort((a, b) => b.ordersChange - a.ordersChange)
                .slice(0, 20);

            // 下降TOP20
            result.declineTop20 = result.gameComparison
                .filter(g => g.ordersChange < 0 && g.currentOrders > 0)
                .sort((a, b) => a.ordersChange - b.ordersChange)
                .slice(0, 20);

            // TOP20金额榜+环比
            result.top20AmountWithChange = result.gameComparison
                .sort((a, b) => b.currentAmount - a.currentAmount)
                .slice(0, 20);

            // TOP20订单量榜+环比
            result.top20OrdersWithChange = result.gameComparison
                .sort((a, b) => b.currentOrders - a.currentOrders)
                .slice(0, 20);
        }

        // 店铺环比（转租）
        if (dataType === 'sublet' && thisWeek.shopData && lastWeek.shopData) {
            const twHasChannel = thisWeek.hasChannelData !== false && thisWeek.channels && thisWeek.channels.length > 0;
            const lwHasChannel = lastWeek.hasChannelData !== false && lastWeek.channels && lastWeek.channels.length > 0;

            // 辅助：按 sublessorId + shopId + gameName 聚合 shopData（跨渠道汇总）
            // 使用 shopAggKey 确保手动开单按实际转租商分开归属
            function aggregateByShopGame(shopDataArr) {
                const aggMap = {};
                shopDataArr.forEach(s => {
                    const key = shopAggKey(s.sublessorId, s.sublessorName, s.shopId, s.gameName);
                    if (!aggMap[key]) {
                        aggMap[key] = {
                            shopId: s.shopId,
                            shopName: s.shopName,
                            sublessorName: s.sublessorName,
                            sublessorId: s.sublessorId,
                            gameName: s.gameName,
                            channel: '',
                            settledOrderCount: 0,
                            settledAmount: 0,
                            platformProfit: 0,
                            sublessorProfit: 0,
                            cancelCount: 0,
                            orderCount: 0
                        };
                    }
                    aggMap[key].settledOrderCount += s.settledOrderCount;
                    aggMap[key].settledAmount += s.settledAmount;
                    aggMap[key].platformProfit += s.platformProfit;
                    aggMap[key].sublessorProfit += s.sublessorProfit;
                    aggMap[key].cancelCount += s.cancelCount;
                    aggMap[key].orderCount += s.orderCount;
                    // 保留非空名称
                    if (s.shopName && !aggMap[key].shopName) aggMap[key].shopName = s.shopName;
                    if (s.sublessorName && !aggMap[key].sublessorName) aggMap[key].sublessorName = s.sublessorName;
                });
                return Object.values(aggMap);
            }

            let twShopData, lwShopData;
            let useChannelKey = true;

            if (twHasChannel && lwHasChannel) {
                // 两周都有渠道数据，使用完整 key
                twShopData = thisWeek.shopData;
                lwShopData = lastWeek.shopData;
                useChannelKey = true;
            } else {
                // 任一周无渠道数据，按 shop+game 聚合后匹配
                twShopData = aggregateByShopGame(thisWeek.shopData);
                lwShopData = aggregateByShopGame(lastWeek.shopData);
                useChannelKey = false;
            }

            const shopMap = {};
            twShopData.forEach(s => {
                const key = useChannelKey
                    ? shopAggKey(s.sublessorId, s.sublessorName, s.shopId, s.gameName, s.channel)
                    : shopAggKey(s.sublessorId, s.sublessorName, s.shopId, s.gameName);
                shopMap[key] = { shop: s, current: s };
            });
            lwShopData.forEach(s => {
                const key = useChannelKey
                    ? shopAggKey(s.sublessorId, s.sublessorName, s.shopId, s.gameName, s.channel)
                    : shopAggKey(s.sublessorId, s.sublessorName, s.shopId, s.gameName);
                if (!shopMap[key]) {
                    shopMap[key] = {
                        shop: { ...s, settledOrderCount: 0, settledAmount: 0, platformProfit: 0, sublessorProfit: 0, orderCount: 0, cancelCount: 0 },
                        current: { settledOrderCount: 0, settledAmount: 0, platformProfit: 0, sublessorProfit: 0, orderCount: 0, cancelCount: 0 }
                    };
                }
                shopMap[key].last = s;
            });

            result.shopComparison = Object.values(shopMap).map(item => {
                const cur = item.current;
                const lst = item.last || { settledOrderCount: 0, settledAmount: 0, platformProfit: 0, sublessorProfit: 0, orderCount: 0, cancelCount: 0 };
                return {
                    shopId: item.shop.shopId,
                    shopName: item.shop.shopName,
                    sublessorName: item.shop.sublessorName,
                    gameName: item.shop.gameName,
                    channel: item.shop.channel,
                    currentOrders: cur.settledOrderCount,
                    lastOrders: lst.settledOrderCount,
                    ordersChange: cur.settledOrderCount - lst.settledOrderCount,
                    ordersChangeRate: calcChangeRate(cur.settledOrderCount, lst.settledOrderCount),
                    currentAmount: cur.settledAmount,
                    lastAmount: lst.settledAmount,
                    amountChange: cur.settledAmount - lst.settledAmount,
                    amountChangeRate: calcChangeRate(cur.settledAmount, lst.settledAmount),
                    currentProfit: cur.platformProfit,
                    lastProfit: lst.platformProfit,
                    profitChange: cur.platformProfit - lst.platformProfit,
                    profitChangeRate: calcChangeRate(cur.platformProfit, lst.platformProfit)
                };
            });
        }

        // 分销商环比（分销）
        if (dataType === 'distribution' && thisWeek.distributorData && lastWeek.distributorData) {
            const distMap = {};
            thisWeek.distributorData.forEach(d => {
                distMap[d.distributorId] = { dist: d, current: d };
            });
            lastWeek.distributorData.forEach(d => {
                if (!distMap[d.distributorId]) {
                    distMap[d.distributorId] = {
                        dist: { ...d, settledOrderCount: 0, settledAmount: 0, platformProfit: 0, distributorProfit: 0, orderCount: 0, cancelCount: 0 },
                        current: { settledOrderCount: 0, settledAmount: 0, platformProfit: 0, distributorProfit: 0, orderCount: 0, cancelCount: 0 }
                    };
                }
                distMap[d.distributorId].last = d;
            });

            result.distributorComparison = Object.values(distMap).map(item => {
                const cur = item.current;
                const lst = item.last || { settledOrderCount: 0, settledAmount: 0, platformProfit: 0, distributorProfit: 0, orderCount: 0, cancelCount: 0 };
                return {
                    distributorId: item.dist.distributorId,
                    distributorType: item.dist.distributorType,
                    currentOrders: cur.settledOrderCount,
                    lastOrders: lst.settledOrderCount,
                    ordersChange: cur.settledOrderCount - lst.settledOrderCount,
                    ordersChangeRate: calcChangeRate(cur.settledOrderCount, lst.settledOrderCount),
                    currentAmount: cur.settledAmount,
                    lastAmount: lst.settledAmount,
                    amountChange: cur.settledAmount - lst.settledAmount,
                    amountChangeRate: calcChangeRate(cur.settledAmount, lst.settledAmount),
                    currentProfit: cur.platformProfit,
                    lastProfit: lst.platformProfit,
                    profitChange: cur.platformProfit - lst.platformProfit,
                    profitChangeRate: calcChangeRate(cur.platformProfit, lst.platformProfit)
                };
            });
        }

        // 游戏×转租商交叉分析（转租）—— 两级结构：转租商 → 店铺
        if (dataType === 'sublet' && thisWeek.shopData) {
            result.subletCrossAnalysis = {};

            // ========== 上周数据聚合 ==========
            // 上周店铺级聚合：按 sublessorId/Name + shopId + gameName（跨渠道）
            const lastWeekShopMap = {};
            // 上周转租商级聚合：按 sublessorId/Name + gameName
            const lastWeekSublessorMap = {};
            if (lastWeek && lastWeek.shopData) {
                lastWeek.shopData.forEach(s => {
                    const shopKey = shopAggKey(s.sublessorId, s.sublessorName, s.shopId, s.gameName);
                    const subKey = shopAggKey(s.sublessorId, s.sublessorName, '', s.gameName);

                    if (!lastWeekShopMap[shopKey]) {
                        lastWeekShopMap[shopKey] = {
                            settledOrderCount: 0, settledAmount: 0,
                            platformProfit: 0, sublessorProfit: 0
                        };
                    }
                    lastWeekShopMap[shopKey].settledOrderCount += s.settledOrderCount;
                    lastWeekShopMap[shopKey].settledAmount += s.settledAmount;
                    lastWeekShopMap[shopKey].platformProfit += s.platformProfit;
                    lastWeekShopMap[shopKey].sublessorProfit += s.sublessorProfit;

                    if (!lastWeekSublessorMap[subKey]) {
                        lastWeekSublessorMap[subKey] = {
                            settledOrderCount: 0, settledAmount: 0,
                            platformProfit: 0, sublessorProfit: 0
                        };
                    }
                    lastWeekSublessorMap[subKey].settledOrderCount += s.settledOrderCount;
                    lastWeekSublessorMap[subKey].settledAmount += s.settledAmount;
                    lastWeekSublessorMap[subKey].platformProfit += s.platformProfit;
                    lastWeekSublessorMap[subKey].sublessorProfit += s.sublessorProfit;
                });
            }

            // ========== 本周数据聚合 ==========
            // 本周店铺级聚合：按 sublessorId + shopId + gameName（跨渠道）
            const thisWeekShopMap = {};
            // 本周转租商级聚合：按 sublessorId + gameName，并挂店铺列表
            const thisWeekSublessorMap = {};

            thisWeek.shopData.forEach(s => {
                const shopKey = shopAggKey(s.sublessorId, s.sublessorName, s.shopId, s.gameName);
                const subKey = shopAggKey(s.sublessorId, s.sublessorName, '', s.gameName);

                // 店铺级聚合
                if (!thisWeekShopMap[shopKey]) {
                    thisWeekShopMap[shopKey] = {
                        shopId: s.shopId, shopName: s.shopName,
                        sublessorName: s.sublessorName, sublessorId: s.sublessorId,
                        gameName: s.gameName, channel: s.channel,
                        settledAmount: 0, settledOrderCount: 0,
                        sublessorProfit: 0, platformProfit: 0,
                        orderCount: 0, cancelCount: 0
                    };
                }
                thisWeekShopMap[shopKey].settledAmount += s.settledAmount;
                thisWeekShopMap[shopKey].settledOrderCount += s.settledOrderCount;
                thisWeekShopMap[shopKey].sublessorProfit += s.sublessorProfit;
                thisWeekShopMap[shopKey].platformProfit += s.platformProfit;
                thisWeekShopMap[shopKey].orderCount += s.orderCount;
                thisWeekShopMap[shopKey].cancelCount += s.cancelCount;
                // 保留非空名称
                if (s.shopName && !thisWeekShopMap[shopKey].shopName) thisWeekShopMap[shopKey].shopName = s.shopName;
                if (s.sublessorName && !thisWeekShopMap[shopKey].sublessorName) thisWeekShopMap[shopKey].sublessorName = s.sublessorName;
                if (s.channel && !thisWeekShopMap[shopKey].channel) thisWeekShopMap[shopKey].channel = s.channel;

                // 转租商级聚合
                if (!thisWeekSublessorMap[subKey]) {
                    thisWeekSublessorMap[subKey] = {
                        sublessorId: s.sublessorId, sublessorName: s.sublessorName,
                        gameName: s.gameName,
                        settledAmount: 0, settledOrderCount: 0,
                        sublessorProfit: 0, platformProfit: 0,
                        orderCount: 0, cancelCount: 0,
                        shopIds: new Set()
                    };
                }
                thisWeekSublessorMap[subKey].settledAmount += s.settledAmount;
                thisWeekSublessorMap[subKey].settledOrderCount += s.settledOrderCount;
                thisWeekSublessorMap[subKey].sublessorProfit += s.sublessorProfit;
                thisWeekSublessorMap[subKey].platformProfit += s.platformProfit;
                thisWeekSublessorMap[subKey].orderCount += s.orderCount;
                thisWeekSublessorMap[subKey].cancelCount += s.cancelCount;
                thisWeekSublessorMap[subKey].shopIds.add(s.shopId || '');
                if (s.sublessorName && !thisWeekSublessorMap[subKey].sublessorName) {
                    thisWeekSublessorMap[subKey].sublessorName = s.sublessorName;
                }
            });

            // 对每个游戏构建转租商列表，每个转租商下挂店铺列表
            thisWeek.games.forEach(game => {
                // 1. 收集该游戏下所有转租商
                const sublessors = Object.values(thisWeekSublessorMap)
                    .filter(s => s.gameName === game)
                    .map(s => {
                        const last = lastWeekSublessorMap[shopAggKey(s.sublessorId, s.sublessorName, '', game)] || {
                            settledOrderCount: 0, settledAmount: 0,
                            platformProfit: 0, sublessorProfit: 0
                        };
                        return {
                            sublessorId: s.sublessorId,
                            sublessorName: s.sublessorName || '未知转租商',
                            settledAmount: s.settledAmount,
                            settledOrderCount: s.settledOrderCount,
                            sublessorProfit: s.sublessorProfit,
                            platformProfit: s.platformProfit,
                            lastSettledAmount: last.settledAmount || 0,
                            lastSettledOrderCount: last.settledOrderCount || 0,
                            lastSublessorProfit: last.sublessorProfit || 0,
                            lastPlatformProfit: last.platformProfit || 0,
                            amountChange: s.settledAmount - (last.settledAmount || 0),
                            amountChangeRate: calcChangeRate(s.settledAmount, last.settledAmount || 0),
                            ordersChange: s.settledOrderCount - (last.settledOrderCount || 0),
                            ordersChangeRate: calcChangeRate(s.settledOrderCount, last.settledOrderCount || 0),
                            shopCount: s.shopIds.size,
                            shops: [] // 店铺列表在下面填充
                        };
                    })
                    .sort((a, b) => b.settledAmount - a.settledAmount);

                // 2. 计算转租商分级（S/A/B/C/D，基于金额排名）
                const total = sublessors.length;
                sublessors.forEach((sub, idx) => {
                    const pct = (idx + 1) / total;
                    if (pct <= 0.2) sub.grade = 'S';
                    else if (pct <= 0.4) sub.grade = 'A';
                    else if (pct <= 0.6) sub.grade = 'B';
                    else if (pct <= 0.8) sub.grade = 'C';
                    else sub.grade = 'D';
                });

                // 3. 为每个转租商填充其下的店铺列表
                sublessors.forEach(sub => {
                    const subShops = Object.values(thisWeekShopMap)
                        .filter(s => {
                            // 匹配转租商：优先按 sublessorId，若为空则按 sublessorName 兜底
                            if (sub.sublessorId && s.sublessorId) {
                                return s.gameName === game && s.sublessorId === sub.sublessorId;
                            }
                            return s.gameName === game && s.sublessorName === sub.sublessorName;
                        })
                        .map(s => {
                            const lastShopKey = shopAggKey(s.sublessorId, s.sublessorName, s.shopId, game);
                            const last = lastWeekShopMap[lastShopKey] || {
                                settledOrderCount: 0, settledAmount: 0,
                                platformProfit: 0, sublessorProfit: 0
                            };
                            return {
                                shopId: s.shopId,
                                shopName: s.shopName || '',
                                channel: s.channel || '',
                                settledAmount: s.settledAmount,
                                settledOrderCount: s.settledOrderCount,
                                platformProfit: s.platformProfit,
                                lastSettledAmount: last.settledAmount || 0,
                                lastSettledOrderCount: last.settledOrderCount || 0,
                                lastPlatformProfit: last.platformProfit || 0,
                                amountChange: s.settledAmount - (last.settledAmount || 0),
                                amountChangeRate: calcChangeRate(s.settledAmount, last.settledAmount || 0),
                                ordersChange: s.settledOrderCount - (last.settledOrderCount || 0),
                                ordersChangeRate: calcChangeRate(s.settledOrderCount, last.settledOrderCount || 0)
                            };
                        })
                        .sort((a, b) => b.settledAmount - a.settledAmount); // 店铺按金额从高到低
                    sub.shops = subShops;
                });

                result.subletCrossAnalysis[game] = sublessors;
            });

            // TOP10游戏（按结算金额排序）
            result.subletTop10Games = [...thisWeek.gameData]
                .sort((a, b) => b.settledAmount - a.settledAmount)
                .slice(0, 10)
                .map(g => g.gameName);
        }

        // 游戏×分销商交叉分析（分销）
        if (dataType === 'distribution' && thisWeek.distributorGameData) {
            result.crossAnalysis = {};
            thisWeek.games.forEach(game => {
                result.crossAnalysis[game] = thisWeek.distributorGameData
                    .filter(d => d.gameName === game)
                    .map(d => ({
                        distributorId: d.distributorId,
                        amount: d.settledAmount,
                        orders: d.settledOrderCount,
                        distributorProfit: d.distributorProfit,
                        platformProfit: d.platformProfit,
                        cancelRate: d.cancelRate
                    }));
            });
        }

        return result;
    }

    // ========== 店铺/分销商下钻数据（异常预警） ==========
    function getShopBreakdown(thisWeekData, lastWeekData, gameName) {
        const twShops = thisWeekData.gameShopMap?.[gameName] || {};
        const lwShops = lastWeekData?.gameShopMap?.[gameName] || {};
        
        const allShopKeys = new Set([...Object.keys(twShops), ...Object.keys(lwShops)]);
        const result = [];
        
        allShopKeys.forEach(key => {
            const tw = twShops[key] || { shopName: '', sublessorName: '', settledOrderCount: 0, settledAmount: 0 };
            const lw = lwShops[key] || { shopName: '', sublessorName: '', settledOrderCount: 0, settledAmount: 0 };
            const displayName = tw.shopName || lw.shopName || tw.shopId || key;
            const subName = tw.sublessorName || lw.sublessorName || '';
            result.push({
                shopId: tw.shopId || lw.shopId || '',
                shopName: displayName + (subName ? `（${subName}）` : ''),
                sublessorName: subName,
                currentOrders: tw.settledOrderCount,
                lastOrders: lw.settledOrderCount,
                ordersChange: tw.settledOrderCount - lw.settledOrderCount,
                currentAmount: tw.settledAmount,
                lastAmount: lw.settledAmount,
                amountChange: tw.settledAmount - lw.settledAmount
            });
        });
        
        return result.sort((a, b) => b.ordersChange - a.ordersChange);
    }

    function getDistributorBreakdown(thisWeekData, lastWeekData, gameName) {
        const twDists = thisWeekData.gameDistributorMap?.[gameName] || {};
        const lwDists = lastWeekData?.gameDistributorMap?.[gameName] || {};
        
        const allDistIds = new Set([...Object.keys(twDists), ...Object.keys(lwDists)]);
        const result = [];
        
        allDistIds.forEach(id => {
            const tw = twDists[id] || { settledOrderCount: 0, settledAmount: 0 };
            const lw = lwDists[id] || { settledOrderCount: 0, settledAmount: 0 };
            result.push({
                distributorId: id,
                currentOrders: tw.settledOrderCount,
                lastOrders: lw.settledOrderCount,
                ordersChange: tw.settledOrderCount - lw.settledOrderCount,
                currentAmount: tw.settledAmount,
                lastAmount: lw.settledAmount,
                amountChange: tw.settledAmount - lw.settledAmount
            });
        });
        
        return result.sort((a, b) => b.ordersChange - a.ordersChange);
    }

    // ========== 从 URL 读取 Excel ==========
    async function loadExcelFromUrl(url) {
        if (typeof XLSX === 'undefined' || typeof XLSX.read !== 'function') {
            throw new Error('Excel 解析组件加载失败，请刷新页面重试。');
        }

        console.log('[DataProcessor] 从 URL 加载 Excel:', url);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('文件下载失败，HTTP 状态码: ' + response.status + '。请检查链接是否有效、是否具有公开读取权限。');
        }

        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);

        console.log('[DataProcessor] URL 文件下载完成，数据长度:', data.length, '字节');

        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        console.log('[DataProcessor] Excel 解析完成，工作表:', workbook.SheetNames.join(', '), '，行数:', jsonData.length);

        return {
            sheetNames: workbook.SheetNames,
            rows: jsonData,
            headers: jsonData.length > 0 ? Object.keys(jsonData[0]) : []
        };
    }

    // ========== 公共 API ==========
    return {
        readExcelFile,
        loadExcelFromUrl,
        detectDataType,
        processSubletData,
        processDistributionData,
        computeComparison,
        getShopBreakdown,
        getDistributorBreakdown,
        formatMoney,
        formatInt,
        formatPercent,
        formatDateDisplay,
        calcChangeRate,
        safeNum
    };
})();
