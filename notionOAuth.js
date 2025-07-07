// notionOAuth.js - Notion OAuth 2.0 處理模組

Logger.info('Notion OAuth module loaded');

// === OAuth Configuration ===
const NotionOAuth = {
  config: {
    // 注意：這是開發測試版本，實際部署時需要將 Client Secret 移到後端
    clientId: '227d872b-594c-8021-9e85-0037be70f419',
    clientSecret: process.env.NOTION_CLIENT_SECRET || '', // 從環境變數讀取
    redirectUri: '', // 將在初始化時動態設定
    scope: 'read,write',
    responseType: 'code',
    authBaseUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token'
  },

  // === Core OAuth Functions ===

  /**
   * 初始化 OAuth 配置
   */
  init: () => {
    // 動態設定 redirect URI 為當前 extension ID
    // Chrome Extension 的正確格式，與 Notion 設定保持一致
    NotionOAuth.config.redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/oauth2`;
    Logger.debug('🔧 OAuth 配置初始化完成:', {
      clientId: NotionOAuth.config.clientId,
      redirectUri: NotionOAuth.config.redirectUri,
      extensionId: chrome.runtime.id
    });
    
    // 重要：顯示完整的設定資訊供用戶確認
    Logger.debug('⚠️  請確認 Notion Developer 設定中的 Redirect URI 為：');
    Logger.debug(`   ${NotionOAuth.config.redirectUri}`);
    Logger.debug('⚠️  目前 Extension ID：', chrome.runtime.id);
  },

  /**
   * 開始 OAuth 授權流程
   */
  authorize: async () => {
    try {
      Logger.debug('🚀 開始 Notion OAuth 授權流程');
      
      // 建立授權 URL
      const authUrl = NotionOAuth.buildAuthUrl();
      Logger.debug('📡 授權 URL:', authUrl);

      // 對於第三方 OAuth，仍然使用 chrome.identity.launchWebAuthFlow
      // 但需要確保 redirect_uri 和 Notion 設定完全一致
      const redirectUrl = await new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow({
          url: authUrl,
          interactive: true
        }, (redirectUrl) => {
          if (chrome.runtime.lastError) {
            Logger.error('❌ OAuth 錯誤:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!redirectUrl) {
            reject(new Error('用戶取消授權或授權失敗'));
          } else {
            resolve(redirectUrl);
          }
        });
      });

      Logger.debug('📨 授權回調 URL:', redirectUrl);

      // 從回調 URL 中提取授權碼
      const code = NotionOAuth.extractCodeFromUrl(redirectUrl);
      if (!code) {
        throw new Error('未能從回調 URL 中提取授權碼');
      }

      Logger.debug('🔑 取得授權碼:', code.substring(0, 10) + '...');

      // 交換授權碼為 Access Token (這部分需要透過 background script 處理)
      const tokenData = await NotionOAuth.exchangeCodeForToken(code);
      
      // 儲存 Token
      await NotionOAuth.saveTokenData(tokenData);

      Logger.info('✅ OAuth 授權完成');
      return tokenData;

    } catch (error) {
      Logger.error('❌ OAuth 授權失敗:', error);
      throw error;
    }
  },

  /**
   * 建立授權 URL
   */
  buildAuthUrl: () => {
    const params = new URLSearchParams({
      client_id: NotionOAuth.config.clientId,
      response_type: NotionOAuth.config.responseType,
      owner: 'user',
      redirect_uri: NotionOAuth.config.redirectUri
    });

    const authUrl = `${NotionOAuth.config.authBaseUrl}?${params.toString()}`;
    Logger.debug('📋 建立的授權 URL:', authUrl);
    Logger.debug('🔗 使用的 redirect_uri:', NotionOAuth.config.redirectUri);
    return authUrl;
  },

  /**
   * 從 URL 中提取授權碼
   */
  extractCodeFromUrl: (url) => {
    try {
      const urlObj = new URL(url);
      const code = urlObj.searchParams.get('code');
      const error = urlObj.searchParams.get('error');
      
      if (error) {
        throw new Error(`授權錯誤: ${error}`);
      }
      
      return code;
    } catch (error) {
      Logger.error('解析 URL 失敗:', error);
      return null;
    }
  },

  /**
   * 交換授權碼為 Access Token
   * 注意：由於安全考量，實際的 token 交換需要透過 background script 或代理伺服器
   */
  exchangeCodeForToken: async (code) => {
    try {
      Logger.debug('🔄 交換授權碼為 Access Token');

      // 透過 background script 處理 token 交換
      const response = await chrome.runtime.sendMessage({
        action: 'exchangeOAuthToken',
        code: code,
        redirectUri: NotionOAuth.config.redirectUri
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Token 交換失敗');
      }

      Logger.info('✅ 成功取得 Access Token');
      return response.data;

    } catch (error) {
      Logger.error('❌ Token 交換失敗:', error);
      throw error;
    }
  },

  /**
   * 儲存 Token 資料到 Chrome Storage
   */
  saveTokenData: async (tokenData) => {
    try {
      const saveData = {
        notionOAuthToken: tokenData.accessToken,
        notionRefreshToken: tokenData.refreshToken,
        notionTokenExpiresAt: tokenData.expiresAt,
        notionWorkspaceId: tokenData.workspaceId,
        notionWorkspaceName: tokenData.workspaceName,
        notionWorkspaceIcon: tokenData.workspaceIcon,
        notionBotId: tokenData.botId,
        notionOAuthOwner: tokenData.owner,
        lastOAuthTime: new Date().toISOString(),
        authMethod: 'oauth', // 標記為 OAuth 授權方式
        // 為了向後相容，也設定舊的 token 欄位
        notionToken: tokenData.accessToken,
        // 清除手動設定的標記
        manualTokenMode: false
      };

      await chrome.storage.sync.set(saveData);
      
      Logger.debug('💾 Token 資料已儲存');
      return saveData;
    } catch (error) {
      Logger.error('❌ 儲存 Token 失敗:', error);
      throw error;
    }
  },

  /**
   * 取得儲存的 Token
   */
  getStoredToken: async () => {
    try {
      const result = await chrome.storage.sync.get([
        'notionOAuthToken',
        'notionRefreshToken', 
        'notionTokenExpiresAt',
        'notionWorkspaceId',
        'notionWorkspaceName',
        'notionWorkspaceIcon',
        'authMethod'
      ]);

      if (!result.notionOAuthToken) {
        return null;
      }

      // 檢查 Token 是否過期
      if (result.notionTokenExpiresAt && Date.now() > result.notionTokenExpiresAt) {
        Logger.debug('⚠️ Token 已過期，嘗試刷新');
        return await NotionOAuth.refreshToken();
      }

      return {
        accessToken: result.notionOAuthToken,
        refreshToken: result.notionRefreshToken,
        expiresAt: result.notionTokenExpiresAt,
        workspaceId: result.notionWorkspaceId,
        workspaceName: result.notionWorkspaceName,
        workspaceIcon: result.notionWorkspaceIcon,
        authMethod: result.authMethod
      };

    } catch (error) {
      Logger.error('❌ 取得 Token 失敗:', error);
      return null;
    }
  },

  /**
   * 刷新 Access Token
   */
  refreshToken: async () => {
    try {
      const result = await chrome.storage.sync.get('notionRefreshToken');
      if (!result.notionRefreshToken) {
        throw new Error('沒有 Refresh Token，需要重新授權');
      }

      Logger.debug('🔄 刷新 Access Token');

      // 透過 background script 處理 token 刷新
      const response = await chrome.runtime.sendMessage({
        action: 'refreshOAuthToken',
        refreshToken: result.notionRefreshToken
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Token 刷新失敗');
      }

      // 更新儲存的 Token
      await chrome.storage.sync.set({
        notionOAuthToken: response.data.accessToken,
        notionToken: response.data.accessToken, // 向後相容
        notionTokenExpiresAt: response.data.expiresAt
      });

      Logger.info('✅ Token 刷新成功');
      
      return {
        accessToken: response.data.accessToken,
        expiresAt: response.data.expiresAt
      };

    } catch (error) {
      Logger.error('❌ Token 刷新失敗:', error);
      // 刷新失敗，清除所有 Token，用戶需要重新授權
      await NotionOAuth.clearTokenData();
      throw error;
    }
  },

  /**
   * 清除 Token 資料（登出）
   */
  clearTokenData: async () => {
    try {
      await chrome.storage.sync.remove([
        'notionOAuthToken',
        'notionRefreshToken',
        'notionTokenExpiresAt', 
        'notionWorkspaceId',
        'notionWorkspaceName',
        'notionWorkspaceIcon',
        'notionBotId',
        'notionOAuthOwner',
        'lastOAuthTime',
        'authMethod'
        // 注意：保留 notionToken 以保持向後相容性，除非用戶明確要求清除所有設定
      ]);
      
      Logger.debug('🗑️ OAuth Token 資料已清除');
    } catch (error) {
      Logger.error('❌ 清除 Token 失敗:', error);
    }
  },

  /**
   * 檢查是否已透過 OAuth 授權
   */
  isOAuthAuthorized: async () => {
    const result = await chrome.storage.sync.get(['notionOAuthToken', 'authMethod']);
    return !!(result.notionOAuthToken && result.authMethod === 'oauth');
  },

  /**
   * 檢查是否已授權（包含 OAuth 和手動 Token）
   */
  isAuthorized: async () => {
    const result = await chrome.storage.sync.get(['notionOAuthToken', 'notionToken']);
    return !!(result.notionOAuthToken || result.notionToken);
  },

  /**
   * 取得當前的 Access Token（自動處理過期和刷新）
   */
  getAccessToken: async () => {
    try {
      // 優先使用 OAuth Token
      const oauthToken = await NotionOAuth.getStoredToken();
      if (oauthToken?.accessToken) {
        return oauthToken.accessToken;
      }

      // 回退到手動 Token（向後相容）
      const result = await chrome.storage.sync.get('notionToken');
      return result.notionToken || null;
    } catch (error) {
      Logger.error('❌ 取得 Access Token 失敗:', error);
      return null;
    }
  },

  /**
   * 取得授權方式
   */
  getAuthMethod: async () => {
    const result = await chrome.storage.sync.get('authMethod');
    return result.authMethod || 'manual';
  }
};

// === Initialization ===
NotionOAuth.init();

// === Module Export ===
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NotionOAuth;
} else if (typeof window !== 'undefined') {
  window.NotionOAuth = NotionOAuth;
}
