// popup.js - Functional Programming Refactor
console.log('Popup script loaded (Functional)');

// === Core Data Structures ===

const AppState = {
  config: {
    notion: { token: '', databaseId: '', pages: [], databases: [] },
    ai: { provider: 'openai', enabled: false, configs: {} },
    ui: { language: 'zh_TW', sections: { notion: false, ai: false } }
  },
  // 暫時狀態，只在當前 session 中有效，不會自動儲存
  tempSelections: {
    parentPageId: '',
    databaseId: '',
    databaseName: ''
  }
};

// === Pure Helper Functions ===

const dom = {
  get: (id) => document.getElementById(id),
  set: (id, value) => { 
    const el = dom.get(id); 
    if (el) el.value = value; 
    return el;
  },
  getText: (id) => dom.get(id)?.textContent || '',
  setHTML: (id, html) => {
    const el = dom.get(id);
    if (el) el.innerHTML = html;
    return el;
  },
  show: (id) => {
    const el = dom.get(id);
    if (el) el.style.display = 'block';
    return el;
  },
  hide: (id) => {
    const el = dom.get(id);
    if (el) el.style.display = 'none'; 
    return el;
  },
  toggle: (id, show) => show ? dom.show(id) : dom.hide(id),
  addClass: (id, className) => {
    const el = dom.get(id);
    if (el) el.classList.add(className);
    return el;
  },
  removeClass: (id, className) => {
    const el = dom.get(id);
    if (el) el.classList.remove(className);
    return el;
  },
  setChecked: (id, checked) => {
    const el = dom.get(id);
    if (el) el.checked = checked;
    return el;
  },
  setDisabled: (id, disabled) => {
    const el = dom.get(id);
    if (el) el.disabled = disabled;
    return el;
  }
};

const utils = {
  truncateText: (text, maxLength = 1950) => {
    if (!text || text.length <= maxLength) return text;
    const suffix = '\n\n... (內容已截斷，請查看原始連結)';
    const availableLength = maxLength - suffix.length;
    let truncated = text.substring(0, availableLength);
    const lastPeriod = truncated.lastIndexOf('.');
    if (lastPeriod > availableLength * 0.8) {
      truncated = truncated.substring(0, lastPeriod + 1);
    }
    return truncated + suffix;
  },
  
  getBrowserLanguage: () => {
    const language = navigator.language || navigator.userLanguage || 'en';
    return language.startsWith('zh') ? 'zh_TW' : 'en';
  },

  isLinkedInJobPage: (url) => {
    if (!url) return false;
    return url.includes('linkedin.com/jobs/view/') || 
           url.includes('linkedin.com/jobs/search/');
  },

  isDevelopmentMode: () => {
    return !chrome.runtime.getManifest().update_url;
  }
};

// === Configuration Management ===

const configManager = {
  load: async (keys = []) => {
    try {
      const result = await chrome.storage.sync.get(keys);
      return { success: true, data: result };
    } catch (error) {
      console.error('Config load error:', error);
      return { success: false, error: error.message };
    }
  },

  save: async (data) => {
    try {
      await chrome.storage.sync.set(data);
      return { success: true };
    } catch (error) {
      console.error('Config save error:', error);
      return { success: false, error: error.message };
    }
  },

  validate: {
    notion: (config) => !!(config.token && config.databaseId),
    ai: (config, provider) => {
      const providerConfig = config.configs?.[provider];
      return !!(config.enabled && providerConfig?.apiKey && providerConfig?.selectedModel);
    }
  }
};

// === Internationalization ===

const i18n = {
  getMessage: (key, language = AppState.config.ui.language) => {
    try {
      const message = chrome.i18n.getMessage(key);
      return message || i18n.getStaticMessage(key, language);
    } catch (error) {
      return i18n.getStaticMessage(key, language);
    }
  },

  getStaticMessage: (key, language) => {
    const messages = {
      en: {
        extensionName: 'Universal Job Scraper',
        saveConfig: 'Save Config',
        previewBtn: 'Preview',
        scrapeBtn: 'Scrape & Save',
        createDbBtn: 'Create Database',
        // ... add more messages as needed
      },
      zh_TW: {
        extensionName: '多平台職缺抓取工具',
        saveConfig: '儲存設定',
        previewBtn: '預覽',
        scrapeBtn: '抓取並儲存',
        createDbBtn: '建立資料庫',
        // ... add more messages as needed
      }
    };
    return messages[language]?.[key] || key;
  },

  updateAllElements: (language = AppState.config.ui.language) => {
    // Update elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const message = i18n.getMessage(key, language);
      if (message) element.textContent = message;
    });

    // Update elements with data-i18n-placeholder attribute
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      const message = i18n.getMessage(key, language);
      if (message) element.placeholder = message;
    });
  }
};

// === Status Management ===

const statusManager = {
  show: (message, type = 'info') => {
    const statusEl = dom.get('status');
    if (!statusEl) return;
    
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    dom.show('status');
    
    if (type === 'success' || type === 'error') {
      setTimeout(() => dom.hide('status'), 3000);
    }
  },

  showSuccess: (message) => statusManager.show(message, 'success'),
  showError: (message) => statusManager.show(message, 'error'),
  showInfo: (message) => statusManager.show(message, 'info'),
  hide: () => dom.hide('status')
};

// === Notion API Integration ===

