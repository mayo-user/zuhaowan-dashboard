/**
 * IndexedDB 数据缓存模块
 * 将解析后的数据缓存到本地 IndexedDB，下次加载时直接从缓存读取
 * 大幅提升二次加载速度（瞬时加载）
 */
const StorageCache = (function() {
    'use strict';

    const DB_NAME = 'zuhaowan_dashboard_cache';
    const DB_VERSION = 1;
    const STORE_NAME = 'processed_data';

    let db = null;
    let initPromise = null;

    function init() {
        if (initPromise) return initPromise;
        
        initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.warn('[StorageCache] IndexedDB 打开失败:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                db = request.result;
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    const store = database.createObjectStore(STORE_NAME, { keyPath: 'key' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });

        return initPromise;
    }

    /**
     * 生成缓存键
     */
    function makeKey(fileName, fileSize, fileLastModified) {
        // 用文件名+大小+修改时间作为缓存键，确保文件变化时缓存失效
        return `${fileName}_${fileSize}_${fileLastModified || 0}`;
    }

    /**
     * 保存数据到缓存
     */
    async function set(key, data) {
        try {
            await init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                
                const record = {
                    key: key,
                    data: data,
                    timestamp: Date.now()
                };
                
                const request = store.put(record);
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
                
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
            });
        } catch (err) {
            console.warn('[StorageCache] 写入缓存失败:', err);
            return false;
        }
    }

    /**
     * 从缓存读取数据
     */
    async function get(key) {
        try {
            await init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const request = store.get(key);
                
                request.onsuccess = () => {
                    if (request.result) {
                        resolve(request.result.data);
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => reject(request.error);
            });
        } catch (err) {
            console.warn('[StorageCache] 读取缓存失败:', err);
            return null;
        }
    }

    /**
     * 检查缓存是否存在
     */
    async function has(key) {
        const data = await get(key);
        return data !== null;
    }

    /**
     * 删除指定缓存
     */
    async function remove(key) {
        try {
            await init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const request = store.delete(key);
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        } catch (err) {
            return false;
        }
    }

    /**
     * 清空所有缓存
     */
    async function clear() {
        try {
            await init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const request = store.clear();
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        } catch (err) {
            return false;
        }
    }

    /**
     * 获取缓存大小估算（仅记录数）
     */
    async function count() {
        try {
            await init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const request = store.count();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } catch (err) {
            return 0;
        }
    }

    /**
     * 清理过期缓存（保留最近 N 条）
     */
    async function cleanup(keepCount = 20) {
        try {
            await init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const index = store.index('timestamp');
                
                // 按时间倒序获取所有 key
                const keysToDelete = [];
                let count = 0;
                
                const cursorRequest = index.openCursor(null, 'prev');
                cursorRequest.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        count++;
                        if (count > keepCount) {
                            keysToDelete.push(cursor.primaryKey);
                        }
                        cursor.continue();
                    } else {
                        // 删除超出保留数量的记录
                        keysToDelete.forEach(key => store.delete(key));
                        resolve(keysToDelete.length);
                    }
                };
                cursorRequest.onerror = () => reject(cursorRequest.error);
            });
        } catch (err) {
            console.warn('[StorageCache] 清理缓存失败:', err);
            return 0;
        }
    }

    return {
        init,
        makeKey,
        set,
        get,
        has,
        remove,
        clear,
        count,
        cleanup
    };
})();
