// content.js - Functional Programming Refactor
console.log('Universal Job Scraper content script loaded (Functional)');

// --- Pure Helper Functions ---

const cleanText = (text) => text?.replace(/\s+/g, ' ').trim() || '';

const getCurrentSite = (hostname) => {
  if (hostname.includes('linkedin.com')) return 'linkedin';
  if (hostname.includes('104.com.tw')) return '104';
  if (hostname.includes('1111.com.tw')) return '1111';
  if (hostname.includes('yourator.co')) return 'yourator';
  if (hostname.includes('cakeresume.com')) return 'cakeresume';
  return 'unknown';
};

const isJobPage = (site, url, pathname) => {
  const patterns = {
    linkedin: /\/jobs\/(view\/\d+|search\/.*currentJobId=\d+)/,
    104: /\/job\//,
    1111: /\/job\//,
    yourator: /\/jobs\/\w+/,
    cakeresume: /\/jobs\//
  };
  const isMatch = patterns[site]?.test(url) || patterns[site]?.test(pathname);
  console.log(`🔍 Site: ${site}, URL: ${url}, Is Job Page: ${isMatch}`);
  return isMatch || false;
};

const getSiteConfig = (site) => {
  const configs = {
    linkedin: { name: 'LinkedIn', buttonText: '📋 Scrape to Notion' },
    104: { name: '104人力銀行', buttonText: '📋 抓取到 Notion' },
    1111: { name: '1111人力銀行', buttonText: '📋 抓取到 Notion' },
    yourator: { name: 'Yourator', buttonText: '📋 Scrape to Notion' },
    cakeresume: { name: 'CakeResume', buttonText: '📋 Scrape to Notion' }
  };
  return configs[site] || { name: 'Unknown Site', buttonText: '📋 Scrape to Notion' };
};

// --- DOM Interaction Functions (Impure) ---

const getElement = (selector) => document.querySelector(selector);
const getElements = (selector) => document.querySelectorAll(selector);
const getText = (selector) => getElement(selector)?.textContent?.trim() || '';
const getHtml = (selector) => getElement(selector)?.innerHTML || '';

const getTextBySelectorList = (selectors, fallback = 'Unknown') => {
  for (const selector of selectors) {
    const element = getElement(selector);
    if (element && element.textContent?.trim()) {
      return element.textContent.trim();
    }
  }
  return fallback;
};

const getElementBySelectorList = (selectors) => {
  for (const selector of selectors) {
    const element = getElement(selector);
    if (element) return element;
  }
  return null;
};

// --- Toast Notification Module ---

