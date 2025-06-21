// 背景服務工作器 (Service Worker)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openPopup') {
    // 開啟 popup 窗口（這個事件通常由 content script 觸發）
    chrome.action.openPopup();
  }
});

// 擴展安裝時的初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('LinkedIn Job Scraper 擴展已安裝');
});

// 監聽標籤頁更新，檢查是否為 LinkedIn 職缺頁面
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('linkedin.com/jobs/view/')) {
    // 可以在這裡添加額外的初始化邏輯
    console.log('LinkedIn 職缺頁面已載入:', tab.url);
  }
});

// 處理擴展圖示點擊
chrome.action.onClicked.addListener((tab) => {
  // 檢查是否在 LinkedIn 職缺頁面
  if (tab.url && tab.url.includes('linkedin.com/jobs/view/')) {
    // 如果在正確的頁面，popup 會自動打開
    console.log('在 LinkedIn 職缺頁面使用擴展');
  } else {
    // 如果不在正確的頁面，可以顯示通知
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png', // 如果有圖示的話
      title: 'LinkedIn Job Scraper',
      message: '請在 LinkedIn 職缺頁面使用此擴展'
    });
  }
});