const notionApi = {
  loadPages: async (token) => {
    try {
      console.log('🚀 [Popup] notionApi.loadPages 開始執行');
      console.log('📡 [Popup] 向 background 發送載入頁面請求:', { 
        action: 'loadNotionPages', 
        tokenPrefix: token.substring(0, 10) + '...',
        tokenLength: token.length
      });
      
      console.log('⏳ [Popup] 等待 background 回應...');
      const response = await chrome.runtime.sendMessage({
        action: 'loadNotionPages',
        token
      });
      
      console.log('📨 [Popup] 收到 background 回應:', {
        success: response?.success,
        hasData: !!response?.data,
        dataLength: response?.data?.length,
        error: response?.error
      });
      console.log('📋 [Popup] 完整回應內容:', response);
      
      if (response?.success) {
        console.log('✅ [Popup] 載入成功，返回頁面數據');
        return response.data || [];
      } else {
        console.error('❌ [Popup] background 返回錯誤:', response?.error);
        throw new Error(response?.error || 'Unknown error from background');
      }
    } catch (error) {
      console.error('❌ [Popup] notionApi.loadPages 發生錯誤:', error);
      console.error('🔍 [Popup] 錯誤詳細信息:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw error; // 重新拋出錯誤讓上層處理
    }
  },

  createDatabase: async (token, parentPageId, databaseName = '求職追蹤資料庫', language = 'zh_TW') => {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'createNotionDatabase',
        token,
        parentPageId,
        databaseName,
        language
      });
      return response;
    } catch (error) {
      console.error('Create database error:', error);
      return { success: false, error: error.message };
    }
  },

  loadDatabases: async (token) => {
    try {
      console.log('🚀 [Popup] notionApi.loadDatabases 開始執行');
      const response = await chrome.runtime.sendMessage({
        action: 'loadNotionDatabases',
        token
      });
      
      if (response?.success) {
        console.log('✅ [Popup] 載入資料庫成功，數量:', response.data?.length);
        return response.data || [];
      } else {
        console.error('❌ [Popup] 載入資料庫失敗:', response?.error);
        throw new Error(response?.error || 'Unknown error from background');
      }
    } catch (error) {
      console.error('❌ [Popup] notionApi.loadDatabases 發生錯誤:', error);
      throw error;
    }
  },

  updatePageSelect: (pages, autoLoadDatabases = true) => {
    const select = dom.get('parentPageSelect');
    if (!select) return;

    select.innerHTML = '';
    
    if (pages.length === 0) {
      select.innerHTML = '<option value="">無可用頁面 - 請檢查 Token 權限</option>';
      return;
    }

    select.innerHTML = '<option value="">選擇父頁面...</option>';
    
    // 先顯示 workspace 頁面，再顯示其他頁面
    const workspacePages = pages.filter(page => page.parentType === 'workspace');
    const otherPages = pages.filter(page => page.parentType !== 'workspace');
    
    // 添加 workspace 頁面 (推薦)
    if (workspacePages.length > 0) {
      const workspaceGroup = document.createElement('optgroup');
      workspaceGroup.label = '📁 Workspace 頁面 (推薦)';
      workspacePages.forEach(page => {
        const option = document.createElement('option');
        option.value = page.id;
        option.textContent = page.originalTitle || page.title;
        workspaceGroup.appendChild(option);
      });
      select.appendChild(workspaceGroup);
    }
    
    // 添加其他頁面
    if (otherPages.length > 0) {
      const otherGroup = document.createElement('optgroup');
      otherGroup.label = '📄 其他頁面';
      otherPages.forEach(page => {
        const option = document.createElement('option');
        option.value = page.id;
        option.textContent = page.originalTitle || page.title;
        otherGroup.appendChild(option);
      });
      select.appendChild(otherGroup);
    }

    // 預設選擇第一個 workspace 頁面，如果沒有則選擇第一個頁面
    let selectedPageId = '';
    if (workspacePages.length > 0) {
      selectedPageId = workspacePages[0].id;
      select.value = selectedPageId;
    } else if (pages.length > 0) {
      selectedPageId = pages[0].id;
      select.value = selectedPageId;
    }
    
    console.log('📋 頁面選擇器已更新:', {
      workspace: workspacePages.length,
      other: otherPages.length,
      selected: select.value
    });

    // 如果自動選擇了頁面且有 token，自動載入資料庫
    if (selectedPageId && autoLoadDatabases) {
      const token = dom.get('notionToken')?.value;
      if (token) {
        console.log('🚀 [Popup] 自動選擇頁面後載入資料庫:', selectedPageId.substring(0, 8) + '...');
        // 更新暫時狀態
        AppState.tempSelections.parentPageId = selectedPageId;
        // 觸發資料庫載入（非同步執行，不等待結果）
        eventHandlers.loadDatabasesForParent(selectedPageId).catch(error => {
          console.warn('⚠️ [Popup] 自動載入資料庫失敗:', error);
        });
      } else {
        console.log('ℹ️ [Popup] 沒有 token，跳過自動載入資料庫');
      }
    }
  },

  showDatabaseName: (databaseName) => {
    if (!databaseName) {
      dom.hide('databaseNameDisplay');
      return;
    }
    
    dom.setHTML('databaseNameText', databaseName);
    dom.show('databaseNameDisplay');
    console.log('📊 [Popup] 顯示資料庫名稱:', databaseName);
  },

  loadDatabasesForParent: async (token, parentPageId) => {
    try {
      console.log('🚀 [Popup] loadDatabasesForParent 開始執行, 父頁面:', parentPageId.substring(0, 8) + '...');
      const response = await chrome.runtime.sendMessage({
        action: 'loadNotionDatabases',
        token,
        parentPageId
      });
      
      if (response?.success) {
        console.log('✅ [Popup] 載入父頁面資料庫成功，數量:', response.data?.length);
        return response.data || [];
      } else {
        console.error('❌ [Popup] 載入父頁面資料庫失敗:', response?.error);
        throw new Error(response?.error || 'Unknown error from background');
      }
    } catch (error) {
      console.error('❌ [Popup] loadDatabasesForParent 發生錯誤:', error);
      throw error;
    }
  },

  updateDatabaseSelect: (databases) => {
    const select = dom.get('databaseSelect');
    
    if (!select) return;

    select.innerHTML = '';
    
    if (databases.length === 0) {
      select.innerHTML = '<option value="">未找到相容的資料庫</option>';
      dom.hide('databaseCompatibilityInfo');
      return;
    }

    select.innerHTML = '<option value="">選擇現有資料庫...</option>';
    
    databases.forEach(db => {
      const option = document.createElement('option');
      option.value = db.id;
      
      // 相容性指示器
      const compatibilityIcon = {
        perfect: '🟢',
        good: '🟡', 
        partial: '🟠',
        poor: '🔴'
      }[db.compatibility.level] || '⚪';
      
      option.textContent = `${compatibilityIcon} ${db.title}`;
      option.setAttribute('data-compatibility', db.compatibility.level);
      option.setAttribute('data-title', db.title);
      select.appendChild(option);
    });

    console.log('📊 [Popup] 資料庫選擇器已更新:', databases.length, '個資料庫');
  },

  showDatabaseCompatibilityInfo: (database) => {
    const infoDiv = dom.get('databaseCompatibilityInfo');
    if (!infoDiv || !database) {
      dom.hide('databaseCompatibilityInfo');
      return;
    }

    const compatibility = database.compatibility;
    const levelText = {
      perfect: '完美相容',
      good: '良好相容',
      partial: '部分相容',
      poor: '相容性較差'
    }[compatibility.level] || '未知';

    const levelColor = {
      perfect: '#059669',
      good: '#d97706',
      partial: '#ea580c',
      poor: '#dc2626'
    }[compatibility.level] || '#6b7280';

    let html = `<span style="color: ${levelColor}; font-weight: 600;">${levelText}</span>`;
    
    if (compatibility.missingFields && compatibility.missingFields.length > 0) {
      html += ` | 缺少欄位: ${compatibility.missingFields.join(', ')}`;
    }

    dom.setHTML('databaseCompatibilityInfo', html);
    dom.show('databaseCompatibilityInfo');
  }
};

