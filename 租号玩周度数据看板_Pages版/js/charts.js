/**
 * 图表配置模块
 * 负责所有 ECharts 图表的配置和渲染
 */
const ChartManager = (function() {
    'use strict';

    // 存储所有图表实例
    const charts = {};

    // 颜色配置
    const colors = {
        primary: '#1e3a5f',
        primaryLight: '#2c5282',
        accent: '#f97316',
        accentLight: '#fb923c',
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6',
        purple: '#8b5cf6',
        pink: '#ec4899',
        teal: '#14b8a6',
        gray: '#94a3b8'
    };

    const colorPalette = [
        '#1e3a5f', '#f97316', '#10b981', '#3b82f6', '#8b5cf6',
        '#ec4899', '#14b8a6', '#f59e0b', '#6366f1', '#06b6d4',
        '#84cc16', '#f43f5e', '#0ea5e9', '#a855f7', '#22c55e'
    ];

    // 通用 tooltip 配置
    const commonTooltip = {
        backgroundColor: 'rgba(15, 39, 68, 0.95)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        textStyle: {
            color: '#fff',
            fontSize: 13
        },
        padding: [10, 14]
    };

    // 通用 grid 配置
    const commonGrid = {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '10%',
        containLabel: true
    };

    // ========== 初始化图表 ==========
    function initChart(domId) {
        const dom = document.getElementById(domId);
        if (!dom) return null;
        const chart = echarts.init(dom);
        charts[domId] = chart;
        
        // 响应式
        window.addEventListener('resize', () => {
            chart.resize();
        });
        
        return chart;
    }

    function getChart(domId) {
        return charts[domId] || initChart(domId);
    }

    // ========== 渠道柱状图（订单量） ==========
    function renderChannelOrdersChart(domId, data, comparisonData) {
        const chart = getChart(domId);
        if (!chart) return;

        const channels = data.map(d => d.channel);
        const currentOrders = data.map(d => d.settledOrderCount);

        // 检查是否有上周总计行（表示上周无渠道细分数据）
        const hasTotalRow = comparisonData && comparisonData.channelComparison &&
            comparisonData.channelComparison.some(c => c.isTotalRow);

        let changeRates = null;
        if (comparisonData && comparisonData.channelComparison) {
            changeRates = channels.map(ch => {
                const item = comparisonData.channelComparison.find(c => c.channel === ch);
                return item ? (item.ordersChangeRate * 100).toFixed(1) : null;
            });
        }

        const option = {
            tooltip: {
                ...commonTooltip,
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: function(params) {
                    let html = `<strong>${params[0].name}</strong><br/>`;
                    params.forEach(p => {
                        html += `${p.marker} ${p.seriesName}: ${p.value.toLocaleString()}<br/>`;
                    });
                    if (changeRates) {
                        const idx = params[0].dataIndex;
                        const rate = changeRates[idx];
                        if (rate !== null && !hasTotalRow) {
                            const r = parseFloat(rate);
                            const color = r >= 0 ? '#ef4444' : '#10b981';
                            const arrow = r >= 0 ? '↑' : '↓';
                            html += `<span style="color:${color}">环比 ${arrow} ${Math.abs(r)}%</span>`;
                        } else if (hasTotalRow) {
                            const totalItem = comparisonData.channelComparison.find(c => c.isTotalRow);
                            if (totalItem) {
                                const r = (totalItem.ordersChangeRate * 100).toFixed(1);
                                const color = totalItem.ordersChangeRate >= 0 ? '#ef4444' : '#10b981';
                                const arrow = totalItem.ordersChangeRate >= 0 ? '↑' : '↓';
                                html += `<span style="color:#94a3b8;font-size:11px;">上周无渠道细分</span><br/>`;
                                html += `<span style="color:${color}">总计环比 ${arrow} ${Math.abs(parseFloat(r))}%</span>`;
                            }
                        }
                    }
                    return html;
                }
            },
            grid: commonGrid,
            xAxis: {
                type: 'category',
                data: channels,
                axisLabel: {
                    color: '#64748b',
                    fontSize: 12,
                    rotate: channels.length > 6 ? 30 : 0
                },
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value',
                axisLabel: { color: '#64748b', fontSize: 12 },
                axisLine: { show: false },
                splitLine: { lineStyle: { color: '#f1f5f9' } }
            },
            series: [{
                name: '结算订单量',
                type: 'bar',
                data: currentOrders,
                barWidth: '40%',
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: '#2c5282' },
                        { offset: 1, color: '#1e3a5f' }
                    ]),
                    borderRadius: [4, 4, 0, 0]
                },
                label: {
                    show: true,
                    position: 'top',
                    color: '#1e3a5f',
                    fontSize: 11,
                    formatter: function(p) {
                        if (p.value >= 10000) return (p.value / 10000).toFixed(1) + 'w';
                        return p.value;
                    }
                }
            }]
        };

        chart.setOption(option);
    }

    // ========== 渠道收益折线图 ==========
    function renderChannelProfitChart(domId, data, comparisonData) {
        const chart = getChart(domId);
        if (!chart) return;

        const channels = data.map(d => d.channel);
        const profits = data.map(d => d.platformProfit);
        const amounts = data.map(d => d.settledAmount);

        const option = {
            tooltip: {
                ...commonTooltip,
                trigger: 'axis',
                formatter: function(params) {
                    let html = `<strong>${params[0].name}</strong><br/>`;
                    params.forEach(p => {
                        const val = p.value;
                        const formatted = val >= 10000 ? (val / 10000).toFixed(2) + '万' : val.toFixed(2);
                        html += `${p.marker} ${p.seriesName}: ¥${formatted}<br/>`;
                    });
                    return html;
                }
            },
            legend: {
                data: ['平台收益', '结算金额'],
                top: 0,
                right: 0,
                textStyle: { color: '#64748b', fontSize: 12 }
            },
            grid: commonGrid,
            xAxis: {
                type: 'category',
                data: channels,
                axisLabel: {
                    color: '#64748b',
                    fontSize: 12,
                    rotate: channels.length > 6 ? 30 : 0
                },
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                axisTick: { show: false }
            },
            yAxis: [
                {
                    type: 'value',
                    name: '平台收益',
                    axisLabel: {
                        color: '#64748b',
                        fontSize: 12,
                        formatter: function(v) {
                            if (v >= 10000) return (v / 10000).toFixed(1) + 'w';
                            return v;
                        }
                    },
                    axisLine: { show: false },
                    splitLine: { lineStyle: { color: '#f1f5f9' } }
                },
                {
                    type: 'value',
                    name: '结算金额',
                    axisLabel: {
                        color: '#64748b',
                        fontSize: 12,
                        formatter: function(v) {
                            if (v >= 10000) return (v / 10000).toFixed(1) + 'w';
                            return v;
                        }
                    },
                    axisLine: { show: false },
                    splitLine: { show: false }
                }
            ],
            series: [
                {
                    name: '平台收益',
                    type: 'line',
                    data: profits,
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 8,
                    lineStyle: { color: '#f97316', width: 3 },
                    itemStyle: { color: '#f97316' },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(249, 115, 22, 0.3)' },
                            { offset: 1, color: 'rgba(249, 115, 22, 0.02)' }
                        ])
                    }
                },
                {
                    name: '结算金额',
                    type: 'line',
                    yAxisIndex: 1,
                    data: amounts,
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 6,
                    lineStyle: { color: '#1e3a5f', width: 2, type: 'dashed' },
                    itemStyle: { color: '#1e3a5f' }
                }
            ]
        };

        chart.setOption(option);
    }

    // ========== 闲鱼/淘宝细分饼图 ==========
    function renderDetailPieChart(domId, data, title) {
        const chart = getChart(domId);
        if (!chart) return;

        const pieData = data.map((d, i) => ({
            name: d.type,
            value: d.settledOrderCount
        }));

        const option = {
            tooltip: {
                ...commonTooltip,
                trigger: 'item',
                formatter: function(p) {
                    return `<strong>${p.name}</strong><br/>
                        结算订单: ${p.value.toLocaleString()}<br/>
                        占比: ${p.percent.toFixed(1)}%`;
                }
            },
            legend: {
                orient: 'vertical',
                right: '5%',
                top: 'center',
                textStyle: { color: '#64748b', fontSize: 12 }
            },
            series: [{
                name: '订单量',
                type: 'pie',
                radius: ['45%', '70%'],
                center: ['35%', '50%'],
                avoidLabelOverlap: true,
                itemStyle: {
                    borderRadius: 4,
                    borderColor: '#fff',
                    borderWidth: 2
                },
                label: {
                    show: true,
                    position: 'inside',
                    formatter: '{d}%',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 'bold'
                },
                labelLine: { show: false },
                data: pieData,
                color: colorPalette
            }]
        };

        chart.setOption(option);
    }

    // ========== 游戏排名横向柱状图 ==========
    function renderGameRankChart(domId, data, type) {
        const chart = getChart(domId);
        if (!chart) return;

        // type: 'amount' | 'orders'
        const valueKey = type === 'amount' ? 'currentAmount' : 'currentOrders';
        const lastKey = type === 'amount' ? 'lastAmount' : 'lastOrders';
        const changeKey = type === 'amount' ? 'amountChange' : 'ordersChange';
        const changeRateKey = type === 'amount' ? 'amountChangeRate' : 'ordersChangeRate';
        const unitLabel = type === 'amount' ? '¥' : '';

        // 反转数据，让TOP1在最上面
        const reversedData = [...data].reverse();
        const gameNames = reversedData.map(d => d.gameName);
        const currentValues = reversedData.map(d => d[valueKey]);
        const lastValues = reversedData.map(d => d[lastKey]);
        const changes = reversedData.map(d => d[changeKey]);
        const changeRates = reversedData.map(d => (d[changeRateKey] * 100).toFixed(1));

        const option = {
            tooltip: {
                ...commonTooltip,
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: function(params) {
                    const idx = params[0].dataIndex;
                    const game = reversedData[idx];
                    const curVal = game[valueKey];
                    const lastVal = game[lastKey];
                    const change = game[changeKey];
                    const rate = game[changeRateKey] * 100;
                    
                    const curFmt = type === 'amount' 
                        ? (curVal >= 10000 ? '¥' + (curVal/10000).toFixed(2) + '万' : '¥' + curVal.toFixed(2))
                        : curVal.toLocaleString() + '单';
                    const lastFmt = type === 'amount'
                        ? (lastVal >= 10000 ? '¥' + (lastVal/10000).toFixed(2) + '万' : '¥' + lastVal.toFixed(2))
                        : lastVal.toLocaleString() + '单';
                    const changeFmt = type === 'amount'
                        ? (Math.abs(change) >= 10000 ? (change/10000).toFixed(2) + '万' : change.toFixed(2))
                        : Math.round(change).toLocaleString();
                    
                    const color = rate >= 0 ? '#ef4444' : '#10b981';
                    const arrow = rate >= 0 ? '↑' : '↓';
                    
                    return `<strong>${game.gameName}</strong><br/>
                        本周: ${curFmt}<br/>
                        上周: ${lastFmt}<br/>
                        <span style="color:${color}">变化: ${arrow} ${changeFmt} (${rate.toFixed(1)}%)</span>`;
                }
            },
            grid: {
                left: '3%',
                right: '15%',
                bottom: '3%',
                top: '3%',
                containLabel: true
            },
            xAxis: {
                type: 'value',
                axisLabel: {
                    color: '#64748b',
                    fontSize: 12,
                    formatter: function(v) {
                        if (type === 'amount') {
                            if (v >= 10000) return (v / 10000).toFixed(1) + 'w';
                            return v;
                        }
                        if (v >= 10000) return (v / 10000).toFixed(1) + 'w';
                        return v;
                    }
                },
                axisLine: { show: false },
                splitLine: { lineStyle: { color: '#f1f5f9' } }
            },
            yAxis: {
                type: 'category',
                data: gameNames,
                axisLabel: {
                    color: '#334155',
                    fontSize: 12,
                    width: 120,
                    overflow: 'truncate'
                },
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                axisTick: { show: false }
            },
            series: [
                {
                    name: '本周',
                    type: 'bar',
                    data: currentValues,
                    barWidth: 16,
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                            { offset: 0, color: '#2c5282' },
                            { offset: 1, color: '#1e3a5f' }
                        ]),
                        borderRadius: [0, 4, 4, 0]
                    },
                    label: {
                        show: true,
                        position: 'right',
                        color: '#1e3a5f',
                        fontSize: 11,
                        fontWeight: 'bold',
                        formatter: function(p) {
                            const idx = p.dataIndex;
                            const rate = parseFloat(changeRates[idx]);
                            const arrow = rate >= 0 ? '↑' : '↓';
                            const rateClass = rate >= 0 ? 'rate-up' : 'rate-down';
                            let valStr;
                            if (type === 'amount') {
                                valStr = p.value >= 10000 ? (p.value/10000).toFixed(1) + 'w' : p.value.toFixed(0);
                            } else {
                                valStr = p.value >= 10000 ? (p.value/10000).toFixed(1) + 'w' : p.value.toLocaleString();
                            }
                            return '{val|' + valStr + '}  {' + rateClass + '|' + arrow + ' ' + Math.abs(rate).toFixed(1) + '%}';
                        },
                        rich: {
                            val: {
                                color: '#1e3a5f',
                                fontWeight: 'bold',
                                fontSize: 11,
                                padding: [0, 4, 0, 0]
                            },
                            'rate-up': {
                                color: '#ef4444',
                                fontSize: 10,
                                padding: [2, 4, 2, 4],
                                borderRadius: 3,
                                backgroundColor: 'rgba(239, 68, 68, 0.1)'
                            },
                            'rate-down': {
                                color: '#10b981',
                                fontSize: 10,
                                padding: [2, 4, 2, 4],
                                borderRadius: 3,
                                backgroundColor: 'rgba(16, 185, 129, 0.1)'
                            }
                        }
                    }
                }
            ]
        };

        chart.setOption(option);
    }

    // ========== 分销商类型柱状图 ==========
    function renderDistTypeOrdersChart(domId, data) {
        const chart = getChart(domId);
        if (!chart) return;

        const types = data.map(d => d.type);
        const orders = data.map(d => d.settledOrderCount);

        const option = {
            tooltip: {
                ...commonTooltip,
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: function(params) {
                    return `<strong>${params[0].name}</strong><br/>
                        结算订单: ${params[0].value.toLocaleString()}`;
                }
            },
            grid: commonGrid,
            xAxis: {
                type: 'category',
                data: types,
                axisLabel: { color: '#64748b', fontSize: 12 },
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value',
                axisLabel: {
                    color: '#64748b',
                    fontSize: 12,
                    formatter: function(v) {
                        if (v >= 10000) return (v / 10000).toFixed(1) + 'w';
                        return v;
                    }
                },
                axisLine: { show: false },
                splitLine: { lineStyle: { color: '#f1f5f9' } }
            },
            series: [{
                name: '结算订单量',
                type: 'bar',
                data: orders,
                barWidth: '45%',
                itemStyle: {
                    color: function(params) {
                        const barColors = ['#1e3a5f', '#f97316', '#10b981', '#8b5cf6', '#3b82f6'];
                        return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: barColors[params.dataIndex % barColors.length] },
                            { offset: 1, color: barColors[params.dataIndex % barColors.length] + 'cc' }
                        ]);
                    },
                    borderRadius: [4, 4, 0, 0]
                },
                label: {
                    show: true,
                    position: 'top',
                    color: '#334155',
                    fontSize: 11,
                    formatter: function(p) {
                        if (p.value >= 10000) return (p.value / 10000).toFixed(1) + 'w';
                        return p.value;
                    }
                }
            }]
        };

        chart.setOption(option);
    }

    // ========== 分销类型收益折线图 ==========
    function renderDistTypeProfitChart(domId, data) {
        const chart = getChart(domId);
        if (!chart) return;

        const types = data.map(d => d.type);
        const platformProfit = data.map(d => d.platformProfit);
        const distributorProfit = data.map(d => d.distributorProfit);

        const option = {
            tooltip: {
                ...commonTooltip,
                trigger: 'axis',
                formatter: function(params) {
                    let html = `<strong>${params[0].name}</strong><br/>`;
                    params.forEach(p => {
                        const val = p.value;
                        const formatted = val >= 10000 ? (val / 10000).toFixed(2) + '万' : val.toFixed(2);
                        html += `${p.marker} ${p.seriesName}: ¥${formatted}<br/>`;
                    });
                    return html;
                }
            },
            legend: {
                data: ['平台收益', '分销商收益'],
                top: 0,
                right: 0,
                textStyle: { color: '#64748b', fontSize: 12 }
            },
            grid: commonGrid,
            xAxis: {
                type: 'category',
                data: types,
                axisLabel: { color: '#64748b', fontSize: 12 },
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value',
                axisLabel: {
                    color: '#64748b',
                    fontSize: 12,
                    formatter: function(v) {
                        if (v >= 10000) return (v / 10000).toFixed(1) + 'w';
                        return v;
                    }
                },
                axisLine: { show: false },
                splitLine: { lineStyle: { color: '#f1f5f9' } }
            },
            series: [
                {
                    name: '平台收益',
                    type: 'bar',
                    data: platformProfit,
                    barWidth: '25%',
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#f97316' },
                            { offset: 1, color: '#ea580c' }
                        ]),
                        borderRadius: [4, 4, 0, 0]
                    }
                },
                {
                    name: '分销商收益',
                    type: 'bar',
                    data: distributorProfit,
                    barWidth: '25%',
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#1e3a5f' },
                            { offset: 1, color: '#0f2744' }
                        ]),
                        borderRadius: [4, 4, 0, 0]
                    }
                }
            ]
        };

        chart.setOption(option);
    }

    // ========== 商户撤单率预警散点图 ==========
    function renderMerchantCancelWarning(domId, data, topNAvgCancelRate) {
        const chart = getChart(domId);
        if (!chart) return;

        // 取TOP20异常商户
        const topData = data.slice(0, 20);
        
        const merchantNames = topData.map(d => d.shopName || d.distributorId);
        const shopCancelRates = topData.map(d => (d.shopCancelRate !== undefined ? d.shopCancelRate : d.merchantCancelRate) * 100);
        const gameCancelRates = topData.map(d => d.gameCancelRate * 100);
        const diffs = topData.map(d => d.diff * 100);
        const gameNames = topData.map(d => d.gameName);

        const option = {
            tooltip: {
                ...commonTooltip,
                trigger: 'axis',
                formatter: function(params) {
                    const idx = params[0].dataIndex;
                    const item = topData[idx];
                    const shopRate = (item.shopCancelRate !== undefined ? item.shopCancelRate : item.merchantCancelRate) * 100;
                    return `<strong>${item.shopName || item.distributorId}</strong><br/>
                        游戏: ${item.gameName}<br/>
                        商户撤单率: ${shopRate.toFixed(2)}%<br/>
                        游戏平均: ${(item.gameCancelRate * 100).toFixed(2)}%<br/>
                        差值: +${(item.diff * 100).toFixed(2)}pp<br/>
                        订单量: ${item.orderCount}`;
                }
            },
            legend: {
                data: ['商户撤单率', '游戏平均撤单率'],
                top: 0,
                right: 0,
                textStyle: { color: '#64748b', fontSize: 12 }
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '15%',
                top: '12%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: merchantNames,
                axisLabel: {
                    color: '#64748b',
                    fontSize: 11,
                    rotate: 30,
                    width: 80,
                    overflow: 'truncate'
                },
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value',
                name: '撤单率 (%)',
                axisLabel: {
                    color: '#64748b',
                    fontSize: 12,
                    formatter: '{value}%'
                },
                axisLine: { show: false },
                splitLine: { lineStyle: { color: '#f1f5f9' } }
            },
            series: [
                {
                    name: '商户撤单率',
                    type: 'bar',
                    data: shopCancelRates,
                    barWidth: '35%',
                    itemStyle: {
                        color: function(params) {
                            return diffs[params.dataIndex] > 5 ? '#ef4444' : '#f59e0b';
                        },
                        borderRadius: [4, 4, 0, 0]
                    },
                    label: {
                        show: true,
                        position: 'top',
                        color: '#ef4444',
                        fontSize: 10,
                        formatter: function(p) {
                            return '+' + diffs[p.dataIndex].toFixed(1) + 'pp';
                        }
                    }
                },
                {
                    name: '游戏平均撤单率',
                    type: 'line',
                    data: gameCancelRates,
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 6,
                    lineStyle: { color: '#1e3a5f', width: 2, type: 'dashed' },
                    itemStyle: { color: '#1e3a5f' }
                }
            ]
        };

        chart.setOption(option);
    }

    // ========== 导出图表为图片 ==========
    function exportChartAsImage(domId, filename) {
        const chart = charts[domId];
        if (!chart) return null;
        const url = chart.getDataURL({
            type: 'png',
            pixelRatio: 2,
            backgroundColor: '#fff'
        });
        return url;
    }

    // ========== 调整所有图表大小 ==========
    function resizeAll() {
        Object.values(charts).forEach(chart => {
            chart.resize();
        });
    }

    // ========== 清理所有图表 ==========
    function disposeAll() {
        Object.values(charts).forEach(chart => {
            chart.dispose();
        });
        Object.keys(charts).forEach(key => delete charts[key]);
    }

    return {
        initChart,
        getChart,
        renderChannelOrdersChart,
        renderChannelProfitChart,
        renderDetailPieChart,
        renderGameRankChart,
        renderDistTypeOrdersChart,
        renderDistTypeProfitChart,
        renderMerchantCancelWarning,
        exportChartAsImage,
        resizeAll,
        disposeAll,
        colors,
        colorPalette
    };
})();
