export const state = {
  yingbangRowData: [],
  lunfeiRowData: [],
  currentRow: null,
  currentQuery: "",
  generatedSNList: [],
  isLoading: false
};

export function createUiRefs() {
  return {
    sourceHint: document.getElementById("source-hint"),
    yingbangTab: document.getElementById("tab-yingbang"),
    lunfeiTab: document.getElementById("tab-lunfei"),
    yingbangWorkspace: document.getElementById("yingbang-workspace"),
    lunfeiWorkspace: document.getElementById("lunfei-workspace"),
    status: document.getElementById("status"),
    lunfeiStatus: document.getElementById("status-lunfei"),
    previewPanel: document.getElementById("preview-panel"),
    lunfeiPreviewPanel: document.getElementById("preview-panel-lunfei"),
    historyPanel: document.getElementById("history-panel"),
    lunfeiHistoryPanel: document.getElementById("history-panel-lunfei"),
    searchInput: document.getElementById("search-input"),
    lunfeiSearchInput: document.getElementById("search-input-lunfei"),
    bindBtn: document.getElementById("btn-bind"),
    lunfeiBindBtn: document.getElementById("btn-bind-lunfei"),
    loadBtn: document.getElementById("btn-load"),
    lunfeiLoadBtn: document.getElementById("btn-load-lunfei"),
    historyBtn: document.getElementById("btn-history"),
    lunfeiHistoryBtn: document.getElementById("btn-history-lunfei"),
    queryBtn: document.getElementById("btn-query"),
    lunfeiQueryBtn: document.getElementById("btn-query-lunfei"),
    exportBtn: document.getElementById("btn-export"),
    lunfeiExportBtn: document.getElementById("btn-export-lunfei"),
    loadingIndicator: document.getElementById("loading-indicator"),
    lunfeiLoadingIndicator: document.getElementById("loading-indicator-lunfei"),
    fileInput: document.getElementById("file-input"),
    lunfeiFileInput: document.getElementById("file-input-lunfei")
  };
}