// === UI Event Handlers ===

const eventHandlers = {
  saveConfig: async () => {
    const token = dom.get('notionToken')?.value;
    const dbId = dom.get('databaseId')?.value;

    if (!token || !dbId) {
      statusManager.showError(i18n.getMessage('configRequiredFields'));
      return;
    }

    statusManager.showInfo(i18n.getMessage('statusSavingConfig'));
    
    // 準備完整的儲存資料，從暫時狀態讀取
    const saveData = {
      notionToken: token,
      databaseId: dbId
    };

    // 從暫時狀態讀取並持久化
    if (AppState.tempSelections.parentPageId) {
      saveData.selectedParentPageId = AppState.tempSelections.parentPageId;
      console.log('💾 [Popup] 持久化父頁面選擇:', AppState.tempSelections.parentPageId.substring(0, 8) + '...');
    }

    if (AppState.tempSelections.databaseName) {
      saveData.databaseName = AppState.tempSelections.databaseName;
      console.log('💾 [Popup] 持久化資料庫名稱:', AppState.tempSelections.databaseName);
    }

    // 如果當前有快取的頁面，也一併保存
    if (AppState.config.notion.pages && AppState.config.notion.pages.length > 0) {
      saveData.cachedNotionPages = AppState.config.notion.pages;
      console.log('💾 [Popup] 儲存快取頁面:', AppState.config.notion.pages.length, '個');
    }
    
    const result = await configManager.save(saveData);

    if (result.success) {
      // 更新持久狀態
      AppState.config.notion.token = token;
      AppState.config.notion.databaseId = dbId;
      
      statusManager.showSuccess(i18n.getMessage('configSaved'));
      console.log('✅ [Popup] 完整配置已儲存，暫時狀態已持久化');
    } else {
      statusManager.showError(`儲存失敗: ${result.error}`);
    }
  },

  saveAiConfig: async () => {
    const provider = dom.get('aiProvider')?.value;
    const apiKey = dom.get('aiApiKey')?.value;
    const model = dom.get('aiModel')?.value;
    const enableAI = dom.get('enableAI')?.checked;

    if (enableAI && (!apiKey || !model)) {
      statusManager.showError('請填入 AI API Key 和選擇模型');
      return;
    }

    const aiConfigs = AppState.config.ai.configs;
    if (!aiConfigs[provider]) aiConfigs[provider] = {};
    
    aiConfigs[provider] = {
      ...aiConfigs[provider],
      apiKey,
      selectedModel: model
    };

    const result = await configManager.save({
      aiProvider: provider,
      aiConfigs,
      enableAI
    });

    if (result.success) {
      AppState.config.ai.provider = provider;
      AppState.config.ai.configs = aiConfigs;
      AppState.config.ai.enabled = enableAI;
      statusManager.showSuccess('AI 設定已儲存');
    } else {
      statusManager.showError(`儲存失敗: ${result.error}`);
    }
  },

  loadModels: async () => {
    const provider = dom.get('aiProvider')?.value;
    const apiKey = dom.get('aiApiKey')?.value;

    if (!apiKey) {
      statusManager.showError('請先填入 API Key');
      return;
    }

    statusManager.showInfo('載入模型中...');
    dom.setDisabled('loadModels', true);

    try {
      let models = [];
      
      if (provider === 'openai') {
        models = await aiProviders.fetchOpenAIModels(apiKey);
      } else if (provider === 'openrouter') {
        models = await aiProviders.fetchOpenRouterModels(apiKey);
      }

      aiProviders.updateModelSelect(models);
      statusManager.showSuccess(`載入了 ${models.length} 個模型`);
      
    } catch (error) {
      statusManager.showError(`載入模型失敗: ${error.message}`);
    } finally {
      dom.setDisabled('loadModels', false);
    }
  },

  toggleLanguage: async () => {
    const newLang = AppState.config.ui.language === 'zh_TW' ? 'en' : 'zh_TW';
    AppState.config.ui.language = newLang;
    
    await configManager.save({ preferredLanguage: newLang });
    i18n.updateAllElements(newLang);
    ui.updateLanguageToggleTooltip(newLang);
    
    statusManager.showSuccess(i18n.getMessage('languageSwitched', newLang));
  },

  previewData: async () => {
    statusManager.showInfo('抓取資料中...');
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!utils.isLinkedInJobPage(tab.url)) {
        statusManager.showError('請在 LinkedIn 職缺頁面使用此功能');
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeJob' });
      
      if (response?.success) {
        ui.showPreview(response.data);
        statusManager.showSuccess('資料預覽已載入');
      } else {
        statusManager.showError(response?.error || '抓取失敗');
      }
    } catch (error) {
      statusManager.showError(`預覽失敗: ${error.message}`);
    }
  },

  scrapeAndSave: async () => {
    if (!configManager.validate.notion(AppState.config.notion)) {
      statusManager.showError('請先設定 Notion Token 和 Database ID');
      return;
    }

    statusManager.showInfo('抓取並上傳中...');
    dom.setDisabled('scrapeBtn', true);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeJob' });
      
      if (!response?.success) {
        throw new Error(response?.error || '抓取失敗');
      }

      let jobData = response.data;

      // AI 分析 (如果啟用)
      if (AppState.config.ai.enabled && configManager.validate.ai(AppState.config.ai, AppState.config.ai.provider)) {
        statusManager.showInfo('AI 分析中...');
        
        const aiResponse = await chrome.runtime.sendMessage({
          action: 'analyzeWithAI',
          jobData,
          aiConfig: {
            aiProvider: AppState.config.ai.provider,
            aiApiKey: AppState.config.ai.configs[AppState.config.ai.provider]?.apiKey,
            aiModel: AppState.config.ai.configs[AppState.config.ai.provider]?.selectedModel
          }
        });

        if (aiResponse?.success) {
          jobData = aiResponse.result;
        }
      }

      // 上傳到 Notion
      statusManager.showInfo('上傳到 Notion...');
      const uploadResponse = await chrome.runtime.sendMessage({
        action: 'uploadToNotion',
        jobData,
        config: {
          notionToken: AppState.config.notion.token,
          databaseId: AppState.config.notion.databaseId
        },
        language: AppState.config.ui.language
      });

      if (uploadResponse?.success) {
        const message = jobData.aiProcessed ? '✅ 職缺已成功分析並儲存！' : '✅ 成功儲存到 Notion！';
        statusManager.showSuccess(message);
      } else {
        throw new Error(uploadResponse?.error || '上傳失敗');
      }

    } catch (error) {
      statusManager.showError(`操作失敗: ${error.message}`);
    } finally {
      dom.setDisabled('scrapeBtn', false);
    }
  },

  loadNotionPages: async () => {
    console.log('🚀 [Popup] loadNotionPages 被調用');
    
    try {
      const tokenElement = dom.get('notionToken');
      console.log('🔍 [Popup] Token 元素檢查:', {
        element: !!tokenElement,
        value: tokenElement?.value ? `${tokenElement.value.substring(0, 10)}...` : 'empty',
        valueLength: tokenElement?.value?.length
      });
      
      const token = tokenElement?.value;
      
      if (!token) {
        console.log('❌ [Popup] Token 為空，停止執行');
        statusManager.showError('請先填入 Notion Token');
        return;
      }

      console.log('📡 [Popup] 開始載入頁面流程...');
      statusManager.showInfo('載入頁面中...');
      dom.setDisabled('refreshPagesBtn', true);

      console.log('⏳ [Popup] 調用 notionApi.loadPages...');
      const pages = await notionApi.loadPages(token);
      console.log('📄 [Popup] notionApi.loadPages 返回結果:', {
        isArray: Array.isArray(pages),
        length: pages?.length,
        firstPage: pages?.[0] ? {
          id: pages[0].id?.substring(0, 8) + '...',
          title: pages[0].title
        } : null
      });
      
      console.log('🔄 [Popup] 更新頁面選擇器...');
      notionApi.updatePageSelect(pages);
      AppState.config.notion.pages = pages;
      
      if (pages.length > 0) {
        console.log(`✅ [Popup] 成功載入 ${pages.length} 個頁面`);
        statusManager.showSuccess(`載入了 ${pages.length} 個頁面`);
        
        // 快取頁面數據
        await configManager.save({ cachedNotionPages: pages });
        console.log('💾 [Popup] 頁面數據已快取');
      } else {
        console.log('⚠️ [Popup] 未找到任何頁面');
        statusManager.showWarning('未找到可用頁面，請確認 Token 權限');
      }
    } catch (error) {
      console.error('❌ [Popup] 載入頁面失敗:', error);
      console.error('🔍 [Popup] 錯誤詳細信息:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      statusManager.showError(`載入頁面失敗: ${error.message}`);
    } finally {
      console.log('🔚 [Popup] 載入頁面流程結束，清理狀態');
      dom.setDisabled('refreshPagesBtn', false);
      statusManager.hide(); // 確保清除載入狀態
    }
  },

  createDatabase: async () => {
    const token = dom.get('notionToken')?.value;
    const parentPageId = dom.get('parentPageSelect')?.value;
    const databaseName = dom.get('newDatabaseName')?.value || '求職追蹤資料庫';

    if (!token) {
      statusManager.showError('請先填入 Notion Token');
      return;
    }

    if (!parentPageId) {
      statusManager.showError('請選擇父頁面');
      return;
    }

    statusManager.showInfo('建立資料庫中...');
    dom.setDisabled('createDbBtn', true);

    try {
      const result = await notionApi.createDatabase(token, parentPageId, databaseName, AppState.config.ui.language);
      
      if (result.success) {
        // 自動填入 Database ID
        dom.set('databaseId', result.databaseId);
        AppState.config.notion.databaseId = result.databaseId;
        
        // 顯示資料庫名稱
        notionApi.showDatabaseName(result.title || databaseName);
        
        statusManager.showSuccess(`✅ 資料庫「${result.title}」建立成功！`);
        
        // 自動儲存配置
        await configManager.save({
          notionToken: token,
          databaseId: result.databaseId,
          databaseName: result.title || databaseName
        });
        
        statusManager.showSuccess('設定已自動儲存');
      } else {
        throw new Error(result.error || '建立失敗');
      }
    } catch (error) {
      statusManager.showError(`建立資料庫失敗: ${error.message}`);
    } finally {
      dom.setDisabled('createDbBtn', false);
    }
  },

  loadDatabasesForParent: async (parentPageId) => {
    const token = dom.get('notionToken')?.value;
    
    if (!token) {
      statusManager.showError('請先填入 Notion Token');
      return;
    }

    if (!parentPageId) {
      dom.hide('databaseSelectionGroup');
      return;
    }

    statusManager.showInfo('載入資料庫中...');
    dom.setDisabled('refreshDatabasesBtn', true);

    try {
      const databases = await notionApi.loadDatabasesForParent(token, parentPageId);
      
      console.log('📊 [Popup] 載入到的資料庫:', databases.length, '個');
      
      if (databases.length > 0) {
        // 顯示資料庫選擇區塊
        dom.show('databaseSelectionGroup');
        notionApi.updateDatabaseSelect(databases);
        statusManager.showSuccess(`找到 ${databases.length} 個相容的資料庫`);
        
        // 儲存資料庫列表到應用狀態和快取
        AppState.config.notion.databases = databases;
        
        // 快取資料庫列表到 storage，關聯到父頁面
        const cacheKey = `cachedDatabases_${parentPageId}`;
        await configManager.save({ 
          [cacheKey]: databases,
          lastDatabaseCacheTime: new Date().toISOString()
        });
        console.log('💾 [Popup] 資料庫列表已快取到 storage');
      } else {
        dom.show('databaseSelectionGroup');
        notionApi.updateDatabaseSelect([]);
        statusManager.showInfo('該頁面下沒有找到相容的資料庫，建議創建新資料庫');
        
        // 也要快取空結果
        const cacheKey = `cachedDatabases_${parentPageId}`;
        await configManager.save({ 
          [cacheKey]: [],
          lastDatabaseCacheTime: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error('❌ [Popup] 載入資料庫失敗:', error);
      statusManager.showError(`載入資料庫失敗: ${error.message}`);
      dom.hide('databaseSelectionGroup');
    } finally {
      dom.setDisabled('refreshDatabasesBtn', false);
      setTimeout(() => statusManager.hide(), 3000);
    }
  },

  loadCachedDatabases: async (parentPageId) => {
    try {
      const cacheKey = `cachedDatabases_${parentPageId}`;
      const result = await configManager.load([cacheKey]);
      
      if (result.success && result.data[cacheKey]) {
        const cachedDatabases = result.data[cacheKey];
        console.log('📦 [Popup] 使用快取的資料庫:', cachedDatabases.length, '個');
        
        // 更新應用狀態和 UI
        AppState.config.notion.databases = cachedDatabases;
        
        if (cachedDatabases.length > 0) {
          dom.show('databaseSelectionGroup');
          notionApi.updateDatabaseSelect(cachedDatabases);
        } else {
          dom.show('databaseSelectionGroup');
          notionApi.updateDatabaseSelect([]);
        }
        
        return cachedDatabases;
      } else {
        console.log('📦 [Popup] 沒有找到快取的資料庫');
        return null;
      }
    } catch (error) {
      console.error('❌ [Popup] 載入快取資料庫失敗:', error);
      return null;
    }
  }
};

// === AI Provider Management ===

const aiProviders = {
  fetchOpenAIModels: async (apiKey) => {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    
    if (!response.ok) throw new Error('無法載入 OpenAI 模型');
    
    const data = await response.json();
    return data.data
      .filter(model => model.id.includes('gpt'))
      .map(model => ({ id: model.id, name: model.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  fetchOpenRouterModels: async (apiKey) => {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': chrome.runtime.getURL(''),
        'X-Title': 'Universal Job Scraper'
      }
    });
    
    if (!response.ok) throw new Error('無法載入 OpenRouter 模型');
    
    const data = await response.json();
    return data.data
      .map(model => ({ id: model.id, name: `${model.name} (${model.id})` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  updateModelSelect: (models) => {
    const select = dom.get('aiModel');
    if (!select) return;

    select.innerHTML = '<option value="">選擇模型...</option>';
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      select.appendChild(option);
    });
  },

  loadProviderConfig: (provider) => {
    const config = AppState.config.ai.configs[provider] || {};
    dom.set('aiApiKey', config.apiKey || '');
    dom.set('aiModel', config.selectedModel || '');
    
    if (config.models) {
      aiProviders.updateModelSelect(config.models);
    }
  },

  onProviderChange: () => {
    const provider = dom.get('aiProvider')?.value;
    if (provider) {
      AppState.config.ai.provider = provider;
      aiProviders.loadProviderConfig(provider);
    }
  }
};

// === UI Management ===

const ui = {
  toggleSection: (sectionId, toggleId) => {
    const section = dom.get(sectionId);
    const toggle = dom.get(toggleId);
    
    if (!section || !toggle) {
      console.error('Toggle elements not found:', { sectionId, toggleId });
      return;
    }
    
    // 檢查當前狀態 - 使用 CSS 類別而非 display 屬性
    const isCurrentlyActive = section.classList.contains('active');
    
    // 切換 CSS 類別
    if (isCurrentlyActive) {
      section.classList.remove('active');
      toggle.classList.remove('active');
    } else {
      section.classList.add('active');
      toggle.classList.add('active');
    }
    
    // 更新箭頭圖標
    const toggleIcon = toggle.querySelector('.toggle-icon');
    if (toggleIcon) {
      toggleIcon.textContent = isCurrentlyActive ? '▶' : '▼';
    }
    
    // 更新應用狀態
    const sectionKey = sectionId.replace('Config', '');
    AppState.config.ui.sections[sectionKey] = !isCurrentlyActive;
    
    console.log(`Toggled ${sectionId}: ${isCurrentlyActive ? 'hidden' : 'shown'}`);
  },

  updateLanguageToggleTooltip: (language = AppState.config.ui.language) => {
    const toggleBtn = dom.get('languageToggle');
    if (toggleBtn) {
      const tooltip = language === 'zh_TW' ? 'Switch to English' : '切換到中文';
      toggleBtn.title = tooltip;
    }
  },

  updateAIConfigVisibility: () => {
    const enableAI = dom.get('enableAI')?.checked;
    const aiConfigArea = dom.get('aiConfigArea');
    if (aiConfigArea) {
      aiConfigArea.style.display = enableAI ? 'block' : 'none';
    }
    console.log('AI 配置區域顯示狀態:', enableAI ? '顯示' : '隱藏');
  },

  showPreview: (data) => {
    const previewEl = dom.get('preview');
    if (!previewEl) return;

    const html = `
      <div class="preview-content">
        <h3>📋 職缺資料預覽</h3>
        <p><strong>職位:</strong> ${data.title || 'Unknown'}</p>
        <p><strong>公司:</strong> ${data.company || 'Unknown'}</p>
        <p><strong>地點:</strong> ${data.location || 'Unknown'}</p>
        <p><strong>薪資:</strong> ${data.salary || 'Not provided'}</p>
        <p><strong>描述:</strong> ${utils.truncateText(data.description || 'No description', 200)}...</p>
      </div>
    `;
    
    dom.setHTML('preview', html);
    dom.show('preview');
  },

  addDebugButton: () => {
    if (!utils.isDevelopmentMode()) return;

    const debugBtn = document.createElement('button');
    debugBtn.textContent = '🔍 調試頁面元素';
    debugBtn.className = 'btn';
    debugBtn.style.cssText = 'background: #059669; font-size: 12px; padding: 8px; margin-bottom: 10px;';
    debugBtn.addEventListener('click', ui.debugPageElements);
    
    const divider = document.querySelector('.divider');
    if (divider?.parentNode) {
      divider.parentNode.insertBefore(debugBtn, divider);
    }
  },

  debugPageElements: async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { action: 'debugElements' });
    } catch (error) {
      statusManager.showError(`調試失敗: ${error.message}`);
    }
  },

  initializeSectionStates: () => {
    // 設定初始狀態 - 兩個區塊都預設隱藏
    const notionConfig = dom.get('notionConfig');
    const notionToggle = dom.get('notionToggle');
    const aiConfig = dom.get('aiConfig');
    const aiToggle = dom.get('aiToggle');
    
    // Notion 區塊預設隱藏
    if (notionConfig && notionToggle) {
      notionConfig.classList.remove('active');
      notionToggle.classList.remove('active');
      AppState.config.ui.sections.notion = false;
    }
    
    // AI 區塊預設隱藏
    if (aiConfig && aiToggle) {
      aiConfig.classList.remove('active');
      aiToggle.classList.remove('active');
      AppState.config.ui.sections.ai = false;
    }

    // 更新箭頭圖標 - 都設為隱藏狀態
    const notionToggleIcon = notionToggle?.querySelector('.toggle-icon');
    const aiToggleIcon = aiToggle?.querySelector('.toggle-icon');
    
    if (notionToggleIcon) {
      notionToggleIcon.textContent = '▶'; // 隱藏狀態
    }
    
    if (aiToggleIcon) {
      aiToggleIcon.textContent = '▶'; // 隱藏狀態
    }

    console.log('初始化區塊狀態完成 - 兩個區塊都預設隱藏');
  }
};

// === Event Binding ===

const bindEvents = () => {
  console.log('開始綁定事件...');
  
  // 先檢查 eventHandlers 是否完整定義
  console.log('eventHandlers 檢查:', {
    loadNotionPages: typeof eventHandlers.loadNotionPages,
    createDatabase: typeof eventHandlers.createDatabase,
    saveConfig: typeof eventHandlers.saveConfig
  });
  
  const eventMap = {
    'saveConfig': eventHandlers.saveConfig,
    'saveAiConfig': eventHandlers.saveAiConfig,
    'loadModels': eventHandlers.loadModels,
    'previewBtn': eventHandlers.previewData,
    'scrapeBtn': eventHandlers.scrapeAndSave,
    'languageToggle': eventHandlers.toggleLanguage,
    'refreshPagesBtn': eventHandlers.loadNotionPages,
    'loadPagesBtn': eventHandlers.loadNotionPages,
    'refreshDatabasesBtn': () => {
      const selectedPageId = dom.get('parentPageSelect')?.value;
      if (selectedPageId) {
        eventHandlers.loadDatabasesForParent(selectedPageId);
      }
    },
    'createDbBtn': eventHandlers.createDatabase,
    'getTokenBtn': () => chrome.tabs.create({ url: 'https://www.notion.so/my-integrations' }),
    'getDatabaseIdBtn': () => chrome.tabs.create({ url: 'https://developers.notion.com/docs/working-with-databases#adding-pages-to-a-database' })
  };

  Object.entries(eventMap).forEach(([id, handler]) => {
    const element = dom.get(id);
    if (element) {
      console.log(`✅ 綁定事件成功: ${id}`);
      element.addEventListener('click', handler);
    } else {
      console.error(`❌ 找不到元素: ${id}`);
    }
    
    // 特別檢查 refreshPagesBtn
    if (id === 'refreshPagesBtn') {
      console.log(`🔍 refreshPagesBtn 詳細檢查:`, {
        element: element,
        handler: handler,
        handlerType: typeof handler,
        handlerName: handler?.name || 'anonymous'
      });
    }
  });

  // Special event handlers
  const aiProviderEl = dom.get('aiProvider');
  if (aiProviderEl) aiProviderEl.addEventListener('change', aiProviders.onProviderChange);

  const enableAIEl = dom.get('enableAI');
  if (enableAIEl) {
    enableAIEl.addEventListener('change', async () => {
      // 即時更新 AppState 中的 AI 開關狀態
      AppState.config.ai.enabled = enableAIEl.checked;
      ui.updateAIConfigVisibility();
      
      // 自動保存到 storage
      const result = await configManager.save({ enableAI: enableAIEl.checked });
      
      if (result.success) {
        console.log('AI 開關狀態已自動保存:', enableAIEl.checked);
      } else {
        console.error('AI 開關狀態保存失敗:', result.error);
      }
    });
  }

  // Toggle sections
  const notionToggle = dom.get('notionToggle');
  if (notionToggle) {
    notionToggle.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Notion toggle clicked');
      ui.toggleSection('notionConfig', 'notionToggle');
    });
    console.log('Notion toggle event bound');
  } else {
    console.error('notionToggle element not found');
  }

  const aiToggle = dom.get('aiToggle');
  if (aiToggle) {
    aiToggle.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('AI toggle clicked');
      ui.toggleSection('aiConfig', 'aiToggle');
    });
    console.log('AI toggle event bound');
  } else {
    console.error('aiToggle element not found');
  }

  // 添加 Enter 鍵支援觸發載入頁面
  const notionTokenInput = dom.get('notionToken');
  if (notionTokenInput) {
    console.log('✅ 綁定 notionToken Enter 鍵事件');
    notionTokenInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        console.log('⌨️ Enter 鍵觸發載入頁面');
        eventHandlers.loadNotionPages();
      }
    });
  } else {
    console.error('❌ notionToken 輸入框未找到');
  }

  // 監聽父頁面選擇變更
  const parentPageSelect = dom.get('parentPageSelect');
  if (parentPageSelect) {
    console.log('✅ 綁定 parentPageSelect 變更事件');
    parentPageSelect.addEventListener('change', async (e) => {
      const selectedPageId = e.target.value;
      console.log('📌 [Popup] 父頁面選擇變更:', selectedPageId ? selectedPageId.substring(0, 8) + '...' : '未選擇');
      
      // 只更新暫時狀態，不自動儲存
      AppState.tempSelections.parentPageId = selectedPageId;
      console.log('🔄 [Popup] 暫時儲存父頁面選擇（未持久化）');
      
      // 載入該父頁面下的資料庫
      if (selectedPageId) {
        try {
          // 先嘗試載入快取的資料庫，提高回應速度
          const cachedDatabases = await eventHandlers.loadCachedDatabases(selectedPageId);
          
          if (cachedDatabases && cachedDatabases.length > 0) {
            console.log('📦 [Popup] 使用快取的資料庫，提升載入速度');
            // 快取存在，在背景更新但不等待
            eventHandlers.loadDatabasesForParent(selectedPageId).catch(error => {
              console.warn('⚠️ [Popup] 背景更新資料庫失敗:', error);
            });
          } else {
            // 沒有快取，正常載入
            await eventHandlers.loadDatabasesForParent(selectedPageId);
          }
        } catch (error) {
          console.error('❌ [Popup] 載入資料庫失敗:', error);
          statusManager.showError('載入資料庫失敗，請稍後重試');
        }
      } else {
        // 隱藏資料庫選擇區塊
        dom.hide('databaseSelectionGroup');
        notionApi.updateDatabaseSelect([]);
      }
    });
  } else {
    console.error('❌ parentPageSelect 下拉選單未找到');
  }

  // 監聽資料庫選擇變更
  const databaseSelect = dom.get('databaseSelect');
  if (databaseSelect) {
    console.log('✅ 綁定 databaseSelect 變更事件');
    databaseSelect.addEventListener('change', async (e) => {
      const selectedDatabaseId = e.target.value;
      console.log('📊 [Popup] 資料庫選擇變更:', selectedDatabaseId ? selectedDatabaseId.substring(0, 8) + '...' : '未選擇');
      
      if (selectedDatabaseId) {
        // 找到選擇的資料庫物件
        const selectedDatabase = AppState.config.notion.databases?.find(db => db.id === selectedDatabaseId);
        
        if (selectedDatabase) {
          // 自動填入 Database ID
          dom.set('databaseId', selectedDatabaseId);
          
          // 顯示資料庫名稱和相容性資訊
          notionApi.showDatabaseName(selectedDatabase.title);
          notionApi.showDatabaseCompatibilityInfo(selectedDatabase);
          
          // 只更新暫時狀態，不自動儲存
          AppState.tempSelections.databaseId = selectedDatabaseId;
          AppState.tempSelections.databaseName = selectedDatabase.title;
          
          console.log('🔄 [Popup] 暫時儲存資料庫選擇（未持久化）');
        }
      } else {
        // 清除選擇
        dom.set('databaseId', '');
        notionApi.showDatabaseName('');
        dom.hide('databaseCompatibilityInfo');
        
        // 清除暫時狀態
        AppState.tempSelections.databaseId = '';
        AppState.tempSelections.databaseName = '';
      }
    });
  } else {
    console.error('❌ databaseSelect 下拉選單未找到');
  }

  console.log('✅ 所有事件綁定完成');
};

