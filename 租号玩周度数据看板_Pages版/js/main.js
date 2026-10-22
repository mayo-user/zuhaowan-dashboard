/**
 * 主逻辑模块
 * 负责页面交互、数据加载、看板渲染
 */
(function() {
    'use strict';

    // ========== 状态管理 ==========
    const state = {
        currentTab: 'sublet', // 'sublet' | 'distribution'
        subletGameTab: 'amount', // 'amount' | 'orders'
        distGameTab: 'amount',
        subletCrossGame: '',  // 当前选中的交叉分析游戏
        subletCrossSortBy: 'amount', // 排序方式
        subletCrossExpanded: new Set(), // 展开的转租商索引集合
        subletShopMode: 'sublessor', // 店铺分析模式：'sublessor' | 'shop'
        subletShopExpanded: new Set(), // 店铺分析展开的转租商索引集合
        subletThisWeek: null,
        subletLastWeek: null,
        distThisWeek: null,
        distLastWeek: null,
        subletComparison: null,
        distComparison: null,
        // 可搜索下拉框实例
        subletShopGameSelect: null,
        distGameSelect: null,
        // 数据源配置
        dataSourceMode: 'manual', // 'manual' | 'url'
        urlConfig: {
            subletThisWeek: '',
            subletLastWeek: '',
            distThisWeek: '',
            distLastWeek: ''
        }
    };

    // ========== DOM 元素 ==========
    const $ = id => document.getElementById(id);

    // ========== 可搜索下拉框组件 ==========
    class SearchableSelect {
        constructor(container, options = {}) {
            this.container = typeof container === 'string' ? $(container) : container;
            this.options = options;
            this.value = options.defaultValue || '';
            this.label = options.defaultLabel || '请选择';
            this.items = options.items || []; // [{ value, label }]
            this.onChange = options.onChange || null;
            this.highlightedIndex = -1;

            this._build();
            this._bindEvents();
        }

        _build() {
            this.container.classList.add('searchable-select');
            this.container.innerHTML = `
                <div class="ss-display">${this.label}</div>
                <div class="ss-dropdown">
                    <input type="text" class="ss-search" placeholder="搜索...">
                    <div class="ss-options"></div>
                </div>
            `;
            this.displayEl = this.container.querySelector('.ss-display');
            this.dropdownEl = this.container.querySelector('.ss-dropdown');
            this.searchEl = this.container.querySelector('.ss-search');
            this.optionsEl = this.container.querySelector('.ss-options');
            this._renderOptions();
        }

        _bindEvents() {
            // 点击显示区域切换展开
            this.displayEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle();
            });

            // 搜索框输入过滤
            this.searchEl.addEventListener('input', () => {
                this._filterOptions(this.searchEl.value);
            });

            // 阻止下拉内点击冒泡
            this.dropdownEl.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            // 键盘导航
            this.searchEl.addEventListener('keydown', (e) => {
                const visibleOptions = this._getVisibleOptions();
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this._moveHighlight(1, visibleOptions);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this._moveHighlight(-1, visibleOptions);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (this.highlightedIndex >= 0 && visibleOptions[this.highlightedIndex]) {
                        this._selectOption(visibleOptions[this.highlightedIndex]);
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.close();
                }
            });

            // 点击外部关闭
            document.addEventListener('click', (e) => {
                if (!this.container.contains(e.target)) {
                    this.close();
                }
            });
        }

        _moveHighlight(direction, visibleOptions) {
            if (visibleOptions.length === 0) return;

            // 清除当前高亮
            if (this.highlightedIndex >= 0 && visibleOptions[this.highlightedIndex]) {
                visibleOptions[this.highlightedIndex].classList.remove('highlighted');
            }

            this.highlightedIndex += direction;
            if (this.highlightedIndex < 0) this.highlightedIndex = 0;
            if (this.highlightedIndex >= visibleOptions.length) {
                this.highlightedIndex = visibleOptions.length - 1;
            }

            const el = visibleOptions[this.highlightedIndex];
            el.classList.add('highlighted');
            // 滚动到可视区域
            el.scrollIntoView({ block: 'nearest' });
        }

        _getVisibleOptions() {
            return Array.from(this.optionsEl.querySelectorAll('.ss-option:not([style*="display: none"])'));
        }

        _filterOptions(keyword) {
            const kw = keyword.trim().toLowerCase();
            const optionEls = this.optionsEl.querySelectorAll('.ss-option');
            let visibleCount = 0;

            optionEls.forEach(opt => {
                const text = opt.textContent.toLowerCase();
                const match = text.includes(kw);
                opt.style.display = match ? '' : 'none';
                if (match) visibleCount++;
            });

            this.highlightedIndex = -1;

            // 显示空状态
            let emptyEl = this.optionsEl.querySelector('.ss-empty');
            if (visibleCount === 0) {
                if (!emptyEl) {
                    emptyEl = document.createElement('div');
                    emptyEl.className = 'ss-empty';
                    emptyEl.textContent = '无匹配游戏';
                    this.optionsEl.appendChild(emptyEl);
                }
            } else if (emptyEl) {
                emptyEl.remove();
            }
        }

        _renderOptions() {
            this.optionsEl.innerHTML = '';
            this.items.forEach(item => {
                const opt = document.createElement('div');
                opt.className = 'ss-option';
                opt.dataset.value = item.value;
                opt.textContent = item.label;
                if (item.value === this.value) {
                    opt.classList.add('selected');
                }
                opt.addEventListener('click', () => {
                    this._selectOption(opt);
                });
                this.optionsEl.appendChild(opt);
            });
        }

        _selectOption(optEl) {
            const val = optEl.dataset.value;
            const label = optEl.textContent;
            this.setValue(val, label);
            this.close();
        }

        setValue(val, label) {
            this.value = val;
            this.label = label !== undefined ? label : val;
            this.displayEl.textContent = this.label;

            // 更新选中样式
            this.optionsEl.querySelectorAll('.ss-option').forEach(opt => {
                opt.classList.toggle('selected', opt.dataset.value === val);
            });

            if (this.onChange) {
                this.onChange(this.value);
            }
        }

        getValue() {
            return this.value;
        }

        setItems(items) {
            this.items = items;
            this._renderOptions();
            // 如果当前值不在新列表中，重置为第一个或空
            const found = items.find(it => it.value === this.value);
            if (!found && items.length > 0 && this.value !== 'all') {
                // 保持当前值（可能"全部"是默认）
            }
        }

        open() {
            this.container.classList.add('open');
            this.searchEl.value = '';
            this._filterOptions('');
            // 延迟聚焦，避免立即触发外部点击
            setTimeout(() => this.searchEl.focus(), 10);
            this.highlightedIndex = -1;
        }

        close() {
            this.container.classList.remove('open');
        }

        toggle() {
            if (this.container.classList.contains('open')) {
                this.close();
            } else {
                this.open();
            }
        }
    }

    // ========== 初始化 ==========
    function init() {
        initTabSwitching();
        initGameTabSwitching();
        initFileUpload();
        initFilters();
        initExport();
        initSettingsPanel();
        loadDataSourceConfig();
        
        // URL模式下自动加载数据，否则尝试自动加载 data/ 目录下的文件
        if (state.dataSourceMode === 'url' && hasAnyUrlConfigured()) {
            loadDataFromUrls();
        } else {
            autoLoadDataFiles();
        }
    }

    // ========== Tab 切换 ==========
    function initTabSwitching() {
        document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                switchTab(tab);
            });
        });
    }

    function switchTab(tab) {
        state.currentTab = tab;
        
        // 更新按钮状态
        document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // 显示对应看板
        $('subletDashboard').classList.toggle('active', tab === 'sublet');
        $('distributionDashboard').classList.toggle('active', tab === 'distribution');

        // 延迟调整图表大小（等待DOM渲染）
        setTimeout(() => {
            ChartManager.resizeAll();
        }, 100);
    }

    // ========== 游戏排名Tab切换 ==========
    function initGameTabSwitching() {
        // 转租
        document.querySelectorAll('.tab-btn[data-sublet-game-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                state.subletGameTab = btn.dataset.subletGameTab;
                document.querySelectorAll('.tab-btn[data-sublet-game-tab]').forEach(b => {
                    b.classList.toggle('active', b.dataset.subletGameTab === state.subletGameTab);
                });
                renderSubletGameRank();
            });
        });

        // 分销
        document.querySelectorAll('.tab-btn[data-dist-game-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                state.distGameTab = btn.dataset.distGameTab;
                document.querySelectorAll('.tab-btn[data-dist-game-tab]').forEach(b => {
                    b.classList.toggle('active', b.dataset.distGameTab === state.distGameTab);
                });
                renderDistGameRank();
            });
        });
    }

    // ========== 文件上传 ==========
    function initFileUpload() {
        $('fileThisWeek').addEventListener('change', (e) => {
            handleFileUpload(e.target.files[0], 'thisWeek');
        });

        $('fileLastWeek').addEventListener('change', (e) => {
            handleFileUpload(e.target.files[0], 'lastWeek');
        });
    }

    async function handleFileUpload(file, whichWeek) {
        if (!file) return;

        showLoading(true);
        try {
            const result = await DataProcessor.readExcelFile(file);
            const dataType = DataProcessor.detectDataType(result.headers);
            
            let processedData;
            if (dataType === 'sublet') {
                processedData = DataProcessor.processSubletData(result.rows, result.headers);
                if (whichWeek === 'thisWeek') {
                    state.subletThisWeek = processedData;
                } else {
                    state.subletLastWeek = processedData;
                }
                // 计算环比
                if (state.subletThisWeek) {
                    state.subletComparison = DataProcessor.computeComparison(
                        state.subletThisWeek, 
                        state.subletLastWeek || state.subletThisWeek,
                        'sublet'
                    );
                }
                renderSubletDashboard();
                switchTab('sublet');
            } else if (dataType === 'distribution') {
                processedData = DataProcessor.processDistributionData(result.rows, result.headers);
                if (whichWeek === 'thisWeek') {
                    state.distThisWeek = processedData;
                } else {
                    state.distLastWeek = processedData;
                }
                if (state.distThisWeek) {
                    state.distComparison = DataProcessor.computeComparison(
                        state.distThisWeek,
                        state.distLastWeek || state.distThisWeek,
                        'distribution'
                    );
                }
                renderDistributionDashboard();
                switchTab('distribution');
            } else {
                alert('无法识别数据类型，请检查文件内容');
            }

            updatePeriodDisplay();
            updateDataStatus();
        } catch (err) {
            console.error('文件读取失败:', err);
            alert('文件读取失败: ' + err.message);
        } finally {
            showLoading(false);
        }
    }

    // ========== 自动加载 data/ 目录文件 ==========
    async function autoLoadDataFiles() {
        // 由于浏览器安全限制，无法直接读取本地目录
        // 这里尝试通过 fetch 读取同目录下的 data/ 文件夹
        // 注意：需要通过 HTTP 服务器打开才有效，直接双击HTML无法读取本地文件
        
        const dataFiles = [
            { name: '转租_本周.xlsx', type: 'sublet', week: 'thisWeek' },
            { name: '转租_上周.xlsx', type: 'sublet', week: 'lastWeek' },
            { name: '分销_本周.xlsx', type: 'distribution', week: 'thisWeek' },
            { name: '分销_上周.xlsx', type: 'distribution', week: 'lastWeek' }
        ];

        let loadedCount = 0;

        for (const f of dataFiles) {
            try {
                const response = await fetch('data/' + f.name);
                if (!response.ok) continue;
                const blob = await response.blob();
                const file = new File([blob], f.name);
                
                const result = await DataProcessor.readExcelFile(file);
                const dataType = DataProcessor.detectDataType(result.headers);
                
                let processedData;
                if (dataType === 'sublet') {
                    processedData = DataProcessor.processSubletData(result.rows, result.headers);
                    if (f.week === 'thisWeek') state.subletThisWeek = processedData;
                    else state.subletLastWeek = processedData;
                } else if (dataType === 'distribution') {
                    processedData = DataProcessor.processDistributionData(result.rows, result.headers);
                    if (f.week === 'thisWeek') state.distThisWeek = processedData;
                    else state.distLastWeek = processedData;
                }
                loadedCount++;
            } catch (err) {
                // 文件不存在或无法读取，静默跳过
                // console.log('未找到数据文件:', f.name);
            }
        }

        if (loadedCount > 0) {
            // 计算环比
            if (state.subletThisWeek) {
                state.subletComparison = DataProcessor.computeComparison(
                    state.subletThisWeek,
                    state.subletLastWeek || state.subletThisWeek,
                    'sublet'
                );
                renderSubletDashboard();
            }
            if (state.distThisWeek) {
                state.distComparison = DataProcessor.computeComparison(
                    state.distThisWeek,
                    state.distLastWeek || state.distThisWeek,
                    'distribution'
                );
                renderDistributionDashboard();
            }
            updatePeriodDisplay();
            updateDataStatus();
        }
    }

    // ========== 筛选器初始化 ==========
    function initFilters() {
        // 转租店铺游戏筛选（可搜索下拉）
        state.subletShopGameSelect = new SearchableSelect('sublet_shopGameFilter', {
            defaultValue: 'all',
            defaultLabel: '全部游戏',
            items: [{ value: 'all', label: '全部游戏' }],
            onChange: renderSubletShopTable
        });

        // 转租店铺渠道筛选
        $('sublet_shopChannelFilter').addEventListener('change', renderSubletShopTable);
        $('sublet_shopSearch').addEventListener('input', renderSubletShopTable);
        $('sublet_shopSortBy').addEventListener('change', renderSubletShopTable);

        // 店铺分析模式切换
        document.querySelectorAll('input[name="subletShopMode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                state.subletShopMode = radio.value;
                state.subletShopExpanded.clear(); // 切换模式时清空展开状态
                renderSubletShopTable();
            });
        });

        // 转租交叉分析
        $('sublet_crossGameSelect').addEventListener('change', function() {
            state.subletCrossGame = this.value;
            state.subletCrossExpanded.clear(); // 切换游戏时清空展开状态
            syncSubletCrossGameTags();
            renderSubletCrossTable();
        });
        $('sublet_crossSortBy').addEventListener('change', function() {
            state.subletCrossSortBy = this.value;
            state.subletCrossExpanded.clear(); // 切换排序时清空展开状态
            renderSubletCrossTable();
        });

        // 分销交叉分析
        $('dist_crossGameSelect').addEventListener('change', renderDistCrossTable);
        $('dist_crossSortBy').addEventListener('change', renderDistCrossTable);

        // 分销商游戏筛选（可搜索下拉）
        state.distGameSelect = new SearchableSelect('dist_distributorGameFilter', {
            defaultValue: 'all',
            defaultLabel: '全部游戏',
            items: [{ value: 'all', label: '全部游戏' }],
            onChange: renderDistributorTable
        });

        $('dist_distributorSearch').addEventListener('input', renderDistributorTable);
        $('dist_distributorSortBy').addEventListener('change', renderDistributorTable);
    }

    // ========== 导出功能 ==========
    function initExport() {
        $('exportDataBtn').addEventListener('click', exportDashboardData);
    }

    function exportDashboardData() {
        const isSublet = state.currentTab === 'sublet';
        const data = isSublet ? state.subletThisWeek : state.distThisWeek;
        const comparison = isSublet ? state.subletComparison : state.distComparison;
        
        if (!data) {
            alert('暂无数据可导出');
            return;
        }

        // 构造导出数据
        const exportData = [];
        
        // KPI 数据
        exportData.push(['=== 核心指标 ===']);
        if (comparison && comparison.totals) {
            const t = comparison.totals;
            exportData.push(['指标', '本周', '上周', '变化量', '变化率']);
            if (t.settledAmount) {
                exportData.push([
                    '结算金额',
                    t.settledAmount.current.toFixed(2),
                    t.settledAmount.last.toFixed(2),
                    t.settledAmount.change.toFixed(2),
                    (t.settledAmount.changeRate * 100).toFixed(2) + '%'
                ]);
            }
            if (t.settledOrderCount) {
                exportData.push([
                    '结算订单量',
                    t.settledOrderCount.current,
                    t.settledOrderCount.last,
                    t.settledOrderCount.change,
                    (t.settledOrderCount.changeRate * 100).toFixed(2) + '%'
                ]);
            }
        }
        exportData.push([]);

        // 游戏排名
        exportData.push(['=== TOP20游戏排名（金额） ===']);
        if (comparison && comparison.top20AmountWithChange) {
            exportData.push(['排名', '游戏名', '本周金额', '上周金额', '变化量', '变化率']);
            comparison.top20AmountWithChange.forEach((g, i) => {
                exportData.push([
                    i + 1, g.gameName,
                    g.currentAmount.toFixed(2),
                    g.lastAmount.toFixed(2),
                    g.amountChange.toFixed(2),
                    (g.amountChangeRate * 100).toFixed(2) + '%'
                ]);
            });
        }
        exportData.push([]);

        // 导出为CSV
        const csvContent = exportData.map(row => row.join(',')).join('\n');
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = (isSublet ? '转租' : '分销') + '_周度数据_' + new Date().toISOString().slice(0, 10) + '.csv';
        link.click();
    }

    // ========== 渲染转租看板 ==========
    function renderSubletDashboard() {
        const data = state.subletThisWeek;
        const comp = state.subletComparison;
        if (!data) return;

        // 1. KPI 卡片
        renderSubletKPIs(data, comp);

        // 2. 渠道图表
        ChartManager.renderChannelOrdersChart('sublet_channelOrdersChart', data.channelData, comp);
        ChartManager.renderChannelProfitChart('sublet_channelProfitChart', data.channelData, comp);

        // 闲鱼/淘宝细分
        if (data.xianyuDetail && data.xianyuDetail.length > 0) {
            ChartManager.renderDetailPieChart('sublet_xianyuDetailChart', data.xianyuDetail, '闲鱼渠道细分');
        }
        if (data.taobaoDetail && data.taobaoDetail.length > 0) {
            ChartManager.renderDetailPieChart('sublet_taobaoDetailChart', data.taobaoDetail, '淘宝渠道细分');
        }

        // 3. 游戏排名
        renderSubletGameRank();

        // 4. TOP游戏×TOP转租商 交叉分析
        populateSubletCrossGameOptions(data);
        renderSubletCrossTable();

        // 5. 异常预警
        renderSubletWarningList();

        // 6. 发货履约与退款
        renderSubletFulfillment(data, comp);

        // 商户撤单率预警
        ChartManager.renderMerchantCancelWarning(
            'sublet_merchantCancelWarning',
            data.merchantCancelWarningList,
            data.top5AvgCancelRate
        );

        // 店铺撤单率排名
        populateCancelRankFilters(data);
        renderSubletCancelRankTable(data);

        // 7. 店铺分析
        populateSubletFilters(data);
        renderSubletShopTable();

        // 更新渠道筛选器
        const channelFilter = $('sublet_channelFilter');
        channelFilter.innerHTML = '<option value="all">全部渠道</option>';
        data.channels.forEach(ch => {
            const opt = document.createElement('option');
            opt.value = ch;
            opt.textContent = ch;
            channelFilter.appendChild(opt);
        });
    }

    function renderSubletKPIs(data, comp) {
        const t = data.totals;
        $('sublet_totalAmount').textContent = DataProcessor.formatMoney(t.settledAmount);
        $('sublet_totalOrders').textContent = DataProcessor.formatInt(t.settledOrderCount);
        $('sublet_cancelRate').textContent = DataProcessor.formatPercent(t.cancelRate);
        $('sublet_platformProfit').textContent = DataProcessor.formatMoney(t.platformProfit);

        if (comp && comp.totals) {
            setKPIChange('sublet_totalAmount_change', comp.totals.settledAmount);
            setKPIChange('sublet_totalOrders_change', comp.totals.settledOrderCount);
            setKPIChange_pp('sublet_cancelRate_change', comp.totals.cancelRate);
            setKPIChange('sublet_platformProfit_change', comp.totals.platformProfit);
        }
    }

    function setKPIChange(elementId, data) {
        const el = $(elementId);
        if (!data) { el.textContent = '--'; el.className = 'kpi-change'; return; }
        
        const rate = data.changeRate * 100;
        const arrow = rate >= 0 ? '↑' : '↓';
        const absRate = Math.abs(rate).toFixed(2);
        const changeStr = data.change >= 0 ? '+' : '';
        const changeFmt = Math.abs(data.change) >= 10000 
            ? (data.change / 10000).toFixed(2) + '万'
            : data.change.toFixed(2);
        
        el.innerHTML = `<span>${arrow} ${absRate}%</span> <span style="opacity:0.7">(${changeStr}${changeFmt})</span>`;
        el.className = 'kpi-change ' + (rate > 0 ? 'up' : rate < 0 ? 'down' : 'flat');
    }

    function setKPIChange_pp(elementId, data) {
        const el = $(elementId);
        if (!data) { el.textContent = '--'; el.className = 'kpi-change'; return; }
        
        const pp = data.changePct;
        const arrow = pp >= 0 ? '↑' : '↓';
        const absPp = Math.abs(pp).toFixed(2);
        
        el.innerHTML = `<span>${arrow} ${absPp}pp</span>`;
        // 按数值方向着色：上升=红色，下降=绿色
        el.className = 'kpi-change ' + (pp > 0 ? 'up' : pp < 0 ? 'down' : 'flat');
    }

    function renderSubletGameRank() {
        if (!state.subletComparison) return;
        
        const data = state.subletGameTab === 'amount'
            ? state.subletComparison.top20AmountWithChange
            : state.subletComparison.top20OrdersWithChange;
        
        if (data && data.length > 0) {
            ChartManager.renderGameRankChart('sublet_gameRankChart', data, state.subletGameTab);
        }
    }

    function renderSubletWarningList() {
        const comp = state.subletComparison;
        if (!comp) return;

        renderWarningList('sublet_growthTop20', comp.growthTop20 || [], 'growth', 'sublet');
        renderWarningList('sublet_declineTop20', comp.declineTop20 || [], 'decline', 'sublet');
    }

    function renderWarningList(containerId, data, type, businessType) {
        const container = $(containerId);
        if (!data || data.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:40px 0;">暂无数据</div>';
            return;
        }

        let html = '';
        data.forEach((item, index) => {
            const changePct = (item.ordersChangeRate * 100).toFixed(1);
            const arrow = item.ordersChange >= 0 ? '↑' : '↓';
            const changeClass = item.ordersChange >= 0 ? 'up' : 'down';
            const itemClass = type === 'growth' ? 'growth' : 'decline';
            const changeAbs = Math.abs(item.ordersChange);
            const changeFmt = changeAbs >= 10000 ? (changeAbs / 10000).toFixed(1) + '万' : changeAbs.toLocaleString();

            html += `
                <div class="warning-item ${itemClass}" data-game="${escapeHtml(item.gameName)}" data-index="${index}">
                    <span class="warning-game-name">${index + 1}. ${escapeHtml(item.gameName)}</span>
                    <div class="warning-values">
                        <div class="warning-value">
                            <div class="warning-value-label">本周</div>
                            <div class="warning-value-num">${item.currentOrders.toLocaleString()}</div>
                        </div>
                        <div class="warning-value">
                            <div class="warning-value-label">上周</div>
                            <div class="warning-value-num">${item.lastOrders.toLocaleString()}</div>
                        </div>
                        <div class="warning-change ${changeClass}">
                            ${arrow} ${changeFmt} (${Math.abs(parseFloat(changePct))}%)
                        </div>
                    </div>
                    <span class="warning-expand-icon">▶</span>
                </div>
                <div class="warning-detail" id="warningDetail_${containerId}_${index}"></div>
            `;
        });

        container.innerHTML = html;

        // 绑定展开事件
        container.querySelectorAll('.warning-item').forEach(item => {
            item.addEventListener('click', () => {
                const gameName = item.dataset.game;
                const idx = item.dataset.index;
                const detailEl = $('warningDetail_' + containerId + '_' + idx);
                const isExpanded = item.classList.contains('expanded');

                // 收起其他
                container.querySelectorAll('.warning-item').forEach(i => i.classList.remove('expanded'));
                container.querySelectorAll('.warning-detail').forEach(d => d.style.display = 'none');

                if (!isExpanded) {
                    item.classList.add('expanded');
                    detailEl.style.display = 'block';
                    
                    // 加载下钻数据
                    loadWarningDetail(detailEl, gameName, businessType);
                }
            });
        });
    }

    function loadWarningDetail(detailEl, gameName, businessType) {
        let breakdownData;
        let tableHtml;

        if (businessType === 'sublet') {
            breakdownData = DataProcessor.getShopBreakdown(
                state.subletThisWeek,
                state.subletLastWeek || state.subletThisWeek,
                gameName
            );
            
            tableHtml = `
                <table class="warning-detail-table">
                    <thead>
                        <tr><th>店铺名</th><th>本周订单</th><th>上周订单</th><th>变化量</th><th>本周金额</th><th>上周金额</th><th>金额变化</th></tr>
                    </thead>
                    <tbody>
            `;
            breakdownData.slice(0, 10).forEach(s => {
                const changeClass = s.ordersChange >= 0 ? 'change-up' : 'change-down';
                const amountChangeClass = s.amountChange >= 0 ? 'change-up' : 'change-down';
                tableHtml += `
                    <tr>
                        <td>${escapeHtml(s.shopName || s.shopId)}</td>
                        <td>${s.currentOrders.toLocaleString()}</td>
                        <td>${s.lastOrders.toLocaleString()}</td>
                        <td class="${changeClass}">${s.ordersChange >= 0 ? '+' : ''}${s.ordersChange.toLocaleString()}</td>
                        <td>¥${s.currentAmount.toFixed(2)}</td>
                        <td>¥${s.lastAmount.toFixed(2)}</td>
                        <td class="${amountChangeClass}">${s.amountChange >= 0 ? '+' : ''}¥${s.amountChange.toFixed(2)}</td>
                    </tr>
                `;
            });
            tableHtml += '</tbody></table>';
        } else {
            breakdownData = DataProcessor.getDistributorBreakdown(
                state.distThisWeek,
                state.distLastWeek || state.distThisWeek,
                gameName
            );
            
            tableHtml = `
                <table class="warning-detail-table">
                    <thead>
                        <tr><th>分销商ID</th><th>本周订单</th><th>上周订单</th><th>变化量</th><th>本周金额</th><th>上周金额</th><th>金额变化</th></tr>
                    </thead>
                    <tbody>
            `;
            breakdownData.slice(0, 10).forEach(d => {
                const changeClass = d.ordersChange >= 0 ? 'change-up' : 'change-down';
                const amountChangeClass = d.amountChange >= 0 ? 'change-up' : 'change-down';
                tableHtml += `
                    <tr>
                        <td>${d.distributorId}</td>
                        <td>${d.currentOrders.toLocaleString()}</td>
                        <td>${d.lastOrders.toLocaleString()}</td>
                        <td class="${changeClass}">${d.ordersChange >= 0 ? '+' : ''}${d.ordersChange.toLocaleString()}</td>
                        <td>¥${d.currentAmount.toFixed(2)}</td>
                        <td>¥${d.lastAmount.toFixed(2)}</td>
                        <td class="${amountChangeClass}">${d.amountChange >= 0 ? '+' : ''}¥${d.amountChange.toFixed(2)}</td>
                    </tr>
                `;
            });
            tableHtml += '</tbody></table>';
        }

        detailEl.innerHTML = tableHtml;
    }

    function renderSubletFulfillment(data, comp) {
        const t = data.totals;
        $('sublet_shipSuccessRate').textContent = DataProcessor.formatPercent(t.shipSuccessRate || 0);
        $('sublet_autoShipRate').textContent = '--';
        $('sublet_refundCancelRate').textContent = DataProcessor.formatPercent(t.cancelRate);
        $('sublet_top5AvgCancelRate').textContent = DataProcessor.formatPercent(data.top5AvgCancelRate || 0);

        if (comp && comp.totals && comp.totals.shipSuccessRate) {
            const pp = comp.totals.shipSuccessRate.change * 100;
            const el = $('sublet_shipSuccessRate_change');
            const arrow = pp >= 0 ? '↑' : '↓';
            el.innerHTML = `${arrow} ${Math.abs(pp).toFixed(2)}pp`;
            el.className = 'kpi-change ' + (pp >= 0 ? 'up' : 'down');
        }

        if (comp && comp.totals && comp.totals.cancelRate) {
            const pp = comp.totals.cancelRate.changePct;
            const el = $('sublet_refundCancelRate_change');
            const arrow = pp >= 0 ? '↑' : '↓';
            el.innerHTML = `${arrow} ${Math.abs(pp).toFixed(2)}pp`;
            // 按数值方向着色：上升=红色，下降=绿色
            el.className = 'kpi-change ' + (pp > 0 ? 'up' : pp < 0 ? 'down' : 'flat');
        }
    }

    function populateSubletFilters(data) {
        // 游戏筛选（可搜索下拉）
        const gameItems = [{ value: 'all', label: '全部游戏' }];
        data.games.forEach(g => {
            gameItems.push({ value: g, label: g });
        });
        state.subletShopGameSelect.setItems(gameItems);

        // 渠道筛选
        const channelFilter = $('sublet_shopChannelFilter');
        channelFilter.innerHTML = '<option value="all">全部渠道</option>';
        data.channels.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            channelFilter.appendChild(opt);
        });
    }

    // ========== 店铺撤单率排名 ==========
    function populateCancelRankFilters(data) {
        // 游戏筛选
        const gameFilter = $('sublet_cancelGameFilter');
        gameFilter.innerHTML = '<option value="all">全部游戏</option>';
        data.games.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g;
            opt.textContent = g;
            gameFilter.appendChild(opt);
        });

        // 渠道筛选
        const channelFilter = $('sublet_cancelChannelFilter');
        channelFilter.innerHTML = '<option value="all">全部渠道</option>';
        if (data.channels && data.channels.length > 0) {
            data.channels.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                channelFilter.appendChild(opt);
            });
        }

        // 绑定事件
        gameFilter.removeEventListener('change', renderCancelRankFromFilter);
        gameFilter.addEventListener('change', renderCancelRankFromFilter);
        channelFilter.removeEventListener('change', renderCancelRankFromFilter);
        channelFilter.addEventListener('change', renderCancelRankFromFilter);
    }

    function renderCancelRankFromFilter() {
        if (state.subletThisWeek) {
            renderSubletCancelRankTable(state.subletThisWeek);
        }
    }

    function renderSubletCancelRankTable(data) {
        const tbody = $('sublet_cancelRankTableBody');
        const gameFilter = $('sublet_cancelGameFilter').value;
        const channelFilter = $('sublet_cancelChannelFilter').value;

        if (!data || !data.shopData || data.shopData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-tip">暂无数据</td></tr>';
            return;
        }

        // 构建游戏平均撤单率映射
        const gameCancelRates = {};
        if (data.gameData) {
            data.gameData.forEach(g => {
                gameCancelRates[g.gameName] = g.cancelRate || 0;
            });
        }

        // 过滤数据
        let filtered = data.shopData.filter(s => {
            if (gameFilter !== 'all' && s.gameName !== gameFilter) return false;
            if (channelFilter !== 'all' && s.channel !== channelFilter) return false;
            // 只显示有订单的店铺
            return s.orderCount > 0;
        });

        // 按撤单率从高到低排序
        filtered.sort((a, b) => b.cancelRate - a.cancelRate);

        // 取TOP20
        filtered = filtered.slice(0, 20);

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-tip">没有符合条件的数据</td></tr>';
            return;
        }

        let html = '';
        filtered.forEach((s, i) => {
            const shopName = s.shopName && s.shopName.trim() !== ''
                ? s.shopName
                : '手动开单';
            const isManual = !s.shopName || s.shopName.trim() === '';
            const gameAvgRate = gameCancelRates[s.gameName] || 0;
            const isAboveAvg = s.cancelRate > gameAvgRate;
            const rowClass = isAboveAvg ? 'cancel-warning-highlight' : '';
            const rateClass = isAboveAvg ? 'cancel-rate-high' : '';

            html += `
                <tr class="${rowClass}">
                    <td>${i + 1}</td>
                    <td class="${isManual ? 'shop-name-manual' : ''}" title="${escapeHtml(shopName)}">${escapeHtml(shopName).substring(0, 18)}${shopName.length > 18 ? '...' : ''}</td>
                    <td>${escapeHtml(s.sublessorName || '-')}</td>
                    <td>${escapeHtml(s.channel || '-')}</td>
                    <td>${escapeHtml(s.gameName)}</td>
                    <td>${s.cancelCount.toLocaleString()}</td>
                    <td>${s.orderCount.toLocaleString()}</td>
                    <td class="${rateClass}">${DataProcessor.formatPercent(s.cancelRate)}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    function renderSubletShopTable() {
        const comp = state.subletComparison;
        const data = state.subletThisWeek;
        const mode = state.subletShopMode;

        if (!comp || !comp.shopComparison) {
            $('sublet_shopTableBody').innerHTML = '<tr><td colspan="16" class="empty-tip">暂无数据，请上传数据文件</td></tr>';
            return;
        }

        const gameFilter = state.subletShopGameSelect ? state.subletShopGameSelect.getValue() : 'all';
        const channelFilter = $('sublet_shopChannelFilter').value;
        const search = $('sublet_shopSearch').value.trim().toLowerCase();
        const sortBy = $('sublet_shopSortBy').value;

        // 检测 shopComparison 是否有分渠道数据
        const hasChannelDataInComparison = comp.shopComparison.some(s => s.channel && s.channel !== '');

        // 基础过滤（游戏、渠道、搜索）
        let filtered;
        if (hasChannelDataInComparison || channelFilter === 'all') {
            filtered = comp.shopComparison.filter(s => {
                if (gameFilter !== 'all' && s.gameName !== gameFilter) return false;
                if (channelFilter !== 'all' && s.channel !== channelFilter) return false;
                const searchTarget = (s.shopName || '') + ' ' + (s.sublessorName || '') + ' ' + String(s.shopId || '');
                if (search && !searchTarget.toLowerCase().includes(search)) return false;
                return true;
            });
        } else {
            // 没有渠道细分数据，用本周数据找出该渠道下的店铺
            const channelShopIds = new Set();
            if (data && data.shopData) {
                data.shopData.forEach(s => {
                    if (channelFilter === 'all' || s.channel === channelFilter) {
                        channelShopIds.add(String(s.shopId));
                    }
                });
            }
            filtered = comp.shopComparison.filter(s => {
                if (gameFilter !== 'all' && s.gameName !== gameFilter) return false;
                if (channelFilter !== 'all' && !channelShopIds.has(String(s.shopId))) return false;
                const searchTarget = (s.shopName || '') + ' ' + (s.sublessorName || '') + ' ' + String(s.shopId || '');
                if (search && !searchTarget.toLowerCase().includes(search)) return false;
                return true;
            });
        }

        // 渲染表头
        renderSubletShopTableHead(mode);

        if (mode === 'sublessor') {
            renderSubletShopBySublessor(filtered, sortBy);
        } else {
            renderSubletShopByShop(filtered, sortBy, hasChannelDataInComparison);
        }
    }

    function renderSubletShopTableHead(mode) {
        const thead = $('sublet_shopTableHead');
        if (mode === 'sublessor') {
            thead.innerHTML = `
                <tr>
                    <th style="width:60px;">排名</th>
                    <th style="width:180px;">转租商名</th>
                    <th style="width:80px;">店铺数</th>
                    <th colspan="4">正常结算订单量</th>
                    <th colspan="4">正常结算订单金额</th>
                    <th colspan="4">平台营收</th>
                    <th style="width:100px;">操作</th>
                </tr>
                <tr>
                    <th></th>
                    <th></th>
                    <th></th>
                    <th>本周</th>
                    <th>上周</th>
                    <th>变化量</th>
                    <th>变化幅度</th>
                    <th>本周</th>
                    <th>上周</th>
                    <th>变化量</th>
                    <th>变化幅度</th>
                    <th>本周</th>
                    <th>上周</th>
                    <th>变化量</th>
                    <th>变化幅度</th>
                    <th></th>
                </tr>
            `;
        } else {
            thead.innerHTML = `
                <tr>
                    <th style="width:60px;">排名</th>
                    <th style="width:160px;">店铺名</th>
                    <th style="width:90px;">渠道</th>
                    <th style="width:140px;">转租商</th>
                    <th colspan="4">正常结算订单量</th>
                    <th colspan="4">正常结算订单金额</th>
                    <th colspan="4">平台营收</th>
                </tr>
                <tr>
                    <th></th>
                    <th></th>
                    <th></th>
                    <th></th>
                    <th>本周</th>
                    <th>上周</th>
                    <th>变化量</th>
                    <th>变化幅度</th>
                    <th>本周</th>
                    <th>上周</th>
                    <th>变化量</th>
                    <th>变化幅度</th>
                    <th>本周</th>
                    <th>上周</th>
                    <th>变化量</th>
                    <th>变化幅度</th>
                </tr>
            `;
        }
    }

    // 按转租商模式
    function renderSubletShopBySublessor(filtered, sortBy) {
        const tbody = $('sublet_shopTableBody');

        // 按转租商聚合，每个转租商下按shopId聚合店铺
        const sublessorMap = {};
        filtered.forEach(s => {
            // 使用转租商标识：优先sublessorId，其次sublessorName兜底
            const subKey = s.sublessorId || ('name:' + (s.sublessorName || '未知转租商'));
            // 店铺标识：空店铺用"empty_+转租商标识"确保各转租商分开
            const shopKey = s.shopId || ('empty_' + subKey);

            if (!sublessorMap[subKey]) {
                sublessorMap[subKey] = {
                    sublessorId: s.sublessorId,
                    sublessorName: s.sublessorName || '未知转租商',
                    currentOrders: 0, lastOrders: 0, ordersChange: 0,
                    currentAmount: 0, lastAmount: 0, amountChange: 0,
                    currentProfit: 0, lastProfit: 0, profitChange: 0,
                    shopMap: {} // shopId -> shopData
                };
            }
            const sub = sublessorMap[subKey];
            sub.currentOrders += s.currentOrders;
            sub.lastOrders += s.lastOrders;
            sub.ordersChange += s.ordersChange;
            sub.currentAmount += s.currentAmount;
            sub.lastAmount += s.lastAmount;
            sub.amountChange += s.amountChange;
            sub.currentProfit += s.currentProfit;
            sub.lastProfit += s.lastProfit;
            sub.profitChange += s.profitChange;

            // 店铺级聚合（跨游戏）
            if (!sub.shopMap[shopKey]) {
                sub.shopMap[shopKey] = {
                    shopId: s.shopId,
                    shopName: s.shopName,
                    channel: s.channel,
                    currentOrders: 0,
                    currentAmount: 0,
                    currentProfit: 0
                };
            }
            sub.shopMap[shopKey].currentOrders += s.currentOrders;
            sub.shopMap[shopKey].currentAmount += s.currentAmount;
            sub.shopMap[shopKey].currentProfit += s.currentProfit;
            if (s.shopName && !sub.shopMap[shopKey].shopName) sub.shopMap[shopKey].shopName = s.shopName;
            if (s.channel && !sub.shopMap[shopKey].channel) sub.shopMap[shopKey].channel = s.channel;
        });

        // 转换 shopMap 为数组并计算店铺数
        let sublessorList = Object.values(sublessorMap).map(sub => {
            const shops = Object.values(sub.shopMap);
            return {
                ...sub,
                shopCount: shops.length,
                shops: shops.sort((a, b) => b.currentAmount - a.currentAmount)
            };
        });

        // 排序
        if (sortBy === 'ordersChange') {
            sublessorList.sort((a, b) => b.ordersChange - a.ordersChange);
        } else if (sortBy === 'amountChange') {
            sublessorList.sort((a, b) => b.amountChange - a.amountChange);
        }

        if (sublessorList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="16" class="empty-tip">没有符合条件的数据</td></tr>';
            return;
        }

        let html = '';
        sublessorList.forEach((sub, i) => {
            const isExpanded = state.subletShopExpanded.has(i);

            const ordersChangeRate = sub.lastOrders > 0 ? (sub.ordersChange / sub.lastOrders * 100) : (sub.currentOrders > 0 ? 100 : 0);
            const amountChangeRate = sub.lastAmount > 0 ? (sub.amountChange / sub.lastAmount * 100) : (sub.currentAmount > 0 ? 100 : 0);
            const profitChangeRate = sub.lastProfit > 0 ? (sub.profitChange / sub.lastProfit * 100) : (sub.currentProfit > 0 ? 100 : 0);

            const orderClass = sub.ordersChange >= 0 ? 'change-up' : 'change-down';
            const amountClass = sub.amountChange >= 0 ? 'change-up' : 'change-down';
            const profitClass = sub.profitChange >= 0 ? 'change-up' : 'change-down';

            const expandBtn = `<button class="expand-btn shop-expand-btn ${isExpanded ? 'expanded' : ''}" data-shop-sub-index="${i}">
                ${isExpanded ? '收起 ↑' : '展开 ↓'}
            </button>`;

            html += `
                <tr class="shop-sublessor-row" data-shop-sub-index="${i}">
                    <td>${i + 1}</td>
                    <td>
                        <div class="sublessor-name-cell">
                            <span class="sublessor-main-name" title="${escapeHtml(sub.sublessorName)}">${escapeHtml(sub.sublessorName).substring(0, 18)}${sub.sublessorName.length > 18 ? '...' : ''}</span>
                        </div>
                    </td>
                    <td>${sub.shopCount}</td>
                    <td>${sub.currentOrders.toLocaleString()}</td>
                    <td>${sub.lastOrders.toLocaleString()}</td>
                    <td class="${orderClass}">${sub.ordersChange >= 0 ? '+' : ''}${sub.ordersChange.toLocaleString()}</td>
                    <td class="${orderClass}">${ordersChangeRate >= 0 ? '+' : ''}${ordersChangeRate.toFixed(1)}%</td>
                    <td>¥${sub.currentAmount.toFixed(2)}</td>
                    <td>¥${sub.lastAmount.toFixed(2)}</td>
                    <td class="${amountClass}">${sub.amountChange >= 0 ? '+' : ''}¥${sub.amountChange.toFixed(2)}</td>
                    <td class="${amountClass}">${amountChangeRate >= 0 ? '+' : ''}${amountChangeRate.toFixed(1)}%</td>
                    <td>¥${sub.currentProfit.toFixed(2)}</td>
                    <td>¥${sub.lastProfit.toFixed(2)}</td>
                    <td class="${profitClass}">${sub.profitChange >= 0 ? '+' : ''}¥${sub.profitChange.toFixed(2)}</td>
                    <td class="${profitClass}">${profitChangeRate >= 0 ? '+' : ''}${profitChangeRate.toFixed(1)}%</td>
                    <td>${expandBtn}</td>
                </tr>
            `;

            // 展开的店铺明细
            if (isExpanded && sub.shops && sub.shops.length > 0) {
                html += `<tr class="shop-expand-detail-row" data-shop-parent="${i}">
                    <td colspan="16">
                        <div class="shop-expand-detail-container">
                            <table class="shop-expand-detail-table">
                                <thead>
                                    <tr>
                                        <th style="width:200px;">店铺名</th>
                                        <th style="width:100px;">渠道</th>
                                        <th>结算订单量</th>
                                        <th>结算金额</th>
                                        <th>平台营收</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;
                sub.shops.forEach(shop => {
                    const shopName = shop.shopName && shop.shopName.trim() !== ''
                        ? shop.shopName
                        : '手动开单';
                    const isManual = !shop.shopName || shop.shopName.trim() === '';

                    html += `
                        <tr>
                            <td class="${isManual ? 'shop-name-manual' : ''}">${escapeHtml(shopName)}</td>
                            <td>${escapeHtml(shop.channel || '-')}</td>
                            <td>${shop.currentOrders.toLocaleString()}</td>
                            <td>¥${shop.currentAmount.toFixed(2)}</td>
                            <td>¥${shop.currentProfit.toFixed(2)}</td>
                        </tr>
                    `;
                });
                html += `
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>`;
            }
        });

        tbody.innerHTML = html;

        // 绑定展开/收起事件
        tbody.querySelectorAll('.shop-expand-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.shopSubIndex);
                if (state.subletShopExpanded.has(idx)) {
                    state.subletShopExpanded.delete(idx);
                } else {
                    state.subletShopExpanded.add(idx);
                }
                renderSubletShopTable();
            });
        });
    }

    // 按店铺模式
    function renderSubletShopByShop(filtered, sortBy, hasChannel) {
        const tbody = $('sublet_shopTableBody');

        // 聚合店铺（同店铺多游戏的情况，先按店铺汇总）
        const shopMap = {};
        filtered.forEach(s => {
            // 使用转租商标识+shopId作为key，确保手动开单按转租商分开
            const subKey = s.sublessorId || ('name:' + (s.sublessorName || '未知转租商'));
            const key = s.shopId || ('empty_' + subKey);
            if (!shopMap[key]) {
                shopMap[key] = {
                    shopId: s.shopId,
                    shopName: s.shopName,
                    sublessorName: s.sublessorName,
                    channel: s.channel,
                    currentOrders: 0, lastOrders: 0, ordersChange: 0,
                    currentAmount: 0, lastAmount: 0, amountChange: 0,
                    currentProfit: 0, lastProfit: 0, profitChange: 0
                };
            }
            shopMap[key].currentOrders += s.currentOrders;
            shopMap[key].lastOrders += s.lastOrders;
            shopMap[key].ordersChange += s.ordersChange;
            shopMap[key].currentAmount += s.currentAmount;
            shopMap[key].lastAmount += s.lastAmount;
            shopMap[key].amountChange += s.amountChange;
            shopMap[key].currentProfit += s.currentProfit;
            shopMap[key].lastProfit += s.lastProfit;
            shopMap[key].profitChange += s.profitChange;
            // 保留非空名称和渠道
            if (s.shopName && !shopMap[key].shopName) shopMap[key].shopName = s.shopName;
            if (s.sublessorName && !shopMap[key].sublessorName) shopMap[key].sublessorName = s.sublessorName;
            if (s.channel && !shopMap[key].channel) shopMap[key].channel = s.channel;
        });

        let shopList = Object.values(shopMap);

        // 排序
        if (sortBy === 'ordersChange') {
            shopList.sort((a, b) => b.ordersChange - a.ordersChange);
        } else if (sortBy === 'amountChange') {
            shopList.sort((a, b) => b.amountChange - a.amountChange);
        }

        if (shopList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="16" class="empty-tip">没有符合条件的数据</td></tr>';
            return;
        }

        let html = '';
        shopList.forEach((s, i) => {
            const ordersChangeRate = s.lastOrders > 0 ? (s.ordersChange / s.lastOrders * 100) : (s.currentOrders > 0 ? 100 : 0);
            const amountChangeRate = s.lastAmount > 0 ? (s.amountChange / s.lastAmount * 100) : (s.currentAmount > 0 ? 100 : 0);
            const profitChangeRate = s.lastProfit > 0 ? (s.profitChange / s.lastProfit * 100) : (s.currentProfit > 0 ? 100 : 0);

            const orderClass = s.ordersChange >= 0 ? 'change-up' : 'change-down';
            const amountClass = s.amountChange >= 0 ? 'change-up' : 'change-down';
            const profitClass = s.profitChange >= 0 ? 'change-up' : 'change-down';

            const shopName = s.shopName && s.shopName.trim() !== ''
                ? s.shopName
                : '手动开单';
            const isManual = !s.shopName || s.shopName.trim() === '';

            html += `
                <tr>
                    <td>${i + 1}</td>
                    <td class="${isManual ? 'shop-name-manual' : ''}" title="${escapeHtml(shopName)}">${escapeHtml(shopName).substring(0, 18)}${shopName.length > 18 ? '...' : ''}</td>
                    <td>${escapeHtml(s.channel || '-')}</td>
                    <td>${escapeHtml(s.sublessorName || '-')}</td>
                    <td>${s.currentOrders.toLocaleString()}</td>
                    <td>${s.lastOrders.toLocaleString()}</td>
                    <td class="${orderClass}">${s.ordersChange >= 0 ? '+' : ''}${s.ordersChange.toLocaleString()}</td>
                    <td class="${orderClass}">${ordersChangeRate >= 0 ? '+' : ''}${ordersChangeRate.toFixed(1)}%</td>
                    <td>¥${s.currentAmount.toFixed(2)}</td>
                    <td>¥${s.lastAmount.toFixed(2)}</td>
                    <td class="${amountClass}">${s.amountChange >= 0 ? '+' : ''}¥${s.amountChange.toFixed(2)}</td>
                    <td class="${amountClass}">${amountChangeRate >= 0 ? '+' : ''}${amountChangeRate.toFixed(1)}%</td>
                    <td>¥${s.currentProfit.toFixed(2)}</td>
                    <td>¥${s.lastProfit.toFixed(2)}</td>
                    <td class="${profitClass}">${s.profitChange >= 0 ? '+' : ''}¥${s.profitChange.toFixed(2)}</td>
                    <td class="${profitClass}">${profitChangeRate >= 0 ? '+' : ''}${profitChangeRate.toFixed(1)}%</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    // ========== 转租交叉分析：TOP游戏下TOP转租商 ==========
    function populateSubletCrossGameOptions(data) {
        const comp = state.subletComparison;
        const top10Games = comp && comp.subletTop10Games
            ? comp.subletTop10Games
            : [...data.gameData].sort((a, b) => b.settledAmount - a.settledAmount).slice(0, 10).map(g => g.gameName);

        // 填充下拉选择
        const select = $('sublet_crossGameSelect');
        const allGames = [...data.gameData].sort((a, b) => b.settledAmount - a.settledAmount);
        select.innerHTML = '<option value="">请选择游戏</option>';
        allGames.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.gameName;
            opt.textContent = g.gameName;
            select.appendChild(opt);
        });

        // 渲染 TOP10 游戏标签
        const tagBar = $('sublet_crossGameTags');
        let tagHtml = '';
        top10Games.forEach((game, idx) => {
            const rank = idx + 1;
            tagHtml += `<span class="game-tag" data-game="${escapeHtml(game)}">
                <span class="game-tag-rank">${rank}</span>
                <span class="game-tag-name">${escapeHtml(game)}</span>
            </span>`;
        });
        tagBar.innerHTML = tagHtml;

        // 绑定标签点击事件
        tagBar.querySelectorAll('.game-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                const game = tag.dataset.game;
                state.subletCrossGame = game;
                state.subletCrossExpanded.clear(); // 切换游戏时清空展开状态
                $('sublet_crossGameSelect').value = game;
                syncSubletCrossGameTags();
                renderSubletCrossTable();
            });
        });

        // 默认选中第一个游戏
        if (top10Games.length > 0 && !state.subletCrossGame) {
            state.subletCrossGame = top10Games[0];
            select.value = top10Games[0];
        }
        syncSubletCrossGameTags();
    }

    function syncSubletCrossGameTags() {
        const tags = document.querySelectorAll('#sublet_crossGameTags .game-tag');
        tags.forEach(tag => {
            tag.classList.toggle('active', tag.dataset.game === state.subletCrossGame);
        });
    }

    function renderSubletCrossTable() {
        const comp = state.subletComparison;
        const game = state.subletCrossGame;
        const sortBy = state.subletCrossSortBy;
        const tbody = $('sublet_crossTableBody');

        if (!comp || !comp.subletCrossAnalysis || !game) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-tip">请选择游戏查看转租商排名</td></tr>';
            return;
        }

        const crossData = comp.subletCrossAnalysis[game];
        if (!crossData || crossData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-tip">暂无数据</td></tr>';
            return;
        }

        // 按选择的排序方式排序（转租商级）
        let sorted = [...crossData];
        switch (sortBy) {
            case 'amount':
                sorted.sort((a, b) => b.settledAmount - a.settledAmount);
                break;
            case 'orders':
                sorted.sort((a, b) => b.settledOrderCount - a.settledOrderCount);
                break;
            case 'sublessorProfit':
                sorted.sort((a, b) => b.sublessorProfit - a.sublessorProfit);
                break;
            case 'platformProfit':
                sorted.sort((a, b) => b.platformProfit - a.platformProfit);
                break;
        }

        // 只取 TOP20
        sorted = sorted.slice(0, 20);

        let html = '';
        sorted.forEach((sub, i) => {
            const isExpanded = state.subletCrossExpanded.has(i);

            // 金额环比
            const amountRate = (sub.amountChangeRate * 100).toFixed(1);
            const amountClass = sub.amountChange >= 0 ? 'change-up' : 'change-down';
            const amountArrow = sub.amountChange >= 0 ? '↑' : '↓';

            // 订单环比
            const ordersRate = (sub.ordersChangeRate * 100).toFixed(1);
            const ordersClass = sub.ordersChange >= 0 ? 'change-up' : 'change-down';
            const ordersArrow = sub.ordersChange >= 0 ? '↑' : '↓';

            // 排名样式：前三名特殊标记
            const rankDisplay = i < 3
                ? `<span class="rank-badge rank-${i + 1}">${i + 1}</span>`
                : `<span class="rank-normal">${i + 1}</span>`;

            // 分级标签
            const gradeClass = 'grade-' + (sub.grade || 'D').toLowerCase();

            // 展开按钮
            const expandBtn = `<button class="expand-btn ${isExpanded ? 'expanded' : ''}" data-cross-index="${i}">
                ${isExpanded ? '收起店铺 ↑' : '展开店铺 ↓'}
            </button>`;

            html += `
                <tr class="cross-sublessor-row" data-cross-index="${i}">
                    <td>${rankDisplay}</td>
                    <td>
                        <div class="sublessor-name-cell">
                            <span class="sublessor-main-name" title="${escapeHtml(sub.sublessorName)}">${escapeHtml(sub.sublessorName).substring(0, 18)}${sub.sublessorName.length > 18 ? '...' : ''}</span>
                        </div>
                    </td>
                    <td>¥${sub.settledAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="${amountClass}">${amountArrow} ${Math.abs(parseFloat(amountRate))}%</td>
                    <td>${sub.settledOrderCount.toLocaleString()}</td>
                    <td class="${ordersClass}">${ordersArrow} ${Math.abs(parseFloat(ordersRate))}%</td>
                    <td>¥${sub.sublessorProfit.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>¥${sub.platformProfit.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td><span class="grade-tag ${gradeClass}">${sub.grade || '-'}</span></td>
                    <td>${sub.shopCount}</td>
                    <td>${expandBtn}</td>
                </tr>
            `;

            // 展开的店铺明细行
            if (isExpanded && sub.shops && sub.shops.length > 0) {
                html += `<tr class="cross-shop-detail-row" data-cross-parent="${i}">
                    <td colspan="11">
                        <div class="cross-shop-detail-container">
                            <table class="cross-shop-detail-table">
                                <thead>
                                    <tr>
                                        <th style="width:200px;">店铺名</th>
                                        <th style="width:100px;">渠道</th>
                                        <th colspan="2">结算金额</th>
                                        <th colspan="2">结算订单量</th>
                                        <th>平台收益</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;
                sub.shops.forEach(shop => {
                    const shopName = shop.shopName && shop.shopName.trim() !== ''
                        ? shop.shopName
                        : '手动开单';
                    const isManual = !shop.shopName || shop.shopName.trim() === '';

                    const sAmountRate = (shop.amountChangeRate * 100).toFixed(1);
                    const sAmountClass = shop.amountChange >= 0 ? 'change-up' : 'change-down';
                    const sAmountArrow = shop.amountChange >= 0 ? '↑' : '↓';

                    const sOrdersRate = (shop.ordersChangeRate * 100).toFixed(1);
                    const sOrdersClass = shop.ordersChange >= 0 ? 'change-up' : 'change-down';
                    const sOrdersArrow = shop.ordersChange >= 0 ? '↑' : '↓';

                    html += `
                        <tr>
                            <td class="${isManual ? 'shop-name-manual' : ''}">${escapeHtml(shopName)}</td>
                            <td>${escapeHtml(shop.channel || '-')}</td>
                            <td>¥${shop.settledAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="${sAmountClass}">${sAmountArrow} ${Math.abs(parseFloat(sAmountRate))}%</td>
                            <td>${shop.settledOrderCount.toLocaleString()}</td>
                            <td class="${sOrdersClass}">${sOrdersArrow} ${Math.abs(parseFloat(sOrdersRate))}%</td>
                            <td>¥${shop.platformProfit.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                    `;
                });
                html += `
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>`;
            }
        });

        tbody.innerHTML = html;

        // 绑定展开/收起按钮事件
        tbody.querySelectorAll('.expand-btn[data-cross-index]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.crossIndex);
                if (state.subletCrossExpanded.has(idx)) {
                    state.subletCrossExpanded.delete(idx);
                } else {
                    state.subletCrossExpanded.add(idx);
                }
                renderSubletCrossTable();
            });
        });
    }

    // ========== 渲染分销看板 ==========
    function renderDistributionDashboard() {
        const data = state.distThisWeek;
        const comp = state.distComparison;
        if (!data) return;

        // 1. KPI 卡片
        renderDistKPIs(data, comp);

        // 2. 分销商类型
        ChartManager.renderDistTypeOrdersChart('dist_typeOrdersChart', data.typeData);
        ChartManager.renderDistTypeProfitChart('dist_typeProfitChart', data.typeData);

        // 3. 游戏排名
        renderDistGameRank();

        // 4. 交叉分析
        populateDistCrossGameSelect(data);
        renderDistCrossTable();

        // 5. 异常预警
        renderDistWarningList();

        // 6. 退款撤单
        renderDistRefund(data, comp);
        ChartManager.renderMerchantCancelWarning(
            'dist_merchantCancelWarning',
            data.merchantCancelWarningList,
            data.top10AvgCancelRate
        );

        // 7. 分销商变化分析
        populateDistributorFilters(data);
        renderDistributorTable();
    }

    function renderDistKPIs(data, comp) {
        const t = data.totals;
        $('dist_totalAmount').textContent = DataProcessor.formatMoney(t.userPayment || t.orderAmount);
        $('dist_totalOrders').textContent = DataProcessor.formatInt(t.settledOrderCount);
        $('dist_cancelRate').textContent = DataProcessor.formatPercent(t.cancelRate);
        $('dist_platformProfit').textContent = DataProcessor.formatMoney(t.platformProfit);
        $('dist_distributorProfit').textContent = DataProcessor.formatMoney(t.distributorTotalProfit || 0);
        $('dist_selfOperatedRatio').textContent = DataProcessor.formatPercent(t.selfOperatedRatio || 0);

        if (comp && comp.totals) {
            setKPIChange('dist_totalAmount_change', comp.totals.settledAmount);
            setKPIChange('dist_totalOrders_change', comp.totals.settledOrderCount);
            setKPIChange_pp('dist_cancelRate_change', comp.totals.cancelRate);
            setKPIChange('dist_platformProfit_change', comp.totals.platformProfit);
            if (comp.totals.distributorProfit) {
                setKPIChange('dist_distributorProfit_change', comp.totals.distributorProfit);
            }
        }
    }

    function renderDistGameRank() {
        if (!state.distComparison) return;
        
        const data = state.distGameTab === 'amount'
            ? state.distComparison.top20AmountWithChange
            : state.distComparison.top20OrdersWithChange;
        
        if (data && data.length > 0) {
            ChartManager.renderGameRankChart('dist_gameRankChart', data, state.distGameTab);
        }
    }

    function populateDistCrossGameSelect(data) {
        const select = $('dist_crossGameSelect');
        // 取按订单量TOP20的游戏
        const topGames = [...data.gameData].sort((a, b) => b.settledOrderCount - a.settledOrderCount).slice(0, 20);
        select.innerHTML = '<option value="">请选择游戏</option>';
        topGames.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.gameName;
            opt.textContent = g.gameName;
            select.appendChild(opt);
        });
    }

    function renderDistCrossTable() {
        const game = $('dist_crossGameSelect').value;
        const sortBy = $('dist_crossSortBy').value;
        const tbody = $('dist_crossTableBody');

        if (!game || !state.distThisWeek) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-tip">请选择游戏查看分销商排名</td></tr>';
            return;
        }

        const crossData = state.distThisWeek.distributorGameData.filter(d => d.gameName === game);
        
        let sorted = [...crossData];
        switch (sortBy) {
            case 'amount':
                sorted.sort((a, b) => b.settledAmount - a.settledAmount);
                break;
            case 'orders':
                sorted.sort((a, b) => b.settledOrderCount - a.settledOrderCount);
                break;
            case 'distributorProfit':
                sorted.sort((a, b) => b.distributorProfit - a.distributorProfit);
                break;
            case 'platformProfit':
                sorted.sort((a, b) => b.platformProfit - a.platformProfit);
                break;
        }

        sorted = sorted.slice(0, 20);

        if (sorted.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-tip">暂无数据</td></tr>';
            return;
        }

        let html = '';
        sorted.forEach((d, i) => {
            html += `
                <tr>
                    <td>${i + 1}</td>
                    <td>${d.distributorId}</td>
                    <td>¥${d.settledAmount.toFixed(2)}</td>
                    <td>${d.settledOrderCount.toLocaleString()}</td>
                    <td>¥${d.distributorProfit.toFixed(2)}</td>
                    <td>¥${d.platformProfit.toFixed(2)}</td>
                    <td>${DataProcessor.formatPercent(d.cancelRate)}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    function renderDistWarningList() {
        const comp = state.distComparison;
        if (!comp) return;

        renderWarningList('dist_growthTop20', comp.growthTop20 || [], 'growth', 'distribution');
        renderWarningList('dist_declineTop20', comp.declineTop20 || [], 'decline', 'distribution');
    }

    function renderDistRefund(data, comp) {
        $('dist_refundCancelRate').textContent = DataProcessor.formatPercent(data.totals.cancelRate);
        $('dist_top10AvgCancelRate').textContent = DataProcessor.formatPercent(data.top10AvgCancelRate || 0);

        if (comp && comp.totals && comp.totals.cancelRate) {
            const pp = comp.totals.cancelRate.changePct;
            const el = $('dist_refundCancelRate_change');
            const arrow = pp >= 0 ? '↑' : '↓';
            el.innerHTML = `${arrow} ${Math.abs(pp).toFixed(2)}pp`;
            // 按数值方向着色：上升=红色，下降=绿色
            el.className = 'kpi-change ' + (pp > 0 ? 'up' : pp < 0 ? 'down' : 'flat');
        }
    }

    function populateDistributorFilters(data) {
        const gameItems = [{ value: 'all', label: '全部游戏' }];
        data.games.forEach(g => {
            gameItems.push({ value: g, label: g });
        });
        state.distGameSelect.setItems(gameItems);
    }

    function renderDistributorTable() {
        const comp = state.distComparison;
        if (!comp || !comp.distributorComparison) {
            $('dist_distributorTableBody').innerHTML = '<tr><td colspan="13" class="empty-tip">暂无数据，请上传数据文件</td></tr>';
            return;
        }

        const gameFilter = state.distGameSelect ? state.distGameSelect.getValue() : 'all';
        const search = $('dist_distributorSearch').value.trim();
        const sortBy = $('dist_distributorSortBy').value;

        // 如果有游戏筛选，从 distributorGameData 中过滤
        let filtered;
        if (gameFilter !== 'all') {
            // 需要从 distributorGameData 计算
            const twData = state.distThisWeek.distributorGameData.filter(d => d.gameName === gameFilter);
            const lwData = state.distLastWeek 
                ? state.distLastWeek.distributorGameData.filter(d => d.gameName === gameFilter)
                : [];
            
            const map = {};
            twData.forEach(d => {
                map[d.distributorId] = {
                    distributorId: d.distributorId,
                    currentOrders: d.settledOrderCount,
                    currentAmount: d.settledAmount,
                    currentProfit: d.platformProfit,
                    lastOrders: 0,
                    lastAmount: 0,
                    lastProfit: 0
                };
            });
            lwData.forEach(d => {
                if (!map[d.distributorId]) {
                    map[d.distributorId] = {
                        distributorId: d.distributorId,
                        currentOrders: 0,
                        currentAmount: 0,
                        currentProfit: 0,
                        lastOrders: 0,
                        lastAmount: 0,
                        lastProfit: 0
                    };
                }
                map[d.distributorId].lastOrders = d.settledOrderCount;
                map[d.distributorId].lastAmount = d.settledAmount;
                map[d.distributorId].lastProfit = d.platformProfit;
            });

            filtered = Object.values(map).map(d => ({
                ...d,
                ordersChange: d.currentOrders - d.lastOrders,
                ordersChangeRate: d.lastOrders > 0 ? (d.ordersChange / d.lastOrders) : (d.currentOrders > 0 ? 1 : 0),
                amountChange: d.currentAmount - d.lastAmount,
                amountChangeRate: d.lastAmount > 0 ? (d.amountChange / d.lastAmount) : (d.currentAmount > 0 ? 1 : 0),
                profitChange: d.currentProfit - d.lastProfit,
                profitChangeRate: d.lastProfit > 0 ? (d.profitChange / d.lastProfit) : (d.currentProfit > 0 ? 1 : 0)
            }));
        } else {
            filtered = [...comp.distributorComparison];
        }

        // 搜索
        if (search) {
            filtered = filtered.filter(d => String(d.distributorId).includes(search));
        }

        // 排序
        if (sortBy === 'ordersChange') {
            filtered.sort((a, b) => b.ordersChange - a.ordersChange);
        } else if (sortBy === 'amountChange') {
            filtered.sort((a, b) => b.amountChange - a.amountChange);
        }

        filtered = filtered.slice(0, 100);

        if (filtered.length === 0) {
            $('dist_distributorTableBody').innerHTML = '<tr><td colspan="13" class="empty-tip">没有符合条件的数据</td></tr>';
            return;
        }

        let html = '';
        filtered.forEach(d => {
            const ordersChangeRatePct = (d.ordersChangeRate * 100).toFixed(1);
            const amountChangeRatePct = (d.amountChangeRate * 100).toFixed(1);
            const profitChangeRatePct = (d.profitChangeRate * 100).toFixed(1);

            const orderClass = d.ordersChange >= 0 ? 'change-up' : 'change-down';
            const amountClass = d.amountChange >= 0 ? 'change-up' : 'change-down';
            const profitClass = d.profitChange >= 0 ? 'change-up' : 'change-down';

            html += `
                <tr>
                    <td>${d.distributorId}</td>
                    <td>${d.currentOrders.toLocaleString()}</td>
                    <td>${d.lastOrders.toLocaleString()}</td>
                    <td class="${orderClass}">${d.ordersChange >= 0 ? '+' : ''}${d.ordersChange.toLocaleString()}</td>
                    <td class="${orderClass}">${d.ordersChange >= 0 ? '+' : ''}${ordersChangeRatePct}%</td>
                    <td>¥${d.currentAmount.toFixed(2)}</td>
                    <td>¥${d.lastAmount.toFixed(2)}</td>
                    <td class="${amountClass}">${d.amountChange >= 0 ? '+' : ''}¥${d.amountChange.toFixed(2)}</td>
                    <td class="${amountClass}">${d.amountChange >= 0 ? '+' : ''}${amountChangeRatePct}%</td>
                    <td>¥${d.currentProfit.toFixed(2)}</td>
                    <td>¥${d.lastProfit.toFixed(2)}</td>
                    <td class="${profitClass}">${d.profitChange >= 0 ? '+' : ''}¥${d.profitChange.toFixed(2)}</td>
                    <td class="${profitClass}">${d.profitChange >= 0 ? '+' : ''}${profitChangeRatePct}%</td>
                </tr>
            `;
        });

        $('dist_distributorTableBody').innerHTML = html;
    }

    // ========== 数据源设置面板 ==========
    function initSettingsPanel() {
        // 打开设置面板
        $('settingsBtn').addEventListener('click', openSettingsModal);
        $('settingsCloseBtn').addEventListener('click', closeSettingsModal);
        $('settingsCancelBtn').addEventListener('click', closeSettingsModal);

        // 点击遮罩关闭
        $('settingsModal').addEventListener('click', (e) => {
            if (e.target.id === 'settingsModal') {
                closeSettingsModal();
            }
        });

        // 模式切换
        document.querySelectorAll('input[name="dataSourceMode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const mode = document.querySelector('input[name="dataSourceMode"]:checked').value;
                toggleUrlConfigSection(mode === 'url');
                toggleRefreshButton(mode === 'url');
            });
        });

        // 保存配置
        $('settingsSaveBtn').addEventListener('click', saveDataSourceConfig);

        // 立即刷新
        $('settingsRefreshBtn').addEventListener('click', () => {
            // 先保存当前输入的配置
            saveDataSourceConfig(false);
            // 然后加载
            loadDataFromUrls();
            closeSettingsModal();
        });

        // ESC键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeSettingsModal();
            }
        });
    }

    function openSettingsModal() {
        // 填充当前配置到表单
        document.querySelector(`input[name="dataSourceMode"][value="${state.dataSourceMode}"]`).checked = true;
        $('urlSubletThisWeek').value = state.urlConfig.subletThisWeek;
        $('urlSubletLastWeek').value = state.urlConfig.subletLastWeek;
        $('urlDistThisWeek').value = state.urlConfig.distThisWeek;
        $('urlDistLastWeek').value = state.urlConfig.distLastWeek;
        toggleUrlConfigSection(state.dataSourceMode === 'url');
        toggleRefreshButton(state.dataSourceMode === 'url');

        $('settingsModal').classList.add('active');
    }

    function closeSettingsModal() {
        $('settingsModal').classList.remove('active');
    }

    function toggleUrlConfigSection(show) {
        $('urlConfigSection').style.display = show ? 'block' : 'none';
    }

    function toggleRefreshButton(show) {
        $('settingsRefreshBtn').style.display = show ? 'inline-block' : 'none';
    }

    // ========== localStorage 配置管理 ==========
    const STORAGE_KEY = 'zuhaowan_dashboard_config';

    function loadDataSourceConfig() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const config = JSON.parse(saved);
                state.dataSourceMode = config.dataSourceMode || 'manual';
                if (config.urlConfig) {
                    state.urlConfig = { ...state.urlConfig, ...config.urlConfig };
                }
                // 应用模式到UI
                updateDataSourceModeUI();
            }
        } catch (e) {
            console.warn('[Config] 读取本地配置失败:', e);
        }
    }

    function saveDataSourceConfig(showTip = true) {
        const mode = document.querySelector('input[name="dataSourceMode"]:checked').value;
        state.dataSourceMode = mode;
        state.urlConfig = {
            subletThisWeek: $('urlSubletThisWeek').value.trim(),
            subletLastWeek: $('urlSubletLastWeek').value.trim(),
            distThisWeek: $('urlDistThisWeek').value.trim(),
            distLastWeek: $('urlDistLastWeek').value.trim()
        };

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                dataSourceMode: state.dataSourceMode,
                urlConfig: state.urlConfig
            }));
        } catch (e) {
            console.warn('[Config] 保存本地配置失败:', e);
        }

        updateDataSourceModeUI();

        if (showTip) {
            alert('配置已保存！' + (mode === 'url' ? ' 点击「立即刷新」加载数据。' : ''));
        }
    }

    function updateDataSourceModeUI() {
        const navRight = $('navRight');
        if (state.dataSourceMode === 'url') {
            navRight.classList.add('url-mode');
        } else {
            navRight.classList.remove('url-mode');
        }
    }

    function hasAnyUrlConfigured() {
        const c = state.urlConfig;
        return !!(c.subletThisWeek || c.subletLastWeek || c.distThisWeek || c.distLastWeek);
    }

    // ========== URL 数据加载 ==========
    async function loadDataFromUrls() {
        const config = state.urlConfig;
        const tasks = [];
        const results = {
            subletThisWeek: null,
            subletLastWeek: null,
            distThisWeek: null,
            distLastWeek: null
        };

        showUrlLoadingStatus('加载中...', 'loading');
        showLoading(true);

        // 构建加载任务
        if (config.subletThisWeek) {
            tasks.push(loadOneUrl(config.subletThisWeek, 'subletThisWeek', results));
        }
        if (config.subletLastWeek) {
            tasks.push(loadOneUrl(config.subletLastWeek, 'subletLastWeek', results));
        }
        if (config.distThisWeek) {
            tasks.push(loadOneUrl(config.distThisWeek, 'distThisWeek', results));
        }
        if (config.distLastWeek) {
            tasks.push(loadOneUrl(config.distLastWeek, 'distLastWeek', results));
        }

        try {
            await Promise.all(tasks);

            // 将结果存入state
            let loadedCount = 0;
            if (results.subletThisWeek) { state.subletThisWeek = results.subletThisWeek; loadedCount++; }
            if (results.subletLastWeek) { state.subletLastWeek = results.subletLastWeek; loadedCount++; }
            if (results.distThisWeek) { state.distThisWeek = results.distThisWeek; loadedCount++; }
            if (results.distLastWeek) { state.distLastWeek = results.distLastWeek; loadedCount++; }

            // 计算环比
            if (state.subletThisWeek) {
                state.subletComparison = DataProcessor.computeComparison(
                    state.subletThisWeek,
                    state.subletLastWeek || state.subletThisWeek,
                    'sublet'
                );
                renderSubletDashboard();
            }
            if (state.distThisWeek) {
                state.distComparison = DataProcessor.computeComparison(
                    state.distThisWeek,
                    state.distLastWeek || state.distThisWeek,
                    'distribution'
                );
                renderDistributionDashboard();
            }

            updatePeriodDisplay();
            updateDataStatus();

            if (loadedCount > 0) {
                showUrlLoadingStatus(`已加载 ${loadedCount} 个文件`, 'success');
            } else {
                showUrlLoadingStatus('未配置URL', 'error');
            }

            if (loadedCount === 0) {
                alert('未配置有效的URL链接，请在「数据源」设置中配置。');
            }
        } catch (err) {
            console.error('URL数据加载失败:', err);
            showUrlLoadingStatus('加载失败', 'error');
            alert('部分数据加载失败：' + err.message + '\n\n您可以：\n1. 检查URL链接是否正确、是否具有公开读取权限\n2. 切换回「手动上传」模式使用\n3. 如遇跨域问题，请使用支持CORS的文件托管服务');
        } finally {
            showLoading(false);
        }
    }

    async function loadOneUrl(url, key, results) {
        try {
            const excelData = await DataProcessor.loadExcelFromUrl(url);
            const dataType = DataProcessor.detectDataType(excelData.headers);

            let processedData = null;
            if (dataType === 'sublet') {
                processedData = DataProcessor.processSubletData(excelData.rows, excelData.headers);
            } else if (dataType === 'distribution') {
                processedData = DataProcessor.processDistributionData(excelData.rows, excelData.headers);
            } else {
                console.warn(`[URL加载] 无法识别数据类型: ${url}`);
                return;
            }

            // 验证数据类型是否匹配key（转租数据应放入转租槽位，分销数据放入分销槽位）
            const expectedType = key.startsWith('sublet') ? 'sublet' : 'distribution';
            if (dataType !== expectedType) {
                console.warn(`[URL加载] 数据类型不匹配: 期望${expectedType}, 实际${dataType}, URL: ${url}`);
            }

            results[key] = processedData;
        } catch (err) {
            console.error(`[URL加载] 失败 (${key}):`, err);
            // 记录但不中断其他加载
            throw err;
        }
    }

    function showUrlLoadingStatus(text, type) {
        const el = $('urlLoadStatus');
        if (!el) return;
        el.textContent = text;
        el.style.display = 'inline-flex';
        el.className = 'url-loading-status ' + (type === 'success' ? 'success' : type === 'error' ? 'error' : '');
    }

    // ========== 辅助函数 ==========
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showLoading(show) {
        $('loadingOverlay').classList.toggle('hidden', !show);
    }

    function updatePeriodDisplay() {
        let dateRange = null;
        if (state.currentTab === 'sublet' && state.subletThisWeek) {
            dateRange = state.subletThisWeek.dateRange;
        } else if (state.currentTab === 'distribution' && state.distThisWeek) {
            dateRange = state.distThisWeek.dateRange;
        }

        if (dateRange && dateRange.min && dateRange.max) {
            $('currentPeriod').textContent = 
                DataProcessor.formatDateDisplay(dateRange.min) + ' ~ ' + DataProcessor.formatDateDisplay(dateRange.max);
        } else {
            $('currentPeriod').textContent = '--';
        }
    }

    function updateDataStatus() {
        const hasSublet = state.subletThisWeek != null;
        const hasDist = state.distThisWeek != null;

        const statusEl = $('dataStatus');
        if (hasSublet || hasDist) {
            statusEl.textContent = '● 数据已加载';
            statusEl.className = 'status-indicator success';
            
            let msg = '';
            if (hasSublet) msg += '转租数据已加载 ';
            if (hasDist) msg += '分销数据已加载';
            statusEl.textContent = '● ' + msg;
        } else {
            statusEl.textContent = '● 未加载数据';
            statusEl.className = 'status-indicator warning';
        }
    }

    // ========== 启动 ==========
    document.addEventListener('DOMContentLoaded', init);
    // 兼容：如果脚本在DOM之后加载
    if (document.readyState !== 'loading') {
        init();
    }
})();