const toast = (() => {
  let container = null;

  const createContainer = () => {
    if (getElement('#universal-scraper-toast-container')) return;
    container = document.createElement('div');
    container.id = 'universal-scraper-toast-container';
    container.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 10000;
      pointer-events: none; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;`;
    document.body.appendChild(container);
  };

  const removeToast = (toastElement) => {
    if (!toastElement || !toastElement.parentNode) return;
    toastElement.style.transform = 'translateX(100%)';
    setTimeout(() => toastElement.parentNode.removeChild(toastElement), 300);
  };

  const show = (message, type = 'info', duration = 0) => {
    if (!container) createContainer();
    const toastElement = document.createElement('div');
    const colors = {
      info: { bg: '#2563eb', icon: 'ℹ️' },
      success: { bg: '#059669', icon: '✅' },
      error: { bg: '#dc2626', icon: '❌' },
      warning: { bg: '#d97706', icon: '⚠️' },
      loading: { bg: '#0066cc', icon: '⏳' }
    };
    const style = colors[type] || colors.info;
    toastElement.style.cssText = `
      background: ${style.bg}; color: white; padding: 12px 16px; border-radius: 8px;
      margin-bottom: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform: translateX(100%);
      transition: transform 0.3s ease; pointer-events: auto; cursor: pointer; max-width: 300px;
      word-wrap: break-word; display: flex; align-items: center; gap: 8px;`;
    toastElement.innerHTML = `<span style="font-size: 16px;">${style.icon}</span><span style="flex: 1;">${message}</span>`;
    container.appendChild(toastElement);

    setTimeout(() => { toastElement.style.transform = 'translateX(0)'; }, 10);
    toastElement.addEventListener('click', () => removeToast(toastElement));
    if (duration > 0) setTimeout(() => removeToast(toastElement), duration);

    return toastElement;
  };

  return {
    show,
    remove: removeToast,
    showLoading: (msg) => show(msg, 'loading', 0),
    showSuccess: (msg, dur = 3000) => show(msg, 'success', dur),
    showError: (msg, dur = 5000) => show(msg, 'error', dur),
    showWarning: (msg, dur = 4000) => show(msg, 'warning', dur),
  };
})();

// --- Configuration Module ---

const configChecker = (() => {
  const checkAll = async () => {
    try {
      // Use a promise-based wrapper for sendMessage to ensure stability
      const sendMessagePromise = (payload) => {
        return new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(payload, (response) => {
            if (chrome.runtime.lastError) {
              return reject(chrome.runtime.lastError);
            }
            resolve(response);
          });
        });
      };

      const response = await sendMessagePromise({ 
        action: 'getConfig',
        keys: ['notionToken', 'databaseId', 'enableAI', 'aiConfigs', 'aiProvider']
      });

      if (!response || !response.success) throw new Error(response?.error || 'Failed to get config');
      
      const config = response.data;
      const aiConfigs = config.aiConfigs || {};
      const currentProvider = config.aiProvider || 'openai';
      const providerConfig = aiConfigs[currentProvider] || {};

      return {
        isNotionConfigured: !!(config.notionToken && config.databaseId),
        notionToken: config.notionToken,
        databaseId: config.databaseId,
        enableAI: config.enableAI || false,
        aiProvider: currentProvider,
        aiApiKey: providerConfig.apiKey,
        aiModel: providerConfig.selectedModel,
        isAIConfigured: config.enableAI && !!providerConfig.apiKey && !!providerConfig.selectedModel,
      };
    } catch (error) {
      console.error('Error checking configs:', error);
      return { isNotionConfigured: false, isAIConfigured: false, enableAI: false };
    }
  };

  const openPopupIfNeeded = async () => {
    try {
      await chrome.runtime.sendMessage({ action: 'openPopup' });
    } catch (error) {
      console.error('Error opening popup:', error);
      toast.showWarning('無法打開設定視窗，請點擊瀏覽器工具列中的擴展圖標進行設定', 5000);
    }
  };

  return { checkAll, openPopupIfNeeded };
})();


// --- LinkedIn Scraper Functions ---

const getLinkedInDescription = () => {
  const selectors = [
    'article.jobs-description__container .jobs-box__html-content',
    'article.jobs-description__container--condensed .jobs-description-content__text--stretch',
    '.jobs-description__container .jobs-box__html-content',
    '.jobs-description-content__text--stretch',
    '#job-details',
    'article .jobs-description__container',
    '.jobs-description__container',
    '.jobs-box__html-content',
    '.jobs-description-content__text'
  ];
  const element = getElementBySelectorList(selectors);
  if (!element) return 'Unable to get job description';

  // Prefer innerText for better formatting preservation
  if (element.innerText && element.innerText.trim()) {
    return element.innerText.trim();
  }
  
  // Fallback for complex structures
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = element.innerHTML;
  tempDiv.querySelectorAll('p, div, li').forEach(el => el.after(document.createTextNode('\n')));
  return tempDiv.textContent.replace(/\n{3,}/g, '\n\n').trim();
};

const extractSection = (description, patterns) => {
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && (match[1] || match[2])) {
      const content = (match[2] || match[1]).trim();
      if (content.length > 20) return content;
    }
  }
  return '';
};

const getLinkedInRequirements = (description) => {
  const patterns = [
    /✅\s*(Who\s+Are\s+You\?|Requirements?|Qualifications?)[\s\n]+(.*?)(?=\n\n✅|\n\n🌍|\n\n💰|$)/is,
    /\*\*(Requirements?|Qualifications?)\*\*[\s\n]+(.*?)(?=\n\n\*\*|\nBenefits|\nABOUT|$)/is,
    /(?:Requirements?|Qualifications?):[\s\n]+(.*?)(?=\n\n[A-Z]|\nBenefits|\nABOUT|$)/is,
    /(?:\*\*)?(職位要求|必備技能|資格要求)(?:\*\*)?:?[\s\n]+(.*?)(?=\n\n|福利|$)/is
  ];
  return extractSection(description, patterns);
};

const getLinkedInBenefits = (description) => {
  const patterns = [
    /🌍\s*(Work\s+Setup|Benefits?|What\s+we\s+offer)[\s\n]+(.*?)(?=\n\n🚀|\n\n✅|$)/is,
    /\*\*(Benefits?|What we offer|Perks?)\*\*[\s\n]+(.*?)(?=\n\n\*\*|\nRequirements|\nABOUT|$)/is,
    /(?:Benefits?|What we offer|Perks?):[\s\n]+(.*?)(?=\n\n[A-Z]|\nRequirements|\nABOUT|$)/is,
    /(?:\*\*)?(福利|待遇|我們提供)(?:\*\*)?:?[\s\n]+(.*?)(?=\n\n|職位要求|$)/is
  ];
  return extractSection(description, patterns);
};

const scrapeLinkedIn = async () => {
  console.log('🔍 LinkedIn: Starting job scraping (functional)...');
  const description = getLinkedInDescription();
  
  const jobData = {
    site: 'linkedin',
    siteName: 'LinkedIn',
    title: getTextBySelectorList([
      '.job-details-jobs-unified-top-card__job-title h1',
      'h1.top-card-layout__title',
      'h1'
    ], 'Unknown Position'),
    company: getTextBySelectorList([
      '.job-details-jobs-unified-top-card__company-name a',
      '.topcard__org-name-link',
      '.jobs-unified-top-card__company-name a'
    ], 'Unknown Company'),
    location: getTextBySelectorList([
      '.job-details-jobs-unified-top-card__bullet',
      '.topcard__flavor--bullet'
    ], 'Unknown Location'),
    salary: getTextBySelectorList([
        '.job-details-jobs-unified-top-card__job-insight--highlight',
        '.salary-main-rail__salary-info',
        '.compensation__salary'
    ], 'Not provided'),
    description: description,
    requirements: getLinkedInRequirements(description),
    benefits: getLinkedInBenefits(description),
    jobType: getTextBySelectorList([
        '.job-details-jobs-unified-top-card__job-insight span',
        '.job-criteria__text'
    ], 'Not specified'),
    experience: 'Not specified', // Simplified for now
    postedDate: getTextBySelectorList(['.jobs-unified-top-card__posted-date'], 'Unknown'),
    url: window.location.href,
    scrapedAt: new Date().toISOString()
  };

  if (!jobData.title || !jobData.company) {
    throw new Error('Could not scrape required fields (title, company).');
  }
  
  return jobData;
};

// --- Scraper Factory ---

const scraperFactory = (site) => {
  const scrapers = {
    linkedin: scrapeLinkedIn,
    // TODO: Add other site scrapers here
  };
  return scrapers[site];
};

// --- Floating Button & Drag Handler ---

const createFloatingButton = (siteConfig, clickHandler) => {
  if (getElement('#universal-scraper-btn')) return;

  const button = document.createElement('button');
  button.id = 'universal-scraper-btn';
  button.innerHTML = siteConfig.buttonText;
  button.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 9999; background: #0066cc;
    color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: grab;
    font-weight: bold; box-shadow: 0 4px 12px rgba(0,102,204,0.3);
    transition: transform 0.1s ease, box-shadow 0.1s ease; user-select: none;`;

  button.addEventListener('click', (e) => {
    // Only trigger click if not dragged
    if (button.getAttribute('data-dragged') !== 'true') {
      clickHandler(e);
    }
    button.setAttribute('data-dragged', 'false');
  });
  
  document.body.appendChild(button);
  makeDraggable(button);
};

const makeDraggable = (element) => {
  let isDragging = false;
  let startPos = { x: 0, y: 0 };
  let elementStartPos = { x: 0, y: 0 };

  const startDrag = (clientX, clientY) => {
    isDragging = true;
    element.setAttribute('data-dragged', 'false');
    startPos = { x: clientX, y: clientY };
    const rect = element.getBoundingClientRect();
    elementStartPos = { x: rect.left, y: rect.top };
    element.style.cursor = 'grabbing';
    element.style.transform = 'scale(1.05)';
  };

  const drag = (clientX, clientY) => {
    if (!isDragging) return;
    element.setAttribute('data-dragged', 'true');
    const deltaX = clientX - startPos.x;
    const deltaY = clientY - startPos.y;
    const newX = Math.max(0, Math.min(window.innerWidth - element.offsetWidth, elementStartPos.x + deltaX));
    const newY = Math.max(0, Math.min(window.innerHeight - element.offsetHeight, elementStartPos.y + deltaY));
    element.style.left = `${newX}px`;
    element.style.top = `${newY}px`;
    element.style.right = 'auto';
  };

  const endDrag = () => {
    if (!isDragging) return;
    isDragging = false;
    element.style.cursor = 'grab';
    element.style.transform = 'scale(1)';
    
    // Snap to edge
    const rect = element.getBoundingClientRect();
    const finalX = rect.left < (window.innerWidth / 2) ? 10 : window.innerWidth - rect.width - 10;
    element.style.transition = 'left 0.2s ease-out, top 0.2s ease-out';
    element.style.left = `${finalX}px`;
    
    chrome.runtime.sendMessage({
        action: 'setLocalStorage',
        data: { buttonPosition: { x: finalX, y: rect.top } }
    });

    setTimeout(() => element.style.transition = 'transform 0.1s ease, box-shadow 0.1s ease', 200);
  };

  element.addEventListener('mousedown', (e) => { e.preventDefault(); startDrag(e.clientX, e.clientY); });
  document.addEventListener('mousemove', (e) => drag(e.clientX, e.clientY));
  document.addEventListener('mouseup', endDrag);
  
  // Load saved position
  chrome.runtime.sendMessage({ action: 'getLocalStorage', keys: ['buttonPosition'] })
    .then(response => {
      if (response?.success && response.data?.buttonPosition) {
        const { x, y } = response.data.buttonPosition;
        element.style.left = `${Math.max(0, Math.min(window.innerWidth - element.offsetWidth, x))}px`;
        element.style.top = `${Math.max(0, Math.min(window.innerHeight - element.offsetHeight, y))}px`;
        element.style.right = 'auto';
      }
    }).catch(e => console.log('Could not load button position', e));
};


// --- Main Application Logic ---

let isScrapingInProgress = false;

const handleScrapeAndUpload = async () => {
  if (isScrapingInProgress) {
    toast.showWarning('已有抓取操作在進行中，請稍候...', 3000);
    return;
  }
  isScrapingInProgress = true;
  let loadingToast = toast.showLoading('檢查配置中...');

  try {
    const configs = await configChecker.checkAll();
    if (!configs.isNotionConfigured) {
      toast.showWarning('請先設定 Notion Token 和 Database ID', 4000);
      await configChecker.openPopupIfNeeded();
      throw new Error('Notion not configured.');
    }

    const site = getCurrentSite(window.location.hostname);
    const scrape = scraperFactory(site);
    if (!scrape) throw new Error(`不支援 ${site} 網站的抓取功能`);

    toast.remove(loadingToast);
    loadingToast = toast.showLoading('正在抓取職缺資料...');
    let jobData = await scrape();

    toast.remove(loadingToast);
    
    if (configs.isAIConfigured) {
      loadingToast = toast.showLoading('正在使用 AI 分析職缺資料...');
      const aiResponse = await chrome.runtime.sendMessage({
        action: 'analyzeWithAI',
        jobData,
        aiConfig: {
          aiProvider: configs.aiProvider,
          aiApiKey: configs.aiApiKey,
          aiModel: configs.aiModel
        }
      });
      if (aiResponse?.success) {
        jobData = aiResponse.result;
        toast.remove(loadingToast);
        loadingToast = toast.showLoading('AI 分析完成，正在上傳到 Notion...');
      } else {
        toast.showWarning('AI 分析失敗，將使用原始資料上傳', 3000);
      }
    } else {
        loadingToast = toast.showLoading('正在上傳到 Notion...');
    }

    const uploadResponse = await chrome.runtime.sendMessage({
      action: 'uploadToNotion',
      jobData,
      config: { notionToken: configs.notionToken, databaseId: configs.databaseId }
    });

    if (!uploadResponse?.success) throw new Error(uploadResponse?.error || '上傳到 Notion 失敗');

    const successMessage = jobData.aiProcessed
      ? `✅ 職缺已成功分析並儲存！`
      : `✅ 成功儲存到 Notion！`;
    toast.showSuccess(`${successMessage}<br>${jobData.title}`, 4000);

  } catch (error) {
    console.error('Scrape and upload error:', error);
    toast.showError(`❌ 操作失敗: ${error.message}`, 5000);
  } finally {
    if (loadingToast) toast.remove(loadingToast);
    isScrapingInProgress = false;
  }
};

const handleMessage = (request, _sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ success: true, message: 'Universal scraper loaded (Functional)' });
  } else if (request.action === 'scrapeJob') {
    const site = getCurrentSite(window.location.hostname);
    const scrape = scraperFactory(site);
    if (scrape) {
      scrape().then(data => sendResponse({ success: true, data }))
              .catch(err => sendResponse({ success: false, error: err.message }));
    } else {
      sendResponse({ success: false, error: `No scraper for site: ${site}` });
    }
    return true; // Indicates async response
  }
};

const init = () => {
  console.log('Initializing Universal Job Scraper...');
  const site = getCurrentSite(window.location.hostname);
  if (site === 'unknown') return;

  if (isJobPage(site, window.location.href, window.location.pathname)) {
    const siteConfig = getSiteConfig(site);
    createFloatingButton(siteConfig, handleScrapeAndUpload);
  }
  
  chrome.runtime.onMessage.addListener(handleMessage);
};

// --- Script Entry Point ---

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}