// === Initialization ===

const initializeDatabaseSelection = async (parentPageId, targetDatabaseId, token) => {
  try {
    console.log('🔧 [Popup] 開始初始化資料庫選擇...');
    
    // 首先嘗試載入快取的資料庫
    let databases = await eventHandlers.loadCachedDatabases(parentPageId);
    
    // 如果沒有快取或快取為空，則從 API 載入
    if (!databases || databases.length === 0) {
      console.log('📡 [Popup] 快取無效，從 API 載入資料庫...');
      try {
        databases = await notionApi.loadDatabasesForParent(token, parentPageId);
        // 更新應用狀態
        AppState.config.notion.databases = databases;
        
        if (databases.length > 0) {
          dom.show('databaseSelectionGroup');
          notionApi.updateDatabaseSelect(databases);
          
          // 快取結果
          const cacheKey = `cachedDatabases_${parentPageId}`;
          await configManager.save({ 
            [cacheKey]: databases,
            lastDatabaseCacheTime: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('❌ [Popup] 無法從 API 載入資料庫:', error);
        // 如果 API 失敗，至少顯示資料庫選擇區塊讓用戶知道有這個功能
        dom.show('databaseSelectionGroup');
        notionApi.updateDatabaseSelect([]);
        return; // 如果 API 也失敗，就放棄恢復
      }
    }
    
    // 恢復資料庫選擇
    if (databases && databases.length > 0) {
      const targetDatabase = databases.find(db => db.id === targetDatabaseId);
      if (targetDatabase) {
        console.log('🎯 [Popup] 找到目標資料庫，恢復選擇');
        dom.set('databaseSelect', targetDatabaseId);
        notionApi.showDatabaseCompatibilityInfo(targetDatabase);
        console.log('✅ [Popup] 資料庫選擇恢復成功');
      } else {
        console.log('⚠️ [Popup] 目標資料庫不在列表中，可能已被刪除');
        // 清除無效的選擇
        dom.set('databaseId', '');
        notionApi.showDatabaseName('');
      }
    }
    
  } catch (error) {
    console.error('❌ [Popup] 初始化資料庫選擇失敗:', error);
  }
};

const initializeApp = async () => {
  console.log('Initializing Universal Job Scraper popup (Functional)...');

  // Load configuration
  const configResult = await configManager.load([
    'notionToken', 'databaseId', 'databaseName', 'aiProvider', 'aiConfigs', 'enableAI', 'preferredLanguage', 'selectedParentPageId', 'cachedNotionPages'
  ]);

  if (configResult.success) {
    const config = configResult.data;
    
    // Update app state
    AppState.config.notion.token = config.notionToken || '';
    AppState.config.notion.databaseId = config.databaseId || '';
    AppState.config.ai.provider = config.aiProvider || 'openai';
    AppState.config.ai.configs = config.aiConfigs || {};
    AppState.config.ai.enabled = config.enableAI || false;
    AppState.config.ui.language = config.preferredLanguage || utils.getBrowserLanguage();

    // Update UI
    dom.set('notionToken', AppState.config.notion.token);
    dom.set('databaseId', AppState.config.notion.databaseId);
    dom.set('aiProvider', AppState.config.ai.provider);
    dom.setChecked('enableAI', AppState.config.ai.enabled);
    
    // Restore database name display
    if (config.databaseName && config.databaseId) {
      notionApi.showDatabaseName(config.databaseName);
    }
    
    // 初始化暫時狀態為已儲存的狀態
    AppState.tempSelections.parentPageId = config.selectedParentPageId || '';
    AppState.tempSelections.databaseId = config.databaseId || '';
    AppState.tempSelections.databaseName = config.databaseName || '';
    
    aiProviders.loadProviderConfig(AppState.config.ai.provider);

    // Restore cached pages and selected parent page
    if (config.cachedNotionPages && Array.isArray(config.cachedNotionPages) && config.cachedNotionPages.length > 0) {
      console.log('🔄 [Popup] 恢復快取的頁面:', config.cachedNotionPages.length, '個頁面');
      AppState.config.notion.pages = config.cachedNotionPages;
      notionApi.updatePageSelect(config.cachedNotionPages, false); // 初始化時不自動載入資料庫
      
      // Restore selected parent page and databases (只恢復已儲存的狀態)
      if (config.selectedParentPageId) {
        console.log('📌 [Popup] 恢復已儲存的父頁面:', config.selectedParentPageId.substring(0, 8) + '...');
        dom.set('parentPageSelect', config.selectedParentPageId);
        
        // 如果有父頁面且有資料庫 ID，恢復資料庫選擇
        if (config.databaseId && config.notionToken) {
          console.log('🔄 [Popup] 恢復已儲存的資料庫選擇');
          
          // 使用非同步函數來確保順序執行
          initializeDatabaseSelection(config.selectedParentPageId, config.databaseId, config.notionToken);
        }
      } else {
        console.log('ℹ️ [Popup] 沒有已儲存的父頁面選擇');
      }
    } else {
      console.log('ℹ️ [Popup] 沒有快取的頁面數據');
    }

  }

  // Initialize UI
  i18n.updateAllElements();
  ui.updateLanguageToggleTooltip();
  ui.updateAIConfigVisibility();
  ui.initializeSectionStates();
  ui.addDebugButton();

  // Bind events
  bindEvents();

  console.log('✅ Popup initialization complete');
};

// === Entry Point ===

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}