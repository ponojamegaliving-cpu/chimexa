(function (global) {
  const STORAGE_KEYS = {
    rows: "realtorCachedRows",
    queue: "realtorPendingSyncQueue"
  };

  function createMemoryStorage() {
    const store = {};
    return {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      setItem(key, value) {
        store[key] = String(value);
      },
      removeItem(key) {
        delete store[key];
      },
      clear() {
        Object.keys(store).forEach((key) => delete store[key]);
      }
    };
  }

  function getStorage() {
    if (global.localStorage) {
      return global.localStorage;
    }

    if (!global.__realtorOfflineMemoryStorage) {
      global.__realtorOfflineMemoryStorage = createMemoryStorage();
    }

    return global.__realtorOfflineMemoryStorage;
  }

  function safeParse(value, fallback) {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  function getLocalRows() {
    return safeParse(getStorage().getItem(STORAGE_KEYS.rows), []);
  }

  function saveLocalRows(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    getStorage().setItem(STORAGE_KEYS.rows, JSON.stringify(safeRows));
    return safeRows;
  }

  function getPendingQueue() {
    return safeParse(getStorage().getItem(STORAGE_KEYS.queue), []);
  }

  function savePendingQueue(queue) {
    const safeQueue = Array.isArray(queue) ? queue : [];
    getStorage().setItem(STORAGE_KEYS.queue, JSON.stringify(safeQueue));
    return safeQueue;
  }

  function enqueuePendingAction(action) {
    const queue = getPendingQueue();
    const item = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: Date.now(),
      ...action
    };

    queue.push(item);
    savePendingQueue(queue);
    return item;
  }

  function removePendingAction(actionId) {
    const queue = getPendingQueue().filter((item) => item.id !== actionId);
    savePendingQueue(queue);
    return queue;
  }

  function clearPendingQueue() {
    savePendingQueue([]);
  }

  const api = {
    STORAGE_KEYS,
    getLocalRows,
    saveLocalRows,
    getPendingQueue,
    savePendingQueue,
    enqueuePendingAction,
    removePendingAction,
    clearPendingQueue
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.OfflineSync = api;
})(typeof window !== "undefined" ? window : globalThis);
