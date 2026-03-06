import { CONFIG } from "../config.js";

export const HistoryModule = {
  migrateLegacyYingbangKeys() {
    try {
      const legacyHistoryRaw = localStorage.getItem("sn_history");
      const legacyGenerationRaw = localStorage.getItem("sn_generation_history_by_work_order");
      const newHistoryExists = localStorage.getItem("yingbang_sn_history");
      const newGenerationExists = localStorage.getItem("yingbang_sn_generation_history_by_work_order");

      if (legacyHistoryRaw && !newHistoryExists) {
        localStorage.setItem("yingbang_sn_history", legacyHistoryRaw);
      }
      if (legacyGenerationRaw && !newGenerationExists) {
        localStorage.setItem("yingbang_sn_generation_history_by_work_order", legacyGenerationRaw);
      }
    } catch (error) {
      // ignore migration errors
    }
  },

  getHistory() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      return parsed;
    } catch (error) {
      localStorage.removeItem(CONFIG.STORAGE_KEY);
      return {};
    }
  },

  getLastSerial(historyKey) {
    const history = this.getHistory();
    const value = Number(history[String(historyKey ?? "").trim()]);
    return Number.isInteger(value) && value > 0 ? value : 0;
  },

  updateHistory(historyKey, count) {
    const key = String(historyKey ?? "").trim();
    const increment = Number(count);
    if (!key || !Number.isInteger(increment) || increment <= 0) {
      return this.getLastSerial(key);
    }

    const history = this.getHistory();
    const current = Number(history[key]);
    const lastSerial = Number.isInteger(current) && current > 0 ? current : 0;
    const nextSerial = lastSerial + increment;
    history[key] = nextSerial;
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(history));
    return nextSerial;
  },

  getGenerationHistoryMap() {
    try {
      const raw = localStorage.getItem(CONFIG.GENERATION_HISTORY_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      return parsed;
    } catch (error) {
      localStorage.removeItem(CONFIG.GENERATION_HISTORY_KEY);
      return {};
    }
  },

  getWorkOrderHistory(workOrder) {
    const key = String(workOrder ?? "").trim();
    if (!key) {
      return [];
    }
    const map = this.getGenerationHistoryMap();
    const list = map[key];
    return Array.isArray(list) ? list.filter((item) => String(item).trim()) : [];
  },

  appendWorkOrderHistory(workOrder, record) {
    const key = String(workOrder ?? "").trim();
    const value = String(record ?? "").trim();
    if (!key || !value) {
      return [];
    }

    const map = this.getGenerationHistoryMap();
    const current = Array.isArray(map[key]) ? map[key] : [];
    const next = [...current, value];
    map[key] = next;
    localStorage.setItem(CONFIG.GENERATION_HISTORY_KEY, JSON.stringify(map));
    return next;
  },

  clearWorkOrderHistory(workOrder, serialHistoryKey = "") {
    const workOrderKey = String(workOrder ?? "").trim();
    if (!workOrderKey) {
      return;
    }

    const generationMap = this.getGenerationHistoryMap();
    if (Object.hasOwn(generationMap, workOrderKey)) {
      delete generationMap[workOrderKey];
      localStorage.setItem(CONFIG.GENERATION_HISTORY_KEY, JSON.stringify(generationMap));
    }

    const serialKey = String(serialHistoryKey ?? "").trim();
    if (!serialKey) {
      return;
    }

    const serialMap = this.getHistory();
    if (Object.hasOwn(serialMap, serialKey)) {
      delete serialMap[serialKey];
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(serialMap));
    }
  },

  getSerialHistoryEntries() {
    const map = this.getHistory();
    return Object.keys(map)
      .sort((a, b) => a.localeCompare(b, "zh-Hant"))
      .map((key) => ({
        key,
        lastSerial: Number(map[key]) || 0
      }));
  },

  resetSerialHistoryKey(historyKey) {
    const key = String(historyKey ?? "").trim();
    if (!key) {
      return false;
    }
    const map = this.getHistory();
    if (!Object.hasOwn(map, key)) {
      return false;
    }
    delete map[key];
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(map));
    return true;
  }
};
