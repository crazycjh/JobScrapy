// popup.js - Functional Programming Refactor
Logger.info('Popup script loaded (Functional)');

// Import OAuth module
try {
  if (typeof NotionOAuth === 'undefined') {
    // OAuth module will be loaded via script tag in popup.html
    Logger.debug('⏳ Waiting for NotionOAuth module to load...');
  } else {
    Logger.debug('✅ NotionOAuth module available');
  }
} catch (error) {
  Logger.error('❌ OAuth module load error:', error);
}

// === Core Data Structures ===

const AppState = {
  config: {
    notion: { token: '', databaseId: '', pages: [], databases: [] },
    ai: { provider: 'openai', enabled: false, configs: {} },
    ui: { language: 'zh_TW', sections: { notion: false, ai: false } },
    oauth: { isAuthorized: false, authMethod: 'manual', workspaceInfo: null }
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
      Logger.error('Config load error:', error);
      return { success: false, error: error.message };
    }
  },

  save: async (data) => {
    try {
      await chrome.storage.sync.set(data);
      return { success: true };
    } catch (error) {
      Logger.error('Config save error:', error);
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

// === OAuth Management ===

const oauthManager = {
  /**
   * 檢查 OAuth 授權狀態
   */
  checkAuthStatus: async () => {
    try {
      if (typeof NotionOAuth === 'undefined') {
        Logger.warn('⚠️ NotionOAuth module not loaded yet');
        return { isAuthorized: false, authMethod: 'manual' };
      }

      const isOAuthAuthorized = await NotionOAuth.isOAuthAuthorized();
      const isAuthorized = await NotionOAuth.isAuthorized();
      const authMethod = await NotionOAuth.getAuthMethod();

      Logger.debug('🔍 OAuth 狀態檢查:', {
        isOAuthAuthorized,
        isAuthorized,
        authMethod
      });

      let workspaceInfo = null;
      if (isOAuthAuthorized) {
        const tokenData = await NotionOAuth.getStoredToken();
        if (tokenData) {
          workspaceInfo = {
            name: tokenData.workspaceName || 'Notion Workspace',
            icon: tokenData.workspaceIcon,
            id: tokenData.workspaceId
          };
        }
      }

      return {
        isAuthorized,
        isOAuthAuthorized,
        authMethod: authMethod || 'manual',
        workspaceInfo
      };
    } catch (error) {
      Logger.error('❌ 檢查授權狀態失敗:', error);
      return { isAuthorized: false, authMethod: 'manual' };
    }
  },

  /**
   * 開始 OAuth 授權流程
   */
  startOAuthFlow: async () => {
    try {
      Logger.info('🚀 [Popup] 開始 OAuth 授權流程');
      Logger.debug('🔍 [Debug] AppState:', JSON.stringify(AppState.config, null, 2));
      
      // 顯示授權中狀態
      oauthUI.showAuthorizingState();

      // 混合架構：popup 負責 OAuth 授權，background 負責後續處理
      
      // 步驟 1: 獲取 OAuth 配置
      Logger.debug('📡 [Popup] 步驟1: 向 background 請求 OAuth 配置');
      statusManager.showInfo('正在準備 OAuth 配置...');
      
      let configResponse;
      try {
        configResponse = await chrome.runtime.sendMessage({
          action: 'startOAuthFlow'
        });
        Logger.debug('📋 [Popup] 配置回應:', configResponse);
      } catch (msgError) {
        Logger.error('❌ [Popup] 消息發送失敗:', msgError);
        throw new Error(`消息傳遞失敗: ${msgError.message}`);
      }

      if (!configResponse || !configResponse.success) {
        Logger.error('❌ [Popup] 配置獲取失敗:', configResponse);
        throw new Error(configResponse?.error || 'OAuth 配置獲取失敗');
      }

      // 步驟 2: 在 popup 中執行 OAuth 授權（需要用戶交互）
      Logger.debug('🔐 [Popup] 步驟2: 檢查 NotionOAuth 模組');
      if (typeof NotionOAuth === 'undefined') {
        Logger.error('❌ [Popup] NotionOAuth 模組不可用');
        throw new Error('NotionOAuth module is not available');
      }
      
      Logger.debug('✅ [Popup] NotionOAuth 模組可用，開始授權');
      statusManager.showInfo('正在打開 Notion 授權頁面...');
      
      let tokenData;
      try {
        tokenData = await NotionOAuth.authorize();
        Logger.info('🎉 [Popup] OAuth 授權完成，token 資料:', {
          hasAccessToken: !!tokenData?.accessToken,
          workspaceName: tokenData?.workspaceName,
          workspaceId: tokenData?.workspaceId
        });
      } catch (authError) {
        Logger.error('❌ [Popup] OAuth 授權失敗:', authError);
        throw new Error(`OAuth 授權失敗: ${authError.message}`);
      }
      
      if (!tokenData || !tokenData.accessToken) {
        Logger.error('❌ [Popup] 無效的 token 資料:', tokenData);
        throw new Error('授權失敗，未取得有效 token');
      }

      Logger.debug('✅ [Popup] OAuth 授權成功，發送給 background 處理');
      
      // 顯示設定中狀態
      oauthUI.showSettingUpState();
      statusManager.showInfo('正在自動設定資料庫...');

      // 步驟 3: 發送 token 給 background 處理後續流程
      Logger.debug('📤 [Popup] 步驟3: 發送 token 給 background 處理');
      
      let processResponse;
      try {
        processResponse = await chrome.runtime.sendMessage({
          action: 'processOAuthToken',
          tokenData: tokenData
        });
        Logger.debug('📥 [Popup] Background 處理回應:', processResponse);
      } catch (processError) {
        Logger.error('❌ [Popup] Token 處理請求失敗:', processError);
        throw new Error(`Token 處理請求失敗: ${processError.message}`);
      }

      if (processResponse && processResponse.success) {
        Logger.debug('✅ [Popup] 後續處理完成:', processResponse.data);
        
        const { setupResult } = processResponse.data;
        Logger.debug('🔧 [Popup] 設定結果:', setupResult);
        
        // 更新應用狀態
        AppState.config.oauth.isAuthorized = true;
        AppState.config.oauth.authMethod = 'oauth';
        AppState.config.oauth.workspaceInfo = {
          name: tokenData.workspaceName || 'Notion Workspace',
          icon: tokenData.workspaceIcon,
          id: tokenData.workspaceId
        };

        // 根據設定結果顯示適當的狀態
        if (setupResult && setupResult.mode === 'user-select') {
          Logger.debug('📊 [Popup] 跳轉到 Notion 設定 - 選擇資料庫');
          await ui.jumpToNotionConfig('select-database', { databases: setupResult.databases });
        } else if (setupResult && setupResult.mode === 'auto-created') {
          Logger.debug('🗄️ [Popup] 跳轉到 Notion 設定 - 新建資料庫');
          await ui.jumpToNotionConfig('new-database', setupResult.database);
        } else {
          Logger.warn('🤷 [Popup] 未知的設定結果模式:', setupResult?.mode);
        }

        // 清除中斷連接標記（如果存在）
        await configManager.save({ oauthDisconnected: null });
        
        // 顯示完成狀態
        oauthUI.showAuthorizedState(AppState.config.oauth.workspaceInfo);
        statusManager.showSuccess('🎉 Notion 連接成功！');

        return tokenData;
      } else {
        Logger.error('❌ [Popup] Background 處理失敗:', processResponse);
        throw new Error(processResponse?.error || '後續處理失敗');
      }

    } catch (error) {
      Logger.error('❌ [Popup] OAuth 流程失敗:', error);
      Logger.debug('❌ [Popup] 錯誤堆棧:', error.stack);
      
      oauthUI.showNotAuthorizedState();
      
      if (error.message.includes('用戶取消')) {
        statusManager.showInfo('授權已取消');
      } else {
        statusManager.showError(`連接失敗: ${error.message}`);
      }
      
      throw error;
    }
  },

  /**
   * 自動設定工作流程
   */
  autoSetupWorkflow: async (accessToken) => {
    try {
      Logger.info('🔧 開始自動設定工作流程');

      // 載入授權的頁面
      const pages = await notionApi.loadPages(accessToken);
      if (pages.length === 0) {
        throw new Error('沒有找到可用的頁面');
      }

      // 智慧選擇父頁面（優先選擇 workspace 根頁面）
      const parentPage = oauthManager.selectBestParentPage(pages);
      Logger.info('📌 自動選擇父頁面:', parentPage.title);

      // 嘗試找到相容的資料庫
      const databases = await notionApi.loadDatabasesForParent(accessToken, parentPage.id);
      let targetDatabase = null;

      if (databases.length > 0) {
        Logger.info('📊 找到', databases.length, '個資料庫，跳轉到 Notion 設定讓用戶選擇');
        
        // 儲存基本配置（不包含資料庫 ID）
        await configManager.save({
          notionToken: accessToken,
          selectedParentPageId: parentPage.id,
          autoSetupCompleted: true,
          autoSetupTime: new Date().toISOString()
        });

        // 更新應用狀態
        AppState.config.notion.token = accessToken;
        AppState.tempSelections.parentPageId = parentPage.id;

        // 跳轉到 Notion 設定讓用戶選擇資料庫
        await ui.jumpToNotionConfig('select-database', { databases });
        
        Logger.info('✅ 已跳轉到 Notion 設定，等待用戶選擇資料庫');
        return {
          parentPage,
          databases,
          mode: 'user-select'
        };
      }

      // 沒有資料庫，詢問用戶是否要建立新的
      Logger.info('❓ 需要建立新的職缺追蹤資料庫，詢問用戶意願');
      
      // 顯示確認對話框
      const userChoice = await oauthUI.showCreateDatabaseConfirmation();
      Logger.debug('👤 用戶選擇:', userChoice);
      
      targetDatabase = null;
      
      if (userChoice.action === 'auto') {
        Logger.info('✅ 用戶選擇自動建立資料庫');
        const defaultName = i18n.getMessage('oauthDatabaseNameDefault');
        const createResult = await notionApi.createDatabase(
          accessToken, 
          parentPage.id, 
          defaultName,
          AppState.config.ui.language
        );
        
        if (createResult.success) {
          targetDatabase = {
            id: createResult.databaseId,
            title: createResult.title
          };
          Logger.info('✅ 自動建立資料庫成功:', targetDatabase.title);
        } else {
          throw new Error('建立資料庫失敗');
        }
      } else if (userChoice.action === 'custom' && userChoice.customName) {
        Logger.info('✅ 用戶選擇自定義名稱建立資料庫:', userChoice.customName);
        const createResult = await notionApi.createDatabase(
          accessToken, 
          parentPage.id, 
          userChoice.customName,
          AppState.config.ui.language
        );
        
        if (createResult.success) {
          targetDatabase = {
            id: createResult.databaseId,
            title: createResult.title
          };
          Logger.info('✅ 自定義名稱建立資料庫成功:', targetDatabase.title);
        } else {
          throw new Error('建立資料庫失敗');
        }
      } else {
        Logger.info('❌ 用戶取消建立資料庫');
        throw new Error('用戶取消建立資料庫');
      }

      // 儲存配置
      await configManager.save({
        notionToken: accessToken,
        databaseId: targetDatabase.id,
        databaseName: targetDatabase.title,
        selectedParentPageId: parentPage.id,
        autoSetupCompleted: true,
        autoSetupTime: new Date().toISOString()
      });

      // 更新應用狀態
      AppState.config.notion.token = accessToken;
      AppState.config.notion.databaseId = targetDatabase.id;
      AppState.tempSelections.parentPageId = parentPage.id;
      AppState.tempSelections.databaseId = targetDatabase.id;
      AppState.tempSelections.databaseName = targetDatabase.title;

      // 跳轉到 Notion 設定區塊（新建立的資料庫）
      Logger.info('🚀 新資料庫建立完成，跳轉到 Notion 設定');
      await ui.jumpToNotionConfig('new-database', targetDatabase);

      Logger.info('✅ 自動設定完成');
      return {
        parentPage,
        database: targetDatabase
      };

    } catch (error) {
      Logger.error('❌ 自動設定失敗:', error);
      throw error;
    }
  },

  /**
   * 智慧選擇最佳父頁面
   */
  selectBestParentPage: (pages) => {
    Logger.debug('🎯 開始智慧選擇父頁面，頁面數量:', pages.length);

    // 優先級邏輯
    const priorities = [
      (pages) => pages.filter(page => page.parentType === 'workspace'), // 1. Workspace 根頁面
      (pages) => pages.filter(page => oauthManager.isJobRelatedPage(page)), // 2. 職缺相關頁面
      (pages) => pages.slice().sort((a, b) => new Date(b.lastEditedTime) - new Date(a.lastEditedTime)).slice(0, 3), // 3. 最近修改的頁面
      (pages) => pages // 4. 任何頁面
    ];

    for (const priorityFilter of priorities) {
      const filteredPages = priorityFilter(pages);
      if (filteredPages.length > 0) {
        const selectedPage = filteredPages[0];
        Logger.info('✅ 選擇頁面:', selectedPage.title, '(策略:', priorityFilter.name || '未知', ')');
        return selectedPage;
      }
    }

    // 如果都沒有，返回第一個頁面
    return pages[0] || null;
  },

  /**
   * 檢查是否為職缺相關頁面
   */
  isJobRelatedPage: (page) => {
    const jobKeywords = [
      'job', 'career', 'work', 'employment', 'hiring',
      '工作', '職缺', '求職', '職涯', '招聘', '面試'
    ];
    
    const title = (page.originalTitle || page.title || '').toLowerCase();
    return jobKeywords.some(keyword => title.includes(keyword));
  },

  /**
   * 中斷 OAuth 連接
   */
  disconnect: async () => {
    try {
      Logger.info('🔓 中斷 OAuth 連接');

      if (typeof NotionOAuth !== 'undefined') {
        await NotionOAuth.clearTokenData();
      }

      // 重置應用狀態
      AppState.config.oauth.isAuthorized = false;
      AppState.config.oauth.authMethod = 'manual';
      AppState.config.oauth.workspaceInfo = null;

      // 顯示未授權狀態
      oauthUI.showNotAuthorizedState();

      // 持久化登出狀態
      await configManager.save({
        authMethod: 'manual',
        notionOAuthToken: null, // 確保清除 OAuth token
        databaseId: null, // 中斷連接時也清除 databaseId
        databaseName: null,
        oauthDisconnected: true // 標記用戶主動中斷 OAuth 連接
      });

      statusManager.showSuccess('已中斷與 Notion 的連接');

    } catch (error) {
      Logger.error('❌ 中斷連接失敗:', error);
      statusManager.showError(`中斷連接失敗: ${error.message}`);
    }
  }
};

// === Internationalization ===

const i18n = {
  getMessage: (key, language = AppState.config.ui.language) => {
    Logger.debug(`🔍 [Debug] getMessage 調用: key=${key}, language=${language}`);
    
    // 優先使用我們的靜態訊息，這樣可以動態切換語言
    const staticMessage = i18n.getStaticMessage(key, language);
    if (staticMessage && staticMessage !== key) {
      Logger.debug(`✅ [Debug] 使用靜態訊息: ${staticMessage.substring(0, 20)}...`);
      return staticMessage;
    }
    
    // 回退到 Chrome i18n（但這不能動態切換）
    try {
      const chromeMessage = chrome.i18n.getMessage(key);
      if (chromeMessage) {
        Logger.debug(`📱 [Debug] 使用 Chrome i18n: ${chromeMessage.substring(0, 20)}...`);
        return chromeMessage;
      }
    } catch (error) {
      Logger.debug(`❌ [Debug] Chrome i18n 錯誤:`, error);
    }
    
    Logger.debug(`❌ [Debug] 找不到翻譯，返回 key: ${key}`);
    return key;
  },

  getStaticMessage: (key, language) => {
    const messages = {
      en: {
        // Basic UI
        headerTitle: 'Universal Job Scraper',
        extensionName: 'Universal Job Scraper',
        aiToggleLabel: '🤖 Enable AI Analysis',
        aiToggleHelp: 'When enabled, AI will analyze jobs and extract structured information',
        scrapeJobBtn: '🚀 Scrape Job',
        previewBtn: '👁️ Preview Data',
        
        // OAuth
        oauthConnectNotion: '🔗 Connect Your Notion Account',
        oauthSelectWorkspace: 'On the next authorization page, we recommend:',
        oauthSelectEntireWorkspace: '✅ Select "entire workspace" (most convenient)',
        oauthSelectSpecificPage: '✅ Or select a specific page where you want to store jobs',
        oauthConnectButton: '🔗 Connect Notion to Get Started',
        oauthAuthorizing: '🔄 Connecting to Notion...',
        oauthAuthorizingDescription: 'Please complete authorization in the popup Notion page',
        oauthStepConnected: '✅ Connected to Notion',
        oauthSettingUp: '⏳ Automatically setting up database...',
        oauthStepComplete: '⏳ Ready to complete',
        oauthConnected: '✅ Connected to',
        oauthDatabase: 'Database:',
        oauthAutoSelect: 'Auto-selected',
        oauthDisconnect: '🔓 Disconnect',
        oauthSelectDatabase: '📊 Select Database:',
        oauthLoadingDatabases: 'Loading databases...',
        oauthNoDatabasesFound: 'No available databases found',
        oauthCreateNewDatabase: '➕ Create New Database',
        oauthDatabaseCompatible: '✅ Fully Compatible',
        oauthDatabaseGood: '🟢 Good Compatibility',
        oauthDatabasePerfect: '🟢 Perfect Compatibility',
        oauthDatabasePartial: '⚠️ Partially Compatible',
        oauthDatabaseIncompatible: '❌ Incompatible',
        oauthCreateNewDatabaseLabel: '➕ Or Create New Database:',
        oauthDatabaseNamePlaceholder: 'Database name (optional)',
        oauthCreateNewDatabaseBtn: '➕ Create',
        oauthCreateDatabaseHelp: '💡 Default name will be used if left empty',
        oauthParentPage: 'Parent Page:',
        oauthParentPageWorkspace: 'Workspace',
        oauthParentPageSubpage: 'Subpage',
        oauthConfirmCreateDatabase: 'No compatible databases found. Would you like to create a new job tracking database?',
        oauthConfirmCreateDatabaseTitle: 'Create Database Confirmation',
        oauthConfirmYes: 'Create Database',
        oauthConfirmNo: 'Cancel',
        oauthConfirmAutoCreate: 'Auto Create',
        oauthConfirmCustomName: 'Custom Name',
        oauthDatabaseNamePrompt: 'Please enter database name:',
        oauthDatabaseNameDefault: 'Job Tracking Database',
        oauthSetupComplete: 'OAuth setup complete, continue with detailed configuration',
        oauthNewDatabaseCreated: 'New database created for you, please confirm settings',
        oauthSelectExistingDatabase: 'Please select the database you want to use below',
        
        // Configuration
        notionConfigTitle: '⚙️ Notion Configuration',
        notionTokenLabel: 'Integration Token:',
        notionTokenPlaceholder: 'secret_...',
        getTokenHelp: 'Get Integration Token',
        loadPagesBtn: '📥 Load Available Pages',
        loadPagesHelp: '💡 After entering your Token, click this button to load your Notion pages',
        parentPageLabel: 'Parent Page Selection:',
        loadPagesFirst: 'Please click "Load Available Pages" button above...',
        selectParentFirst: 'Please select a parent page first...',
        databaseSelectionLabel: '📊 Select Database:',
        selectExistingDatabase: 'Select existing database...',
        databaseCreationLabel: 'Or create new database:',
        newDatabaseNamePlaceholder: 'New database name (optional)',
        createDbBtn: 'Create Database',
        databaseIdLabel: 'Database ID:',
        databaseIdPlaceholder: 'Database ID',
        getDatabaseIdHelp: 'How to get Database ID',
        databaseNameLabel: '📊 Database:',
        saveConfigBtn: '💾 Save Configuration',
        
        // AI Configuration
        aiConfigTitle: '🤖 AI Configuration',
        aiProviderLabel: 'AI Provider:',
        aiApiKeyLabel: 'API Key:',
        aiModelLabel: 'Model:',
        aiModelPlaceholder: 'Select model...',
        loadModelsBtn: '🔄 Load Model List',
        saveAiConfigBtn: '💾 Save AI Configuration'
      },
      zh_TW: {
        // Basic UI
        headerTitle: '多平台職缺抓取工具',
        extensionName: '多平台職缺抓取工具',
        aiToggleLabel: '🤖 啟用 AI 分析',
        aiToggleHelp: '開啟後將使用 AI 分析職缺並提取結構化資訊',
        scrapeJobBtn: '🚀 抓取職缺',
        previewBtn: '👁️ 預覽資料',
        
        // OAuth
        oauthConnectNotion: '🔗 連接您的 Notion 帳號',
        oauthSelectWorkspace: '在下一步的授權頁面，建議您：',
        oauthSelectEntireWorkspace: '✅ 選擇「整個 workspace」（最方便）',
        oauthSelectSpecificPage: '✅ 或選擇您想存放職缺的特定頁面',
        oauthConnectButton: '🔗 連接 Notion 開始使用',
        oauthAuthorizing: '🔄 正在連接 Notion...',
        oauthAuthorizingDescription: '請在彈出的 Notion 頁面完成授權',
        oauthStepConnected: '✅ 已連接 Notion',
        oauthSettingUp: '⏳ 正在自動設定資料庫...',
        oauthStepComplete: '⏳ 準備完成',
        oauthConnected: '✅ 已連接到',
        oauthDatabase: '資料庫：',
        oauthAutoSelect: '自動選擇',
        oauthDisconnect: '🔓 中斷連接',
        oauthSelectDatabase: '📊 選擇資料庫：',
        oauthLoadingDatabases: '載入資料庫中...',
        oauthNoDatabasesFound: '未找到可用的資料庫',
        oauthCreateNewDatabase: '➕ 建立新資料庫',
        oauthDatabaseCompatible: '✅ 完全相容',
        oauthDatabaseGood: '🟢 相容性良好',
        oauthDatabasePerfect: '🟢 完美相容',
        oauthDatabasePartial: '⚠️ 部分相容',
        oauthDatabaseIncompatible: '❌ 不相容',
        oauthCreateNewDatabaseLabel: '➕ 或建立新資料庫：',
        oauthDatabaseNamePlaceholder: '資料庫名稱 (選填)',
        oauthCreateNewDatabaseBtn: '➕ 建立',
        oauthCreateDatabaseHelp: '💡 不填寫名稱將使用預設名稱',
        oauthParentPage: '父頁面：',
        oauthParentPageWorkspace: 'Workspace',
        oauthParentPageSubpage: '子頁面',
        oauthConfirmCreateDatabase: '尚未找到可用的資料庫，是否要建立新的職缺追蹤資料庫？',
        oauthConfirmCreateDatabaseTitle: '建立資料庫確認',
        oauthConfirmYes: '建立資料庫',
        oauthConfirmNo: '取消',
        oauthConfirmAutoCreate: '自動建立',
        oauthConfirmCustomName: '自定義名稱',
        oauthDatabaseNamePrompt: '請輸入資料庫名稱：',
        oauthDatabaseNameDefault: '職缺追蹤資料庫',
        oauthSetupComplete: 'OAuth 設定完成，繼續進行詳細設定',
        oauthNewDatabaseCreated: '已為您建立新資料庫，請確認設定',
        oauthSelectExistingDatabase: '請在下方選擇要使用的資料庫',
        
        // Configuration
        notionConfigTitle: '⚙️ Notion 設定',
        notionTokenLabel: 'Integration Token:',
        notionTokenPlaceholder: 'secret_...',
        getTokenHelp: '如何獲取 Integration Token',
        loadPagesBtn: '📥 載入可用頁面',
        loadPagesHelp: '💡 填入 Token 後，點擊此按鈕載入您的 Notion 頁面',
        parentPageLabel: '父頁面選擇:',
        loadPagesFirst: '請先點擊上方「載入可用頁面」按鈕...',
        selectParentFirst: '請先選擇父頁面...',
        databaseSelectionLabel: '📊 選擇資料庫:',
        selectExistingDatabase: '選擇現有資料庫...',
        databaseCreationLabel: '或建立新資料庫:',
        newDatabaseNamePlaceholder: '新資料庫名稱 (可選)',
        createDbBtn: '建立資料庫',
        databaseIdLabel: '資料庫 ID:',
        databaseIdPlaceholder: '資料庫 ID',
        getDatabaseIdHelp: '如何獲取 Database ID',
        databaseNameLabel: '📊 資料庫:',
        saveConfigBtn: '💾 儲存設定',
        
        // AI Configuration
        aiConfigTitle: '🤖 AI 設定',
        aiProviderLabel: 'AI 平台：',
        aiApiKeyLabel: 'API Key：',
        aiModelLabel: '模型：',
        aiModelPlaceholder: '選擇模型...',
        loadModelsBtn: '🔄 載入模型列表',
        saveAiConfigBtn: '💾 儲存 AI 設定'
      }
    };
    return messages[language]?.[key] || key;
  },

  updateAllElements: (language = AppState.config.ui.language) => {
    Logger.debug('🔄 [Debug] updateAllElements 開始執行，語言:', language);
    
    // Update elements with data-i18n attribute
    const i18nElements = document.querySelectorAll('[data-i18n]');
    Logger.debug('🔍 [Debug] 找到 data-i18n 元素數量:', i18nElements.length);
    
    i18nElements.forEach((element, index) => {
      const key = element.getAttribute('data-i18n');
      const oldText = element.textContent;
      const message = i18n.getMessage(key, language);
      
      Logger.verbose(`🔄 [Debug] 更新元素 ${index + 1}:`, {
        key: key,
        oldText: oldText.substring(0, 20) + '...',
        newMessage: message ? message.substring(0, 20) + '...' : 'null',
        element: element.tagName + '#' + element.id
      });
      
      if (message) {
        element.textContent = message;
        Logger.verbose(`✅ [Debug] 元素已更新: ${key}`);
      } else {
        Logger.verbose(`❌ [Debug] 沒有找到翻譯: ${key}`);
      }
    });

    // Update elements with data-i18n-placeholder attribute
    const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
    Logger.debug('🔍 [Debug] 找到 data-i18n-placeholder 元素數量:', placeholderElements.length);
    
    placeholderElements.forEach((element, index) => {
      const key = element.getAttribute('data-i18n-placeholder');
      const message = i18n.getMessage(key, language);
      
      Logger.verbose(`🔄 [Debug] 更新 placeholder ${index + 1}:`, {
        key: key,
        message: message,
        element: element.tagName + '#' + element.id
      });
      
      if (message) element.placeholder = message;
    });
    
    Logger.debug('✅ [Debug] updateAllElements 執行完成');
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
      Logger.debug('🚀 [Popup] notionApi.loadPages 開始執行');
      Logger.debug('📡 [Popup] 向 background 發送載入頁面請求:', { 
        action: 'loadNotionPages', 
        tokenPrefix: token.substring(0, 10) + '...',
        tokenLength: token.length
      });
      
      Logger.debug('⏳ [Popup] 等待 background 回應...');
      const response = await chrome.runtime.sendMessage({
        action: 'loadNotionPages',
        token
      });
      
      Logger.debug('📨 [Popup] 收到 background 回應:', {
        success: response?.success,
        hasData: !!response?.data,
        dataLength: response?.data?.length,
        error: response?.error
      });
      Logger.debug('📋 [Popup] 完整回應內容:', response);
      
      if (response?.success) {
        Logger.debug('✅ [Popup] 載入成功，返回頁面數據');
        return response.data || [];
      } else {
        Logger.error('❌ [Popup] background 返回錯誤:', response?.error);
        throw new Error(response?.error || 'Unknown error from background');
      }
    } catch (error) {
      Logger.error('❌ [Popup] notionApi.loadPages 發生錯誤:', error);
      Logger.error('🔍 [Popup] 錯誤詳細信息:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw error; // 重新拋出錯誤讓上層處理
    }
  },

  createDatabase: async (token, parentPageId, databaseName, language = 'zh_TW') => {
    const finalDatabaseName = databaseName || i18n.getMessage('oauthDatabaseNameDefault');
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'createNotionDatabase',
        token,
        parentPageId,
        databaseName: finalDatabaseName,
        language
      });
      return response;
    } catch (error) {
      Logger.error('Create database error:', error);
      return { success: false, error: error.message };
    }
  },

  loadDatabases: async (token) => {
    try {
      Logger.debug('🚀 [Popup] notionApi.loadDatabases 開始執行');
      const response = await chrome.runtime.sendMessage({
        action: 'loadNotionDatabases',
        token
      });
      
      if (response?.success) {
        Logger.debug('✅ [Popup] 載入資料庫成功，數量:', response.data?.length);
        return response.data || [];
      } else {
        Logger.error('❌ [Popup] 載入資料庫失敗:', response?.error);
        throw new Error(response?.error || 'Unknown error from background');
      }
    } catch (error) {
      Logger.error('❌ [Popup] notionApi.loadDatabases 發生錯誤:', error);
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
    
    Logger.debug('📋 頁面選擇器已更新:', {
      workspace: workspacePages.length,
      other: otherPages.length,
      selected: select.value
    });

    // 如果自動選擇了頁面且有 token，自動載入資料庫
    if (selectedPageId && autoLoadDatabases) {
      const token = dom.get('notionToken')?.value;
      if (token) {
        Logger.debug('🚀 [Popup] 自動選擇頁面後載入資料庫:', selectedPageId.substring(0, 8) + '...');
        // 更新暫時狀態
        AppState.tempSelections.parentPageId = selectedPageId;
        // 觸發資料庫載入（非同步執行，不等待結果）
        eventHandlers.loadDatabasesForParent(selectedPageId).catch(error => {
          Logger.warn('⚠️ [Popup] 自動載入資料庫失敗:', error);
        });
      } else {
        Logger.debug('ℹ️ [Popup] 沒有 token，跳過自動載入資料庫');
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
    Logger.debug('📊 [Popup] 顯示資料庫名稱:', databaseName);
  },

  loadDatabasesForParent: async (token, parentPageId) => {
    try {
      Logger.debug('🚀 [Popup] loadDatabasesForParent 開始執行, 父頁面:', parentPageId.substring(0, 8) + '...');
      const response = await chrome.runtime.sendMessage({
        action: 'loadNotionDatabases',
        token,
        parentPageId
      });
      
      if (response?.success) {
        Logger.debug('✅ [Popup] 載入父頁面資料庫成功，數量:', response.data?.length);
        return response.data || [];
      } else {
        Logger.error('❌ [Popup] 載入父頁面資料庫失敗:', response?.error);
        throw new Error(response?.error || 'Unknown error from background');
      }
    } catch (error) {
      Logger.error('❌ [Popup] loadDatabasesForParent 發生錯誤:', error);
      throw error;
    }
  },

  updateDatabaseSelect: (databases) => {
    const select = dom.get('databaseSelect');
    
    if (!select) return;

    select.innerHTML = '';
    
    if (databases.length === 0) {
      select.innerHTML = `<option value="">${i18n.getMessage('oauthNoDatabasesFound')}</option>`;
      dom.hide('databaseCompatibilityInfo');
      return;
    }

    select.innerHTML = `<option value="">${i18n.getMessage('selectExistingDatabase')}</option>`;
  
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

    Logger.debug('📊 [Popup] 資料庫選擇器已更新:', databases.length, '個資料庫');
  },

  showDatabaseCompatibilityInfo: (database) => {
    const infoDiv = dom.get('databaseCompatibilityInfo');
    if (!infoDiv || !database) {
      dom.hide('databaseCompatibilityInfo');
      return;
    }

    const compatibility = database.compatibility;
    const levelText = {
      perfect: i18n.getMessage('oauthDatabasePerfect'),
      good: i18n.getMessage('oauthDatabaseGood'),
      partial: i18n.getMessage('oauthDatabasePartial'),
      poor: i18n.getMessage('oauthDatabaseIncompatible')
    }[compatibility.level] || i18n.getMessage('unknown');

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
      Logger.debug('💾 [Popup] 持久化父頁面選擇:', AppState.tempSelections.parentPageId.substring(0, 8) + '...');
    }

    if (AppState.tempSelections.databaseName) {
      saveData.databaseName = AppState.tempSelections.databaseName;
      Logger.debug('💾 [Popup] 持久化資料庫名稱:', AppState.tempSelections.databaseName);
    }

    // 如果當前有快取的頁面，也一併保存
    if (AppState.config.notion.pages && AppState.config.notion.pages.length > 0) {
      saveData.cachedNotionPages = AppState.config.notion.pages;
      Logger.debug('💾 [Popup] 儲存快取頁面:', AppState.config.notion.pages.length, '個');
    }
    
    const result = await configManager.save(saveData);

    if (result.success) {
      // 更新持久狀態
      AppState.config.notion.token = token;
      AppState.config.notion.databaseId = dbId;
      
      statusManager.showSuccess(i18n.getMessage('configSaved'));
      Logger.info('✅ [Popup] 完整配置已儲存，暫時狀態已持久化');

      // 發送設定更新通知
      chrome.runtime.sendMessage({ action: 'configUpdated' }, (response) => {
        if (chrome.runtime.lastError) {
          Logger.warn('發送 configUpdated 訊息失敗:', chrome.runtime.lastError.message);
        } else {
          Logger.info('📢 設定更新通知已發送', response);
        }
      });

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
    Logger.debug('🔄 [Debug] toggleLanguage 函數被調用');
    Logger.debug('🔍 [Debug] 當前語言:', AppState.config.ui.language);
    
    const newLang = AppState.config.ui.language === 'zh_TW' ? 'en' : 'zh_TW';
    Logger.debug('🔄 [Debug] 切換到新語言:', newLang);
    
    AppState.config.ui.language = newLang;
    
    try {
      Logger.debug('💾 [Debug] 儲存語言設定...');
      await configManager.save({ preferredLanguage: newLang });
      Logger.info('✅ [Debug] 語言設定儲存成功');
      
      Logger.debug('🔄 [Debug] 更新所有元素...');
      i18n.updateAllElements(newLang);
      Logger.info('✅ [Debug] 元素更新完成');
      
      Logger.debug('🔄 [Debug] 更新按鈕提示...');
      ui.updateLanguageToggleTooltip(newLang);
      Logger.info('✅ [Debug] 按鈕提示更新完成');
      
      const langName = newLang === 'zh_TW' ? '中文' : 'English';
      Logger.debug('📢 [Debug] 顯示成功訊息:', langName);
      statusManager.showSuccess(`${i18n.getMessage('languageSwitchedTo')} ${langName}`);
      
    } catch (error) {
      Logger.error('❌ [Debug] toggleLanguage 執行錯誤:', error);
    }
  },

  previewData: async () => {
    statusManager.showInfo(i18n.getMessage('statusScrapingData'));
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!utils.isLinkedInJobPage(tab.url)) {
        statusManager.showError(i18n.getMessage('errorNotLinkedInJobPage'));
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
    Logger.info('🚀 [Popup] loadNotionPages 被調用');
    
    try {
      const tokenElement = dom.get('notionToken');
      Logger.debug('🔍 [Popup] Token 元素檢查:', {
        element: !!tokenElement,
        value: tokenElement?.value ? `${tokenElement.value.substring(0, 10)}...` : 'empty',
        valueLength: tokenElement?.value?.length
      });
      
      const token = tokenElement?.value;
      
      if (!token) {
        Logger.error('❌ [Popup] Token 為空，停止執行');
        statusManager.showError('請先填入 Notion Token');
        return;
      }

      Logger.debug('📡 [Popup] 開始載入頁面流程...');
      statusManager.showInfo('載入頁面中...');
      dom.setDisabled('refreshPagesBtn', true);

      Logger.debug('⏳ [Popup] 調用 notionApi.loadPages...');
      const pages = await notionApi.loadPages(token);
      Logger.debug('📄 [Popup] notionApi.loadPages 返回結果:', {
        isArray: Array.isArray(pages),
        length: pages?.length,
        firstPage: pages?.[0] ? {
          id: pages[0].id?.substring(0, 8) + '...',
          title: pages[0].title
        } : null
      });
      
      Logger.debug('🔄 [Popup] 更新頁面選擇器...');
      notionApi.updatePageSelect(pages);
      AppState.config.notion.pages = pages;
      
      if (pages.length > 0) {
        Logger.info(`✅ [Popup] 成功載入 ${pages.length} 個頁面`);
        statusManager.showSuccess(`載入了 ${pages.length} 個頁面`);
        
        // 快取頁面數據
        await configManager.save({ cachedNotionPages: pages });
        Logger.debug('💾 [Popup] 頁面數據已快取');
      } else {
        Logger.warn('⚠️ [Popup] 未找到任何頁面');
        statusManager.showWarning('未找到可用頁面，請確認 Token 權限');
      }
    } catch (error) {
      Logger.error('❌ [Popup] 載入頁面失敗:', error);
      Logger.error('🔍 [Popup] 錯誤詳細信息:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      statusManager.showError(`載入頁面失敗: ${error.message}`);
    } finally {
      Logger.debug('🔚 [Popup] 載入頁面流程結束，清理狀態');
      dom.setDisabled('refreshPagesBtn', false);
      statusManager.hide(); // 確保清除載入狀態
    }
  },

  createDatabase: async () => {
    const token = dom.get('notionToken')?.value;
    const parentPageId = dom.get('parentPageSelect')?.value;
    const databaseName = dom.get('newDatabaseName')?.value;

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
      
      Logger.debug('📊 [Popup] 載入到的資料庫:', databases.length, '個');
      
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
        Logger.debug('💾 [Popup] 資料庫列表已快取到 storage');
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
      Logger.error('❌ [Popup] 載入資料庫失敗:', error);
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
        Logger.debug('📦 [Popup] 使用快取的資料庫:', cachedDatabases.length, '個');
        
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
        Logger.debug('📦 [Popup] 沒有找到快取的資料庫');
        return null;
      }
    } catch (error) {
      Logger.error('❌ [Popup] 載入快取資料庫失敗:', error);
      return null;
    }
  },

  /**
   * 處理 OAuth 連接
   */
  handleOAuthConnect: async () => {
    try {
      Logger.info('🚀 [Popup] 用戶點擊 OAuth 連接');
      
      // 禁用按鈕防止重複點擊
      dom.setDisabled('connectNotionBtn', true);
      
      await oauthManager.startOAuthFlow();
      
    } catch (error) {
      Logger.error('❌ [Popup] OAuth 連接失敗:', error);
      // 如果失敗，重新啟用按鈕
      dom.setDisabled('connectNotionBtn', false);
    }
  },

  /**
   * 處理 OAuth 中斷連接
   */
  handleOAuthDisconnect: async () => {
    try {
      Logger.debug('🔓 [Popup] 用戶點擊中斷連接');
      
      // 確認對話框
      const confirmed = confirm('確定要中斷與 Notion 的連接嗎？這將清除所有授權資料。');
      if (!confirmed) {
        return;
      }
      
      await oauthManager.disconnect();
      
    } catch (error) {
      Logger.error('❌ [Popup] 中斷連接失敗:', error);
    }
  },

  /**
   * 處理 OAuth 資料庫選擇變更
   */
  handleOAuthDatabaseChange: async (event) => {
    try {
      const selectedDatabaseId = event.target.value;
      Logger.debug('📊 OAuth 資料庫選擇變更:', selectedDatabaseId ? selectedDatabaseId.substring(0, 8) + '...' : '未選擇');
      
      if (selectedDatabaseId) {
        // 找到選擇的資料庫
        const selectedOption = event.target.selectedOptions[0];
        const compatibility = selectedOption.getAttribute('data-compatibility');
        const databaseTitle = selectedOption.textContent.replace(/^[✅🟢⚠️❌📊]\s/, '');
        
        // 創建假的資料庫對象用於顯示狀態
        const database = {
          id: selectedDatabaseId,
          title: databaseTitle,
          compatibility: {
            level: compatibility || 'unknown'
          }
        };
        
        // 顯示相容性狀態
        oauthUI.showDatabaseStatus(database);
        
        // 獲取 OAuth token
        const tokenData = await NotionOAuth.getStoredToken();
        if (tokenData && tokenData.accessToken) {
          // 保存選擇到配置
          const saveResult = await configManager.save({
            notionToken: tokenData.accessToken,
            databaseId: selectedDatabaseId,
            databaseName: databaseTitle
          });
          
          if (saveResult.success) {
            // 更新應用狀態
            AppState.config.notion.token = tokenData.accessToken;
            AppState.config.notion.databaseId = selectedDatabaseId;
            
            Logger.info('✅ OAuth 資料庫選擇已保存');
            statusManager.showSuccess('資料庫選擇已更新');
          }
        }
      } else {
        // 清除選擇
        dom.hide('oauthDatabaseStatus');
      }
      
    } catch (error) {
      Logger.error('❌ OAuth 資料庫選擇處理失敗:', error);
      statusManager.showError('資料庫選擇失敗');
    }
  },

  /**
   * 處理 OAuth 建立新資料庫
   */
  handleOAuthCreateDatabase: async () => {
    try {
      Logger.debug('➕ 建立新 OAuth 資料庫');
      
      const tokenData = await NotionOAuth.getStoredToken();
      if (!tokenData || !tokenData.accessToken) {
        statusManager.showError('無法獲取授權資訊');
        return;
      }

      // 獲取用戶輸入的資料庫名稱
      const customDatabaseName = dom.get('oauthNewDatabaseName')?.value?.trim();
      Logger.debug('🏷️ 用戶輸入的資料庫名稱:', customDatabaseName || '(使用預設名稱)');

      // 獲取授權的頁面，選擇第一個作為父頁面
      const pages = await notionApi.loadPages(tokenData.accessToken);
      if (pages.length === 0) {
        statusManager.showError('沒有找到可用的頁面');
        return;
      }

      // 使用智慧選擇來決定父頁面
      const parentPage = oauthManager.selectBestParentPage(pages);
      
      // 確定最終資料庫名稱
      let finalDatabaseName;
      if (customDatabaseName) {
        finalDatabaseName = customDatabaseName;
      } else {
        // 根據語言使用預設名稱
        finalDatabaseName = AppState.config.ui.language === 'zh_TW' ? '職缺追蹤資料庫' : 'Job Tracking Database';
      }
      
      Logger.debug('📝 最終資料庫名稱:', finalDatabaseName);
      
      statusManager.showInfo('正在建立資料庫...');
      dom.setDisabled('oauthCreateDbBtn', true);

      const result = await notionApi.createDatabase(
        tokenData.accessToken,
        parentPage.id,
        finalDatabaseName,
        AppState.config.ui.language
      );

      if (result.success) {
        // 保存新資料庫配置
        await configManager.save({
          notionToken: tokenData.accessToken,
          databaseId: result.databaseId,
          databaseName: result.title,
          selectedParentPageId: parentPage.id
        });

        // 更新應用狀態
        AppState.config.notion.token = tokenData.accessToken;
        AppState.config.notion.databaseId = result.databaseId;
        AppState.tempSelections.parentPageId = parentPage.id;
        AppState.tempSelections.databaseId = result.databaseId;
        AppState.tempSelections.databaseName = result.title;

        // 清空輸入框
        dom.set('oauthNewDatabaseName', '');

        statusManager.showSuccess('✅ 資料庫建立成功！');
        
        // 重新載入資料庫列表，並自動選擇新建立的資料庫
        await oauthUI.loadOAuthDatabases();
        
        // 更新父頁面顯示（使用新選擇的父頁面）
        await oauthUI.findAndShowParentPage(parentPage.id);
        
        // 自動選擇新建立的資料庫
        setTimeout(() => {
          const select = dom.get('oauthDatabaseSelect');
          if (select) {
            select.value = result.databaseId;
            // 觸發選擇變更事件
            const event = new Event('change', { bubbles: true });
            select.dispatchEvent(event);
          }
        }, 500);
        
      } else {
        statusManager.showError(`建立資料庫失敗: ${result.error}`);
      }

    } catch (error) {
      Logger.error('❌ 建立 OAuth 資料庫失敗:', error);
      statusManager.showError(`建立資料庫失敗: ${error.message}`);
    } finally {
      dom.setDisabled('oauthCreateDbBtn', false);
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

// === OAuth UI Management ===

const oauthUI = {
  /**
   * 顯示未授權狀態
   */
  showNotAuthorizedState: () => {
    dom.hide('authorizingState');
    dom.hide('settingUpState');
    dom.hide('authorizedState');
    dom.show('notAuthorizedState');
    dom.show('oauthSection');
    Logger.debug('📱 顯示未授權狀態');
  },

  /**
   * 顯示授權中狀態
   */
  showAuthorizingState: () => {
    dom.hide('notAuthorizedState');
    dom.hide('settingUpState');
    dom.hide('authorizedState');
    dom.show('authorizingState');
    dom.show('oauthSection');
    Logger.debug('📱 顯示授權中狀態');
  },

  /**
   * 顯示設定中狀態
   */
  showSettingUpState: () => {
    dom.hide('notAuthorizedState');
    dom.hide('authorizingState');
    dom.hide('authorizedState');
    dom.show('settingUpState');
    dom.show('oauthSection');
    Logger.debug('📱 顯示設定中狀態');
  },

  /**
   * 顯示已授權狀態（簡化版）
   */
  showAuthorizedState: async (workspaceInfo = null) => {
    dom.hide('notAuthorizedState');
    dom.hide('authorizingState');
    dom.hide('settingUpState');
    dom.show('authorizedState');
    dom.show('oauthSection');

    // 更新 workspace 資訊
    if (workspaceInfo) {
      const workspaceNameEl = dom.get('workspaceName');
      const workspaceIconEl = dom.get('workspaceIcon');

      if (workspaceNameEl) {
        workspaceNameEl.textContent = workspaceInfo.name || 'Notion Workspace';
      }

      if (workspaceIconEl && workspaceInfo.icon) {
        workspaceIconEl.src = workspaceInfo.icon;
        workspaceIconEl.style.display = 'block';
      } else if (workspaceIconEl) {
        workspaceIconEl.style.display = 'none';
      }
    }

    // 隱藏複雜的資料庫選擇 UI，因為現在會跳轉到 Notion 設定
    dom.hide('oauthDatabaseSelect');
    dom.hide('oauthDatabaseStatus');
    dom.hide('oauthNoDatabases');
    dom.hide('oauthCreateDatabaseSection');

    // 顯示父頁面資訊（簡化版）
    const savedParentPageId = AppState.config.notion.selectedParentPageId || 
                             AppState.tempSelections.parentPageId ||
                             await oauthUI.getSavedParentPageId();
    
    if (savedParentPageId) {
      Logger.debug('📄 載入已保存的父頁面資訊:', savedParentPageId.substring(0, 8) + '...');
      await oauthUI.findAndShowParentPage(savedParentPageId);
    } else {
      Logger.debug('📄 沒有找到已保存的父頁面 ID');
      oauthUI.hideParentPageInfo();
    }

    // 顯示設定完成提示
    const workspaceInfoDiv = document.querySelector('.workspace-info');
    if (workspaceInfoDiv) {
      // 在 workspace-info 後面添加設定完成提示
      let setupCompleteMsg = workspaceInfoDiv.querySelector('.oauth-setup-complete');
      if (!setupCompleteMsg) {
        setupCompleteMsg = document.createElement('div');
        setupCompleteMsg.className = 'oauth-setup-complete';
        setupCompleteMsg.style.cssText = `
          margin-top: 10px;
          padding: 8px 12px;
          background: #f0f9ff;
          border: 1px solid #0ea5e9;
          border-radius: 6px;
          font-size: 14px;
          color: #0c4a6e;
          text-align: center;
        `;
        setupCompleteMsg.textContent = i18n.getMessage('oauthSetupComplete');
        workspaceInfoDiv.appendChild(setupCompleteMsg);
      }
    }

    Logger.debug('📱 顯示已授權狀態（簡化版）');
  },

  /**
   * 隱藏 OAuth 區塊
   */
  hideOAuthSection: () => {
    dom.hide('oauthSection');
    Logger.debug('📱 隱藏 OAuth 區塊');
  },

  /**
   * 更新資料庫名稱顯示
   */
  updateDatabaseName: (databaseName) => {
    const databaseNameEl = dom.get('connectedDatabaseName');
    if (databaseNameEl) {
      databaseNameEl.textContent = databaseName || '自動選擇';
    }
  },

  /**
   * 載入 OAuth 授權下的資料庫
   */
  loadOAuthDatabases: async () => {
    try {
      Logger.debug('🔄 載入 OAuth 資料庫選項...');
      
      const tokenData = await NotionOAuth.getStoredToken();
      if (!tokenData || !tokenData.accessToken) {
        Logger.warn('⚠️ 無法獲取 OAuth token');
        return;
      }

      // 獲取授權的頁面
      const pages = await notionApi.loadPages(tokenData.accessToken);
      
      // 更新應用狀態中的頁面快取，供父頁面查找使用
      AppState.config.notion.pages = pages;
      Logger.debug('📄 快取頁面列表:', pages.length, '個頁面');
      
      let allDatabases = [];

      // 從所有授權頁面載入資料庫
      for (const page of pages) {
        try {
          const databases = await notionApi.loadDatabasesForParent(tokenData.accessToken, page.id);
          allDatabases = allDatabases.concat(databases);
        } catch (error) {
          Logger.warn(`⚠️ 無法載入頁面 ${page.title} 的資料庫:`, error);
        }
      }

      // 去除重複的資料庫
      const uniqueDatabases = allDatabases.filter((db, index, self) => 
        index === self.findIndex(d => d.id === db.id)
      );

      Logger.debug('📊 找到', uniqueDatabases.length, '個資料庫');
      oauthUI.updateOAuthDatabaseSelect(uniqueDatabases);

    } catch (error) {
      Logger.error('❌ 載入 OAuth 資料庫失敗:', error);
      oauthUI.showNoDatabases();
    }
  },

  /**
   * 獲取已保存的父頁面 ID
   */
  getSavedParentPageId: async () => {
    try {
      const result = await configManager.load(['selectedParentPageId']);
      if (result.success && result.data.selectedParentPageId) {
        return result.data.selectedParentPageId;
      }
      return null;
    } catch (error) {
      Logger.warn('⚠️ 獲取已保存的父頁面 ID 失敗:', error);
      return null;
    }
  },

  /**
   * 更新 OAuth 資料庫選擇器
   */
  updateOAuthDatabaseSelect: (databases) => {
    const select = dom.get('oauthDatabaseSelect');

    if (!select) return;

    // 清空現有選項
    select.innerHTML = '';

    if (databases.length === 0) {
      oauthUI.showNoDatabases();
      return;
    }

    // 隱藏無資料庫訊息
    dom.hide('oauthNoDatabases');

    // 添加預設選項
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = i18n.getMessage('oauthSelectDatabase', AppState.config.ui.language).replace('📊 ', '');
    select.appendChild(defaultOption);

    // 添加資料庫選項
    databases.forEach(db => {
      const option = document.createElement('option');
      option.value = db.id;
      
      // 根據相容性顯示不同的圖標
      const compatibilityIcon = {
        perfect: '✅',
        good: '🟢', 
        partial: '⚠️',
        poor: '❌'
      }[db.compatibility?.level] || '📊';
      
      option.textContent = `${compatibilityIcon} ${db.title}`;
      option.setAttribute('data-compatibility', db.compatibility?.level || 'unknown');
      select.appendChild(option);
    });

    // 確保建立資料庫區塊始終顯示
    dom.show('oauthCreateDatabaseSection');

    // 如果有儲存的資料庫 ID，恢復選擇
    const savedDatabaseId = AppState.config.notion.databaseId;
    if (savedDatabaseId) {
      const targetDatabase = databases.find(db => db.id === savedDatabaseId);
      if (targetDatabase) {
        select.value = savedDatabaseId;
        oauthUI.showDatabaseStatus(targetDatabase);
      }
    }
  },

  /**
   * 顯示資料庫相容性狀態
   */
  showDatabaseStatus: (database) => {
    const statusEl = dom.get('oauthDatabaseStatus');
    if (!statusEl || !database.compatibility) return;

    const { level, missingFields } = database.compatibility;
    
    let statusClass = 'none';
    let statusText = '';

    switch (level) {
      case 'perfect':
        statusClass = 'compatible';
        statusText = i18n.getMessage('oauthDatabaseCompatible');
        break;
      case 'good':
        statusClass = 'compatible';
        statusText = i18n.getMessage('oauthDatabaseCompatible');
        break;
      case 'partial':
        statusClass = 'partial';
        statusText = i18n.getMessage('oauthDatabasePartial');
        if (missingFields && missingFields.length > 0) {
          statusText += ` (缺少: ${missingFields.join(', ')})`;
        }
        break;
      default:
        statusClass = 'none';
        statusText = i18n.getMessage('oauthDatabaseIncompatible');
    }

    statusEl.className = `database-status ${statusClass}`;
    statusEl.textContent = statusText;
    dom.show('oauthDatabaseStatus');
  },

  /**
   * 顯示沒有資料庫的狀態
   */
  showNoDatabases: () => {
    const select = dom.get('oauthDatabaseSelect');

    if (select) {
      select.innerHTML = '<option value="">' + i18n.getMessage('oauthNoDatabasesFound') + '</option>';
    }

    dom.hide('oauthDatabaseStatus');
    dom.show('oauthNoDatabases');
    
    // 建立資料庫區塊始終顯示，不需要隱藏
    Logger.debug('📋 沒有找到資料庫，但建立資料庫功能保持可用');
  },

  /**
   * 顯示父頁面資訊
   */
  showParentPageInfo: (parentPageData) => {
    if (!parentPageData) {
      oauthUI.hideParentPageInfo();
      return;
    }

    Logger.debug('📄 顯示父頁面資訊:', parentPageData);

    const parentPageNameEl = dom.get('parentPageName');
    const parentPageTypeEl = dom.get('parentPageType');
    const parentPageIconEl = document.querySelector('.parent-page-icon');

    if (parentPageNameEl) {
      // 使用 originalTitle 或 title，移除可能的前綴
      const cleanTitle = parentPageData.originalTitle || parentPageData.title || '未知頁面';
      const displayTitle = cleanTitle.replace(/^[📁📄]\s*/, '').replace(/\s*\(.*\)$/, '');
      parentPageNameEl.textContent = displayTitle;
      parentPageNameEl.title = cleanTitle; // 完整標題作為 tooltip
    }

    if (parentPageTypeEl) {
      const parentType = parentPageData.parentType;
      let typeText = '';
      let iconText = '📄';

      if (parentType === 'workspace') {
        typeText = i18n.getMessage('oauthParentPageWorkspace');
        iconText = '📁';
      } else if (parentType === 'page_id') {
        typeText = i18n.getMessage('oauthParentPageSubpage');
        iconText = '📄';
      } else {
        typeText = parentType || '';
        iconText = '📄';
      }

      parentPageTypeEl.textContent = typeText ? `(${typeText})` : '';
      
      // 更新圖標
      if (parentPageIconEl) {
        parentPageIconEl.textContent = iconText;
      }
    }

    dom.show('oauthParentPageInfo');
  },

  /**
   * 隱藏父頁面資訊
   */
  hideParentPageInfo: () => {
    dom.hide('oauthParentPageInfo');
    Logger.debug('📄 隱藏父頁面資訊');
  },

  /**
   * 根據父頁面 ID 查找並顯示父頁面資訊
   */
  findAndShowParentPage: async (parentPageId, pages = null) => {
    try {
      if (!parentPageId) {
        oauthUI.hideParentPageInfo();
        return;
      }

      Logger.debug('🔍 查找父頁面資訊:', parentPageId.substring(0, 8) + '...');

      // 如果沒有提供頁面列表，嘗試從應用狀態獲取
      let availablePages = pages;
      if (!availablePages) {
        availablePages = AppState.config.notion.pages || [];
      }

      // 從快取的頁面中查找
      const parentPage = availablePages.find(page => page.id === parentPageId);
      
      if (parentPage) {
        Logger.info('✅ 找到父頁面:', parentPage.title);
        oauthUI.showParentPageInfo(parentPage);
      } else {
        Logger.warn('⚠️ 在快取中未找到父頁面，嘗試從 OAuth token 重新載入');
        
        // 如果在快取中找不到，嘗試重新載入頁面
        const tokenData = await NotionOAuth.getStoredToken();
        if (tokenData && tokenData.accessToken) {
          const freshPages = await notionApi.loadPages(tokenData.accessToken);
          const foundPage = freshPages.find(page => page.id === parentPageId);
          
          if (foundPage) {
            Logger.info('✅ 重新載入後找到父頁面:', foundPage.title);
            oauthUI.showParentPageInfo(foundPage);
            
            // 更新應用狀態的頁面快取
            AppState.config.notion.pages = freshPages;
          } else {
            Logger.error('❌ 完全找不到父頁面，可能已被刪除');
            oauthUI.hideParentPageInfo();
          }
        } else {
          Logger.error('❌ 無法獲取 OAuth token 來重新載入頁面');
          oauthUI.hideParentPageInfo();
        }
      }

    } catch (error) {
      Logger.error('❌ 查找父頁面失敗:', error);
      oauthUI.hideParentPageInfo();
    }
  },

  /**
   * 顯示資料庫建立確認對話框（支持自動建立和自定義名稱）
   */
  showCreateDatabaseConfirmation: () => {
    return new Promise((resolve) => {
      // 建立確認對話框
      const confirmDialog = document.createElement('div');
      confirmDialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      const dialogContent = document.createElement('div');
      dialogContent.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        max-width: 350px;
        width: 320px;
        text-align: center;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      `;

      const title = document.createElement('h3');
      title.textContent = i18n.getMessage('oauthConfirmCreateDatabaseTitle');
      title.style.cssText = 'margin: 0 0 15px 0; color: #1f2937;';

      const message = document.createElement('p');
      message.textContent = i18n.getMessage('oauthConfirmCreateDatabase');
      message.style.cssText = 'margin: 0 0 20px 0; color: #6b7280; line-height: 1.5;';

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

      const autoCreateBtn = document.createElement('button');
      autoCreateBtn.textContent = i18n.getMessage('oauthConfirmAutoCreate');
      autoCreateBtn.style.cssText = `
        padding: 12px 20px;
        background: #059669;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
      `;

      const customNameBtn = document.createElement('button');
      customNameBtn.textContent = i18n.getMessage('oauthConfirmCustomName');
      customNameBtn.style.cssText = `
        padding: 12px 20px;
        background: #2563eb;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
      `;

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = i18n.getMessage('oauthConfirmNo');
      cancelBtn.style.cssText = `
        padding: 10px 20px;
        background: #6b7280;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        margin-top: 4px;
      `;

      // 事件處理
      autoCreateBtn.onclick = () => {
        document.body.removeChild(confirmDialog);
        resolve({ action: 'auto' });
      };

      customNameBtn.onclick = async () => {
        document.body.removeChild(confirmDialog);
        // 顯示自定義名稱輸入對話框
        const customResult = await oauthUI.showCustomNameDialog();
        resolve(customResult);
      };

      cancelBtn.onclick = () => {
        document.body.removeChild(confirmDialog);
        resolve({ action: 'cancel' });
      };

      // 鍵盤事件
      confirmDialog.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cancelBtn.click();
        }
      });

      // 點擊背景關閉
      confirmDialog.addEventListener('click', (e) => {
        if (e.target === confirmDialog) {
          cancelBtn.click();
        }
      });

      // 組裝對話框
      buttonContainer.appendChild(autoCreateBtn);
      buttonContainer.appendChild(customNameBtn);
      buttonContainer.appendChild(cancelBtn);
      dialogContent.appendChild(title);
      dialogContent.appendChild(message);
      dialogContent.appendChild(buttonContainer);
      confirmDialog.appendChild(dialogContent);

      // 顯示對話框
      document.body.appendChild(confirmDialog);
    });
  },

  /**
   * 顯示自定義資料庫名稱輸入對話框
   */
  showCustomNameDialog: () => {
    return new Promise((resolve) => {
      // 建立對話框
      const customDialog = document.createElement('div');
      customDialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      const dialogContent = document.createElement('div');
      dialogContent.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        max-width: 350px;
        width: 300px;
        text-align: center;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      `;

      const title = document.createElement('h3');
      title.textContent = i18n.getMessage('oauthConfirmCreateDatabaseTitle');
      title.style.cssText = 'margin: 0 0 15px 0; color: #1f2937;';

      const prompt = document.createElement('p');
      prompt.textContent = i18n.getMessage('oauthDatabaseNamePrompt');
      prompt.style.cssText = 'margin: 0 0 10px 0; color: #6b7280; text-align: left;';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = i18n.getMessage('oauthDatabaseNameDefault');
      nameInput.style.cssText = `
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 14px;
        box-sizing: border-box;
        margin-bottom: 20px;
      `;

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'display: flex; gap: 10px; justify-content: center;';

      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = i18n.getMessage('oauthConfirmYes');
      confirmBtn.style.cssText = `
        padding: 10px 20px;
        background: #059669;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
      `;

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = i18n.getMessage('oauthConfirmNo');
      cancelBtn.style.cssText = `
        padding: 10px 20px;
        background: #6b7280;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
      `;

      // 事件處理
      const handleConfirm = () => {
        const customName = nameInput.value.trim();
        if (customName) {
          document.body.removeChild(customDialog);
          resolve({ action: 'custom', customName });
        } else {
          nameInput.style.borderColor = '#ef4444';
          nameInput.focus();
        }
      };

      const handleCancel = () => {
        document.body.removeChild(customDialog);
        resolve({ action: 'cancel' });
      };

      confirmBtn.onclick = handleConfirm;
      cancelBtn.onclick = handleCancel;

      // 鍵盤事件
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleConfirm();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      });

      // 點擊背景關閉
      customDialog.addEventListener('click', (e) => {
        if (e.target === customDialog) {
          handleCancel();
        }
      });

      // 組裝對話框
      buttonContainer.appendChild(confirmBtn);
      buttonContainer.appendChild(cancelBtn);
      dialogContent.appendChild(title);
      dialogContent.appendChild(prompt);
      dialogContent.appendChild(nameInput);
      dialogContent.appendChild(buttonContainer);
      customDialog.appendChild(dialogContent);

      // 顯示對話框並聚焦輸入框
      document.body.appendChild(customDialog);
      nameInput.focus();
      nameInput.select();
    });
  }
};

// === UI Management ===

const ui = {
  toggleSection: (sectionId, toggleId) => {
    const section = dom.get(sectionId);
    const toggle = dom.get(toggleId);
    
    if (!section || !toggle) {
      Logger.error('Toggle elements not found:', { sectionId, toggleId });
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
    
    Logger.debug(`Toggled ${sectionId}: ${isCurrentlyActive ? 'hidden' : 'shown'}`);
  },

  updateLanguageToggleTooltip: (language = AppState.config.ui.language) => {
    const toggleBtn = dom.get('languageToggle');
    if (toggleBtn) {
      const tooltip = language === 'zh_TW' ? 'Switch to English' : '切換到中文';
      toggleBtn.title = tooltip;
    }
  },

  updateAIConfigVisibility: () => {
    // AI 配置區域始終保持可見，讓用戶隨時可以進行設定
    const aiConfigArea = dom.get('aiConfigArea');
    if (aiConfigArea) {
      aiConfigArea.style.display = 'block';
    }
    Logger.debug('AI 配置區域始終可見，允許用戶隨時設定');
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
    debugBtn.style.cssText = 'background: #059669; font-size: 12px; padding: 8px; margin-bottom: 5px;';
    debugBtn.addEventListener('click', ui.debugPageElements);
    
    // OAuth 調試按鈕
    const oauthDebugBtn = document.createElement('button');
    oauthDebugBtn.textContent = '🔧 測試 OAuth 通信';
    oauthDebugBtn.className = 'btn';
    oauthDebugBtn.style.cssText = 'background: #0066cc; font-size: 12px; padding: 8px; margin-bottom: 10px;';
    oauthDebugBtn.addEventListener('click', ui.debugOAuthCommunication);
    
    const divider = document.querySelector('.divider');
    if (divider?.parentNode) {
      divider.parentNode.insertBefore(debugBtn, divider);
      divider.parentNode.insertBefore(oauthDebugBtn, divider);
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

  debugOAuthCommunication: async () => {
    try {
      Logger.debug('🔧 [Debug] 開始測試 OAuth 通信');
      statusManager.showInfo('測試 Background 通信中...');

      // 測試1: Background 連接
      Logger.debug('🧪 [Debug] 測試1: Background 消息傳遞');
      const testResponse = await chrome.runtime.sendMessage({
        action: 'startOAuthFlow'
      });
      Logger.debug('📋 [Debug] Background 回應:', testResponse);
      
      if (testResponse && testResponse.success) {
        statusManager.showSuccess('✅ Background 通信正常');
        Logger.info('✅ [Debug] Background 通信測試通過');
        
        // 測試2: NotionOAuth 模組
        Logger.debug('🧪 [Debug] 測試2: NotionOAuth 模組可用性');
        if (typeof NotionOAuth !== 'undefined') {
          Logger.info('✅ [Debug] NotionOAuth 模組可用');
          Logger.debug('🔍 [Debug] NotionOAuth 方法:', Object.keys(NotionOAuth));
          statusManager.showSuccess('✅ NotionOAuth 模組正常');
        } else {
          Logger.error('❌ [Debug] NotionOAuth 模組不可用');
          statusManager.showError('❌ NotionOAuth 模組不可用');
        }
        
        // 測試3: Chrome APIs
        Logger.debug('🧪 [Debug] 測試3: Chrome APIs');
        Logger.debug('🔍 [Debug] chrome.runtime.id:', chrome.runtime.id);
        Logger.debug('🔍 [Debug] chrome.identity 可用:', !!chrome.identity);
        Logger.debug('🔍 [Debug] chrome.storage 可用:', !!chrome.storage);
        
      } else {
        Logger.error('❌ [Debug] Background 通信失敗:', testResponse);
        statusManager.showError('❌ Background 通信失敗');
      }

    } catch (error) {
      Logger.error('❌ [Debug] OAuth 通信測試失敗:', error);
      statusManager.showError('OAuth 通信測試失敗: ' + error.message);
    }
  },

  initializeSectionStates: () => {
    // 設定初始狀態 - 兩個區塊都預設隱藏
    const notionConfig = dom.get('notionConfig');
    const notionToggle = dom.get('notionToggle');
    const aiConfig = dom.get('aiConfig');
    const aiToggle = dom.get('aiToggle');
    
    Logger.debug('🔧 初始化區塊狀態...');
    
    // Notion 區塊：檢查是否已經被 jumpToNotionConfig 展開
    if (notionConfig && notionToggle) {
      const alreadyExpanded = notionConfig.classList.contains('active');
      if (!alreadyExpanded) {
        notionConfig.classList.remove('active');
        notionToggle.classList.remove('active');
        AppState.config.ui.sections.notion = false;
        
        // 更新箭頭圖標
        const notionToggleIcon = notionToggle.querySelector('.toggle-icon');
        if (notionToggleIcon) {
          notionToggleIcon.textContent = '▶'; // 隱藏狀態
        }
      } else {
        Logger.debug('📋 Notion 設定已展開，跳過初始化隱藏');
        AppState.config.ui.sections.notion = true;
      }
    }
    
    // AI 區塊預設隱藏
    if (aiConfig && aiToggle) {
      aiConfig.classList.remove('active');
      aiToggle.classList.remove('active');
      AppState.config.ui.sections.ai = false;
      
      // 更新箭頭圖標
      const aiToggleIcon = aiToggle.querySelector('.toggle-icon');
      if (aiToggleIcon) {
        aiToggleIcon.textContent = '▶'; // 隱藏狀態
      }
    }

    Logger.debug('初始化區塊狀態完成:', {
      notionExpanded: AppState.config.ui.sections.notion,
      aiExpanded: AppState.config.ui.sections.ai
    });
  },

  /**
   * 跳轉到 Notion 設定區塊
   * @param {string} mode - 模式: 'new-database', 'select-database'
   * @param {object} data - 相關資料（資料庫資訊等）
   */
  jumpToNotionConfig: async (mode = 'select-database', data = null) => {
    Logger.info('🚀 跳轉到 Notion 設定區塊:', { mode, data });
    
    try {
      // 1. 確保 Notion 設定區塊展開
      const notionConfig = dom.get('notionConfig');
      const notionToggle = dom.get('notionToggle');
      
      Logger.debug('🔧 開始展開 Notion 設定區塊:', {
        notionConfig: !!notionConfig,
        notionToggle: !!notionToggle,
        currentlyActive: notionConfig?.classList.contains('active')
      });
      
      if (notionConfig && notionToggle) {
        // 強制展開區塊
        notionConfig.classList.add('active');
        notionToggle.classList.add('active');
        AppState.config.ui.sections.notion = true;
        
        // 更新箭頭圖標
        const toggleIcon = notionToggle.querySelector('.toggle-icon');
        if (toggleIcon) {
          toggleIcon.textContent = '▼';
        }
        
        // 驗證展開狀態
        const isExpanded = notionConfig.classList.contains('active');
        Logger.debug('✅ Notion 設定區塊展開狀態:', {
          isExpanded,
          hasActiveClass: notionConfig.classList.contains('active'),
          toggleHasActiveClass: notionToggle.classList.contains('active'),
          arrowIcon: toggleIcon?.textContent
        });
        
        // 如果展開失敗，嘗試手動觸發點擊事件
        if (!isExpanded) {
          Logger.warn('⚠️ 自動展開失敗，嘗試手動觸發點擊事件');
          setTimeout(() => {
            notionToggle.click();
          }, 100);
        }
      } else {
        Logger.error('❌ 無法找到 Notion 設定元素:', {
          notionConfigExists: !!notionConfig,
          notionToggleExists: !!notionToggle
        });
      }

      // 2. 根據模式填入資料和顯示提示
      if (mode === 'new-database' && data) {
        // 新建立的資料庫：自動填入相關資訊
        dom.set('notionToken', AppState.config.notion.token);
        dom.set('databaseId', data.id);
        
        // 顯示資料庫名稱
        notionApi.showDatabaseName(data.title);
        
        // 顯示成功提示
        statusManager.showSuccess(i18n.getMessage('oauthNewDatabaseCreated'));
        
        Logger.info('✅ 已填入新建立的資料庫資訊:', data.title);
        
      } else if (mode === 'select-database') {
        // 有現有資料庫：提示用戶選擇
        dom.set('notionToken', AppState.config.notion.token);
        
        // 顯示選擇提示
        statusManager.showInfo(i18n.getMessage('oauthSelectExistingDatabase'));
        
        // 自動載入頁面和資料庫
        if (AppState.config.notion.token) {
          Logger.debug('🔄 自動載入頁面和資料庫列表...');
          await eventHandlers.loadNotionPages();
        }
        
        Logger.debug('📋 提示用戶選擇現有資料庫');
      }

      // 3. 平滑滾動到 Notion 設定區塊
      const notionToggleElement = dom.get('notionToggle');
      const notionSection = notionToggleElement?.closest('.collapsible-section');
      if (notionSection) {
        setTimeout(() => {
          notionSection.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
          });
        }, 300); // 等待展開動畫完成
      } else {
        Logger.warn('⚠️ 無法找到 Notion 設定區塊進行滾動');
      }

      // 4. 簡化 OAuth 區塊顯示
      const oauthSection = dom.get('oauthSection');
      if (oauthSection) {
        // 可以選擇隱藏或顯示簡化狀態
        // oauthUI.showSimplifiedCompletedState();
      }

      Logger.debug('🎯 跳轉到 Notion 設定完成');
      
    } catch (error) {
      Logger.error('❌ 跳轉到 Notion 設定失敗:', error);
      statusManager.showError('跳轉設定失敗');
    }
  },

  /**
   * 測試展開功能 - 用於調試
   */
  testExpandNotionConfig: () => {
    Logger.debug('🧪 開始測試 Notion 設定展開功能...');
    
    const notionConfig = dom.get('notionConfig');
    const notionToggle = dom.get('notionToggle');
    
    Logger.debug('📋 元素檢查:', {
      notionConfig: !!notionConfig,
      notionToggle: !!notionToggle,
      notionConfigClasses: notionConfig?.className,
      notionToggleClasses: notionToggle?.className
    });
    
    if (notionToggle) {
      Logger.debug('🖱️ 模擬點擊 Notion 設定按鈕...');
      notionToggle.click();
      
      setTimeout(() => {
        const isExpanded = notionConfig?.classList.contains('active');
        Logger.debug('📊 點擊後狀態:', {
          isExpanded,
          notionConfigClasses: notionConfig?.className,
          notionToggleClasses: notionToggle?.className
        });
      }, 500);
    }
  }
};

// === Event Binding ===

const bindEvents = () => {
  Logger.debug('開始綁定事件...');
  
  // 先檢查 eventHandlers 是否完整定義
  Logger.debug('eventHandlers 檢查:', {
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
    'getDatabaseIdBtn': () => chrome.tabs.create({ url: 'https://developers.notion.com/docs/working-with-databases#adding-pages-to-a-database' }),
    // OAuth 相關事件
    'connectNotionBtn': eventHandlers.handleOAuthConnect,
    'disconnectBtn': eventHandlers.handleOAuthDisconnect,
    'oauthCreateDbBtn': eventHandlers.handleOAuthCreateDatabase
  };

  Object.entries(eventMap).forEach(([id, handler]) => {
    const element = dom.get(id);
    if (element) {
      Logger.info(`✅ 綁定事件成功: ${id}`);
      element.addEventListener('click', handler);
      
      // 特別檢查語言切換按鈕
      if (id === 'languageToggle') {
        Logger.debug('🔍 [Debug] 語言切換按鈕詳細檢查:', {
          element: element,
          handler: handler,
          handlerType: typeof handler,
          handlerName: handler?.name || 'anonymous',
          isFunction: typeof handler === 'function'
        });
        
        // 測試點擊事件
        Logger.debug('🧪 [Debug] 測試語言切換按鈕點擊綁定...');
        element.addEventListener('click', () => {
          Logger.debug('🎯 [Debug] 語言切換按鈕被點擊！');
        });
      }
    } else {
      Logger.error(`❌ 找不到元素: ${id}`);
    }
    
    // 特別檢查 refreshPagesBtn
    if (id === 'refreshPagesBtn') {
      Logger.debug(`🔍 refreshPagesBtn 詳細檢查:`, {
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
        Logger.debug('AI 開關狀態已自動保存:', enableAIEl.checked);
      } else {
        Logger.error('AI 開關狀態保存失敗:', result.error);
      }
    });
  }

  // Toggle sections
  const notionToggle = dom.get('notionToggle');
  if (notionToggle) {
    notionToggle.addEventListener('click', (e) => {
      e.preventDefault();
      Logger.debug('Notion toggle clicked');
      ui.toggleSection('notionConfig', 'notionToggle');
    });
    Logger.debug('Notion toggle event bound');
  } else {
    Logger.error('notionToggle element not found');
  }

  const aiToggle = dom.get('aiToggle');
  if (aiToggle) {
    aiToggle.addEventListener('click', (e) => {
      e.preventDefault();
      Logger.debug('AI toggle clicked');
      ui.toggleSection('aiConfig', 'aiToggle');
    });
    Logger.debug('AI toggle event bound');
  } else {
    Logger.error('aiToggle element not found');
  }

  // 添加 Enter 鍵支援觸發載入頁面
  const notionTokenInput = dom.get('notionToken');
  if (notionTokenInput) {
    Logger.info('✅ 綁定 notionToken Enter 鍵事件');
    notionTokenInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        Logger.debug('⌨️ Enter 鍵觸發載入頁面');
        eventHandlers.loadNotionPages();
      }
    });
  } else {
    Logger.error('❌ notionToken 輸入框未找到');
  }

  // 監聽父頁面選擇變更
  const parentPageSelect = dom.get('parentPageSelect');
  if (parentPageSelect) {
    Logger.info('✅ 綁定 parentPageSelect 變更事件');
    parentPageSelect.addEventListener('change', async (e) => {
      const selectedPageId = e.target.value;
      Logger.debug('📌 [Popup] 父頁面選擇變更:', selectedPageId ? selectedPageId.substring(0, 8) + '...' : '未選擇');
      
      // 只更新暫時狀態，不自動儲存
      AppState.tempSelections.parentPageId = selectedPageId;
      Logger.debug('🔄 [Popup] 暫時儲存父頁面選擇（未持久化）');
      
      // 載入該父頁面下的資料庫
      if (selectedPageId) {
        try {
          // 先嘗試載入快取的資料庫，提高回應速度
          const cachedDatabases = await eventHandlers.loadCachedDatabases(selectedPageId);
          
          if (cachedDatabases && cachedDatabases.length > 0) {
            Logger.debug('📦 [Popup] 使用快取的資料庫，提升載入速度');
            // 快取存在，在背景更新但不等待
            eventHandlers.loadDatabasesForParent(selectedPageId).catch(error => {
              Logger.warn('⚠️ [Popup] 背景更新資料庫失敗:', error);
            });
          } else {
            // 沒有快取，正常載入
            await eventHandlers.loadDatabasesForParent(selectedPageId);
          }
        } catch (error) {
          Logger.error('❌ [Popup] 載入資料庫失敗:', error);
          statusManager.showError('載入資料庫失敗，請稍後重試');
        }
      } else {
        // 隱藏資料庫選擇區塊
        dom.hide('databaseSelectionGroup');
        notionApi.updateDatabaseSelect([]);
      }
    });
  } else {
    Logger.error('❌ parentPageSelect 下拉選單未找到');
  }

  // 監聽資料庫選擇變更
  const databaseSelect = dom.get('databaseSelect');
  if (databaseSelect) {
    Logger.info('✅ 綁定 databaseSelect 變更事件');
    databaseSelect.addEventListener('change', async (e) => {
      const selectedDatabaseId = e.target.value;
      Logger.debug('📊 [Popup] 資料庫選擇變更:', selectedDatabaseId ? selectedDatabaseId.substring(0, 8) + '...' : '未選擇');
      
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
          
          Logger.debug('🔄 [Popup] 暫時儲存資料庫選擇（未持久化）');
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
    Logger.error('❌ databaseSelect 下拉選單未找到');
  }

  // 監聽 OAuth 資料庫選擇變更
  const oauthDatabaseSelect = dom.get('oauthDatabaseSelect');
  if (oauthDatabaseSelect) {
    Logger.info('✅ 綁定 oauthDatabaseSelect 變更事件');
    oauthDatabaseSelect.addEventListener('change', eventHandlers.handleOAuthDatabaseChange);
  } else {
    Logger.error('❌ oauthDatabaseSelect 下拉選單未找到');
  }

  Logger.info('✅ 所有事件綁定完成');
};

// === Initialization ===

const initializeDatabaseSelection = async (parentPageId, targetDatabaseId, token) => {
  try {
    Logger.debug('🔧 [Popup] 開始初始化資料庫選擇...');
    
    // 首先嘗試載入快取的資料庫
    let databases = await eventHandlers.loadCachedDatabases(parentPageId);
    
    // 如果沒有快取或快取為空，則從 API 載入
    if (!databases || databases.length === 0) {
      Logger.debug('📡 [Popup] 快取無效，從 API 載入資料庫...');
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
        Logger.error('❌ [Popup] 無法從 API 載入資料庫:', error);
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
        Logger.debug('🎯 [Popup] 找到目標資料庫，恢復選擇');
        dom.set('databaseSelect', targetDatabaseId);
        notionApi.showDatabaseCompatibilityInfo(targetDatabase);
        Logger.info('✅ [Popup] 資料庫選擇恢復成功');
      } else {
        Logger.warn('⚠️ [Popup] 目標資料庫不在列表中，可能已被刪除');
        // 清除無效的選擇
        dom.set('databaseId', '');
        notionApi.showDatabaseName('');
      }
    }
    
  } catch (error) {
    Logger.error('❌ [Popup] 初始化資料庫選擇失敗:', error);
  }
};

const initializeApp = async () => {
  Logger.debug('Initializing Universal Job Scraper popup (Functional)...');
  
  // 暴露測試函數到全域，方便調試
  if (typeof window !== 'undefined') {
    window.testExpandNotionConfig = ui.testExpandNotionConfig;
    window.jumpToNotionConfig = ui.jumpToNotionConfig;
    Logger.debug('🧪 調試函數已暴露: window.testExpandNotionConfig(), window.jumpToNotionConfig()');
  }
  
  // 檢查語言切換按鈕是否存在
  const langToggleBtn = document.getElementById('languageToggle');
  Logger.debug('🔍 [Debug] 語言切換按鈕初始化檢查:', {
    exists: !!langToggleBtn,
    element: langToggleBtn,
    innerHTML: langToggleBtn?.innerHTML,
    className: langToggleBtn?.className
  });

  // Load configuration
  const configResult = await configManager.load([
    'notionToken', 'databaseId', 'databaseName', 'aiProvider', 'aiConfigs', 'enableAI', 'preferredLanguage', 'selectedParentPageId', 'cachedNotionPages', 'authMethod', 'lastOAuthTime', 'oauthDisconnected'
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

    // 檢查 OAuth 授權狀態
    Logger.debug('🔍 檢查 OAuth 授權狀態...');
    const authStatus = await oauthManager.checkAuthStatus();
    
    AppState.config.oauth.isAuthorized = authStatus.isAuthorized;
    AppState.config.oauth.authMethod = authStatus.authMethod;
    AppState.config.oauth.workspaceInfo = authStatus.workspaceInfo;

    Logger.debug('📊 授權狀態:', {
      isAuthorized: authStatus.isAuthorized,
      isOAuthAuthorized: authStatus.isOAuthAuthorized,
      authMethod: authStatus.authMethod,
      hasWorkspaceInfo: !!authStatus.workspaceInfo
    });

    // 根據授權狀態顯示對應的 UI
    if (authStatus.isOAuthAuthorized) {
      // 已透過 OAuth 授權
      Logger.info('✅ 使用 OAuth 授權，顯示已授權狀態');
      oauthUI.showAuthorizedState(authStatus.workspaceInfo);
      if (config.databaseName) {
        oauthUI.updateDatabaseName(config.databaseName);
      }
    } else if (authStatus.isAuthorized && authStatus.authMethod === 'manual' && !config.oauthDisconnected) {
      // 使用手動 Token 且未主動中斷 OAuth，隱藏 OAuth 區塊，顯示手動設定
      Logger.debug('ℹ️ 使用手動 Token（純手動模式），隱藏 OAuth 區塊');
      oauthUI.hideOAuthSection();
    } else {
      // 未授權或曾經使用過 OAuth，顯示 OAuth 連接選項
      Logger.debug('🔗 顯示 OAuth 連接選項');
      oauthUI.showNotAuthorizedState();
    }

    // Update UI
    dom.set('notionToken', AppState.config.notion.token);
    dom.set('databaseId', AppState.config.notion.databaseId);
    dom.set('aiProvider', AppState.config.ai.provider);
    dom.setChecked('enableAI', AppState.config.ai.enabled);
    
    // Restore database name display for manual mode
    if (config.databaseName && config.databaseId && authStatus.authMethod === 'manual') {
      notionApi.showDatabaseName(config.databaseName);
    }
    
    // 初始化暫時狀態為已儲存的狀態
    AppState.tempSelections.parentPageId = config.selectedParentPageId || '';
    AppState.tempSelections.databaseId = config.databaseId || '';
    AppState.tempSelections.databaseName = config.databaseName || '';
    
    aiProviders.loadProviderConfig(AppState.config.ai.provider);

    // Restore cached pages and selected parent page
    if (config.cachedNotionPages && Array.isArray(config.cachedNotionPages) && config.cachedNotionPages.length > 0) {
      Logger.debug('🔄 [Popup] 恢復快取的頁面:', config.cachedNotionPages.length, '個頁面');
      AppState.config.notion.pages = config.cachedNotionPages;
      notionApi.updatePageSelect(config.cachedNotionPages, false); // 初始化時不自動載入資料庫
      
      // Restore selected parent page and databases (只恢復已儲存的狀態)
      if (config.selectedParentPageId) {
        Logger.debug('📌 [Popup] 恢復已儲存的父頁面:', config.selectedParentPageId.substring(0, 8) + '...');
        dom.set('parentPageSelect', config.selectedParentPageId);
        
        // 如果有父頁面且有資料庫 ID，恢復資料庫選擇
        if (config.databaseId && config.notionToken) {
          Logger.debug('🔄 [Popup] 恢復已儲存的資料庫選擇');
          
          // 使用非同步函數來確保順序執行
          initializeDatabaseSelection(config.selectedParentPageId, config.databaseId, config.notionToken);
        }
      } else {
        Logger.debug('ℹ️ [Popup] 沒有已儲存的父頁面選擇');
      }
    } else {
      Logger.debug('ℹ️ [Popup] 沒有快取的頁面數據');
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

  Logger.info('✅ Popup initialization complete');
};

// === Entry Point ===

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
