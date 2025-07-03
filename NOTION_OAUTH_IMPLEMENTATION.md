# Notion OAuth 2.0 實作指南

## 🎯 概述與優勢

### 為什麼要使用 OAuth 2.0？

目前的手動 Token 輸入方式存在以下問題：
- **用戶體驗差**：多數用戶不知道如何取得 Integration Token
- **操作複雜**：需要到 Notion 開發者頁面手動建立 Integration
- **安全性低**：Token 容易外洩，且無法精確控制權限
- **維護困難**：Token 過期需要手動更新

### OAuth 2.0 的優勢

| 現有流程 | OAuth 2.0 流程 |
|---------|---------------|
| 手動取得 Token | 一鍵授權 |
| 填入複雜的 Token 字串 | 在 Notion 官方頁面操作 |
| 不確定權限範圍 | 明確選擇授權範圍 |
| Token 過期需手動更新 | 自動刷新 Token |
| 5-10 分鐘設定時間 | 30 秒完成授權 |

### 用戶體驗對比

**現有流程**：
```
1. 用戶需要學習如何取得 Notion Token (複雜)
2. 前往 Notion 開發者頁面建立 Integration
3. 複製長串 Token 到 Extension
4. 手動載入和選擇父頁面
5. 手動選擇或建立資料庫
⏱️ 總時間：5-10 分鐘，容易出錯
```

**OAuth 2.0 流程**：
```
1. 點擊「連接 Notion」按鈕
2. 在 Notion 官方頁面選擇 workspace
3. 點擊「授權」
4. 自動完成設定，開始使用
⏱️ 總時間：30 秒，零出錯
```

## 🛠️ Notion 開發者平台設定

### 1. 建立 Public Integration

1. 前往 [Notion 開發者頁面](https://developers.notion.com/docs/authorization)
2. 點擊「Create new integration」
3. 選擇「Public integration」
4. 填入基本資訊：

```
Name: Universal Job Scraper
Logo: (上傳您的 Extension Logo)
Description: One-click scrape jobs from multiple job sites to Notion
Website: (您的 Extension 網站或 GitHub)
```

### 2. 設定 OAuth 配置

在 Integration 設定頁面：

```
OAuth Domain & URIs:
- Redirect URIs: https://YOUR_EXTENSION_ID.chromiumapp.org/oauth2
- Website Domain: (如果有的話)

Capabilities:
☑️ Read content
☑️ Update content  
☑️ Insert content

User Capabilities:
☑️ Read user information including email address
```

### 3. 取得憑證

設定完成後，您會得到：
- **Client ID**: `your_client_id_here`
- **Client Secret**: `your_client_secret_here`

⚠️ **重要**：Client Secret 需要安全保存，不能包含在前端程式碼中。

## 🔧 Chrome Extension OAuth 實作

### 1. manifest.json 配置

```json
{
  "manifest_version": 3,
  "name": "Universal Job Scraper",
  "permissions": [
    "identity",
    "storage",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "https://api.notion.com/*"
  ],
  "oauth2": {
    "client_id": "your_notion_client_id",
    "scopes": ["read", "write"]
  },
  "key": "YOUR_EXTENSION_KEY_FOR_CONSISTENT_ID"
}
```

### 2. OAuth 模組實作

建立 `notionOAuth.js`：

```javascript
// notionOAuth.js - Notion OAuth 2.0 處理模組

const NotionOAuth = {
  // OAuth 配置
  config: {
    clientId: 'your_client_id_here',
    redirectUri: `https://${chrome.runtime.id}.chromiumapp.org/oauth2`,
    scope: 'read,write',
    responseType: 'code',
    authBaseUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token'
  },

  /**
   * 開始 OAuth 授權流程
   */
  async authorize() {
    try {
      console.log('🚀 開始 Notion OAuth 授權流程');
      
      // 建立授權 URL
      const authUrl = this.buildAuthUrl();
      console.log('📡 授權 URL:', authUrl);

      // 使用 Chrome Identity API 啟動授權流程
      const redirectUrl = await new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow({
          url: authUrl,
          interactive: true
        }, (redirectUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(redirectUrl);
          }
        });
      });

      console.log('📨 授權回調 URL:', redirectUrl);

      // 從回調 URL 中提取授權碼
      const code = this.extractCodeFromUrl(redirectUrl);
      if (!code) {
        throw new Error('未能從回調 URL 中提取授權碼');
      }

      console.log('🔑 取得授權碼:', code.substring(0, 10) + '...');

      // 交換授權碼為 Access Token
      const tokenData = await this.exchangeCodeForToken(code);
      
      // 儲存 Token
      await this.saveTokenData(tokenData);

      console.log('✅ OAuth 授權完成');
      return tokenData;

    } catch (error) {
      console.error('❌ OAuth 授權失敗:', error);
      throw error;
    }
  },

  /**
   * 建立授權 URL
   */
  buildAuthUrl() {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: this.config.responseType,
      owner: 'user',
      redirect_uri: this.config.redirectUri
    });

    return `${this.config.authBaseUrl}?${params.toString()}`;
  },

  /**
   * 從 URL 中提取授權碼
   */
  extractCodeFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.searchParams.get('code');
    } catch (error) {
      console.error('解析 URL 失敗:', error);
      return null;
    }
  },

  /**
   * 交換授權碼為 Access Token
   */
  async exchangeCodeForToken(code) {
    try {
      console.log('🔄 交換授權碼為 Access Token');

      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${btoa(this.config.clientId + ':' + this.config.clientSecret)}`
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: this.config.redirectUri
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Token 交換失敗: ${errorData.error_description || response.statusText}`);
      }

      const tokenData = await response.json();
      console.log('✅ 成功取得 Access Token');
      
      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        tokenType: tokenData.token_type,
        scope: tokenData.scope,
        workspaceId: tokenData.workspace_id,
        workspaceName: tokenData.workspace_name,
        workspaceIcon: tokenData.workspace_icon,
        botId: tokenData.bot_id,
        owner: tokenData.owner,
        expiresAt: Date.now() + (tokenData.expires_in * 1000)
      };

    } catch (error) {
      console.error('❌ Token 交換失敗:', error);
      throw error;
    }
  },

  /**
   * 儲存 Token 資料到 Chrome Storage
   */
  async saveTokenData(tokenData) {
    try {
      await chrome.storage.sync.set({
        notionOAuthToken: tokenData.accessToken,
        notionRefreshToken: tokenData.refreshToken,
        notionTokenExpiresAt: tokenData.expiresAt,
        notionWorkspaceId: tokenData.workspaceId,
        notionWorkspaceName: tokenData.workspaceName,
        notionWorkspaceIcon: tokenData.workspaceIcon,
        notionBotId: tokenData.botId,
        notionOAuthOwner: tokenData.owner,
        lastOAuthTime: new Date().toISOString()
      });
      
      console.log('💾 Token 資料已儲存');
    } catch (error) {
      console.error('❌ 儲存 Token 失敗:', error);
      throw error;
    }
  },

  /**
   * 取得儲存的 Token
   */
  async getStoredToken() {
    try {
      const result = await chrome.storage.sync.get([
        'notionOAuthToken',
        'notionRefreshToken', 
        'notionTokenExpiresAt',
        'notionWorkspaceId',
        'notionWorkspaceName',
        'notionWorkspaceIcon'
      ]);

      if (!result.notionOAuthToken) {
        return null;
      }

      // 檢查 Token 是否過期
      if (result.notionTokenExpiresAt && Date.now() > result.notionTokenExpiresAt) {
        console.log('⚠️ Token 已過期，嘗試刷新');
        return await this.refreshToken();
      }

      return {
        accessToken: result.notionOAuthToken,
        refreshToken: result.notionRefreshToken,
        expiresAt: result.notionTokenExpiresAt,
        workspaceId: result.notionWorkspaceId,
        workspaceName: result.notionWorkspaceName,
        workspaceIcon: result.notionWorkspaceIcon
      };

    } catch (error) {
      console.error('❌ 取得 Token 失敗:', error);
      return null;
    }
  },

  /**
   * 刷新 Access Token
   */
  async refreshToken() {
    try {
      const result = await chrome.storage.sync.get('notionRefreshToken');
      if (!result.notionRefreshToken) {
        throw new Error('沒有 Refresh Token');
      }

      console.log('🔄 刷新 Access Token');

      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${btoa(this.config.clientId + ':' + this.config.clientSecret)}`
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: result.notionRefreshToken
        })
      });

      if (!response.ok) {
        throw new Error('Token 刷新失敗');
      }

      const tokenData = await response.json();
      
      // 更新儲存的 Token
      await chrome.storage.sync.set({
        notionOAuthToken: tokenData.access_token,
        notionTokenExpiresAt: Date.now() + (tokenData.expires_in * 1000)
      });

      console.log('✅ Token 刷新成功');
      
      return {
        accessToken: tokenData.access_token,
        expiresAt: Date.now() + (tokenData.expires_in * 1000)
      };

    } catch (error) {
      console.error('❌ Token 刷新失敗:', error);
      // 刷新失敗，清除所有 Token，用戶需要重新授權
      await this.clearTokenData();
      throw error;
    }
  },

  /**
   * 清除 Token 資料（登出）
   */
  async clearTokenData() {
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
        'lastOAuthTime'
      ]);
      
      console.log('🗑️ Token 資料已清除');
    } catch (error) {
      console.error('❌ 清除 Token 失敗:', error);
    }
  },

  /**
   * 檢查是否已授權
   */
  async isAuthorized() {
    const token = await this.getStoredToken();
    return !!token?.accessToken;
  },

  /**
   * 取得當前的 Access Token（自動處理過期和刷新）
   */
  async getAccessToken() {
    const tokenData = await this.getStoredToken();
    return tokenData?.accessToken;
  }
};

// 匯出模組
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NotionOAuth;
} else if (typeof window !== 'undefined') {
  window.NotionOAuth = NotionOAuth;
}
```

### 3. 安全性考量

⚠️ **Client Secret 處理**：

由於 Chrome Extension 是前端程式碼，不能直接包含 Client Secret。有兩種解決方案：

**方案 A：使用代理伺服器（推薦）**
```javascript
// 在您的伺服器上建立代理端點
async exchangeCodeForToken(code) {
  const response = await fetch('https://your-server.com/api/notion-oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  return await response.json();
}
```

**方案 B：環境變數配置**
```javascript
// 使用構建時環境變數
const CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET;
```

## 🎯 自動化父頁面選擇

### 1. 智慧父頁面選擇邏輯

```javascript
const PageSelector = {
  /**
   * 自動選擇最佳的父頁面
   */
  selectBestParentPage(authorizedPages) {
    // 優先順序邏輯
    const priorities = [
      this.findWorkspaceRootPages,      // 1. Workspace 根頁面
      this.findJobRelatedPages,         // 2. 職缺相關頁面
      this.findRecentlyModifiedPages,   // 3. 最近修改的頁面
      this.findWritablePages            // 4. 可寫入的頁面
    ];

    for (const finder of priorities) {
      const pages = finder(authorizedPages);
      if (pages.length > 0) {
        console.log('🎯 選擇父頁面策略:', finder.name);
        return pages[0]; // 返回第一個符合條件的頁面
      }
    }

    // 如果都沒有，返回第一個頁面
    return authorizedPages[0] || null;
  },

  /**
   * 尋找 Workspace 根頁面
   */
  findWorkspaceRootPages(pages) {
    return pages.filter(page => 
      page.parent?.type === 'workspace' && 
      page.object === 'page'
    );
  },

  /**
   * 尋找職缺相關頁面
   */
  findJobRelatedPages(pages) {
    const jobKeywords = [
      'job', 'career', 'work', 'employment',
      '工作', '職缺', '求職', '職涯', '招聘'
    ];
    
    return pages.filter(page => {
      const title = page.properties?.title?.title?.[0]?.plain_text?.toLowerCase() || '';
      return jobKeywords.some(keyword => title.includes(keyword));
    });
  },

  /**
   * 尋找最近修改的頁面
   */
  findRecentlyModifiedPages(pages) {
    return pages
      .filter(page => page.last_edited_time)
      .sort((a, b) => new Date(b.last_edited_time) - new Date(a.last_edited_time))
      .slice(0, 3); // 取前 3 個最近修改的
  },

  /**
   * 尋找可寫入的頁面
   */
  findWritablePages(pages) {
    return pages.filter(page => 
      page.permissions?.some(permission => 
        permission.type === 'user' && 
        ['editor', 'full_access'].includes(permission.role)
      )
    );
  }
};
```

### 2. 自動資料庫管理

```javascript
const DatabaseManager = {
  /**
   * 智慧選擇或建立資料庫
   */
  async setupDatabase(accessToken, parentPageId) {
    try {
      console.log('🔍 搜尋現有資料庫...');
      
      // 1. 搜尋父頁面下的現有資料庫
      const existingDatabases = await this.searchExistingDatabases(accessToken, parentPageId);
      
      // 2. 尋找相容的資料庫
      const compatibleDatabase = this.findCompatibleDatabase(existingDatabases);
      
      if (compatibleDatabase) {
        console.log('✅ 找到相容的資料庫:', compatibleDatabase.title);
        return compatibleDatabase;
      }
      
      // 3. 沒有相容資料庫，建立新的
      console.log('🆕 建立新的職缺追蹤資料庫...');
      return await this.createJobTrackingDatabase(accessToken, parentPageId);
      
    } catch (error) {
      console.error('❌ 資料庫設定失敗:', error);
      throw error;
    }
  },

  /**
   * 搜尋現有資料庫
   */
  async searchExistingDatabases(accessToken, parentPageId) {
    const response = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        filter: {
          value: 'database',
          property: 'object'
        },
        parent: {
          type: 'page_id',
          page_id: parentPageId
        }
      })
    });

    const data = await response.json();
    return data.results || [];
  },

  /**
   * 尋找相容的資料庫
   */
  findCompatibleDatabase(databases) {
    const jobKeywords = ['job', 'career', 'work', '工作', '職缺', '求職'];
    
    return databases.find(db => {
      const title = db.title?.[0]?.plain_text?.toLowerCase() || '';
      const hasJobKeyword = jobKeywords.some(keyword => title.includes(keyword));
      const hasRequiredFields = this.checkRequiredFields(db);
      
      return hasJobKeyword && hasRequiredFields;
    });
  },

  /**
   * 檢查必要欄位
   */
  checkRequiredFields(database) {
    const requiredFields = ['title', 'company', 'url'];
    const properties = Object.keys(database.properties || {});
    
    return requiredFields.every(field => 
      properties.some(prop => prop.toLowerCase().includes(field))
    );
  },

  /**
   * 建立職缺追蹤資料庫
   */
  async createJobTrackingDatabase(accessToken, parentPageId) {
    const databaseSchema = {
      parent: {
        type: 'page_id',
        page_id: parentPageId
      },
      title: [
        {
          type: 'text',
          text: {
            content: '職缺追蹤資料庫'
          }
        }
      ],
      properties: {
        '職位名稱': {
          title: {}
        },
        '公司': {
          rich_text: {}
        },
        '工作地點': {
          rich_text: {}
        },
        '薪資': {
          rich_text: {}
        },
        '職缺連結': {
          url: {}
        },
        '申請狀態': {
          select: {
            options: [
              { name: '待申請', color: 'gray' },
              { name: '已申請', color: 'blue' },
              { name: '面試中', color: 'yellow' },
              { name: '已錄取', color: 'green' },
              { name: '已拒絕', color: 'red' }
            ]
          }
        },
        '申請日期': {
          date: {}
        },
        '工作描述': {
          rich_text: {}
        },
        '技能要求': {
          multi_select: {
            options: []
          }
        },
        '備註': {
          rich_text: {}
        }
      }
    };

    const response = await fetch('https://api.notion.com/v1/databases', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify(databaseSchema)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`建立資料庫失敗: ${error.message}`);
    }

    const database = await response.json();
    console.log('✅ 職缺追蹤資料庫建立成功');
    
    return database;
  }
};
```

## 🎨 用戶介面更新

### 1. OAuth 按鈕和狀態顯示

```html
<!-- 未授權狀態 -->
<div id="authSection" class="auth-section">
  <div class="auth-guide">
    <h3>🔗 連接您的 Notion 帳號</h3>
    <p>在下一步的授權頁面，建議您：</p>
    <ul>
      <li>✅ 選擇「整個 workspace」（最方便）</li>
      <li>✅ 或選擇您想存放職缺的特定頁面</li>
    </ul>
    <button id="connectNotionBtn" class="btn btn-primary">
      🔗 連接 Notion 開始使用
    </button>
  </div>
</div>

<!-- 授權中狀態 -->
<div id="authorizingSection" class="auth-section" style="display: none;">
  <div class="authorizing-status">
    <div class="spinner"></div>
    <h3>🔄 正在連接 Notion...</h3>
    <p>請在彈出的 Notion 頁面完成授權</p>
  </div>
</div>

<!-- 設定中狀態 -->
<div id="settingUpSection" class="auth-section" style="display: none;">
  <div class="setup-status">
    <div class="progress-indicator">
      <div class="step completed">✅ 已連接 Notion</div>
      <div class="step active">⏳ 正在自動設定資料庫...</div>
      <div class="step">⏳ 準備完成</div>
    </div>
  </div>
</div>

<!-- 已授權完成狀態 -->
<div id="authorizedSection" class="auth-section" style="display: none;">
  <div class="authorized-status">
    <div class="workspace-info">
      <img id="workspaceIcon" src="" alt="Workspace Icon" class="workspace-icon">
      <div class="workspace-details">
        <h3>✅ 已連接到 <span id="workspaceName"></span></h3>
        <p>資料庫：<span id="databaseName"></span></p>
      </div>
      <button id="disconnectBtn" class="btn btn-secondary btn-small">
        🔓 中斷連接
      </button>
    </div>
  </div>
  
  <!-- 主要功能按鈕 -->
  <div class="main-actions">
    <button class="btn btn-success" id="scrapeBtn">
      🚀 抓取職缺到 Notion
    </button>
    <button class="btn btn-secondary" id="previewBtn">
      👁️ 預覽資料
    </button>
  </div>
</div>
```

### 2. CSS 樣式

```css
/* OAuth 相關樣式 */
.auth-section {
  margin-bottom: 20px;
}

.auth-guide {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  text-align: center;
}

.auth-guide h3 {
  margin-bottom: 15px;
  color: #1f2937;
}

.auth-guide ul {
  text-align: left;
  margin: 15px 0;
  color: #6b7280;
}

.btn-primary {
  background: #2563eb;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  font-size: 16px;
}

.btn-primary:hover {
  background: #1d4ed8;
}

.authorizing-status {
  text-align: center;
  padding: 30px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f4f6;
  border-top: 4px solid #2563eb;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.progress-indicator {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px;
}

.step {
  padding: 10px 15px;
  border-radius: 6px;
  background: #f3f4f6;
  color: #6b7280;
}

.step.completed {
  background: #d1fae5;
  color: #065f46;
}

.step.active {
  background: #dbeafe;
  color: #1d4ed8;
}

.workspace-info {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px;
  background: #f0f9ff;
  border-radius: 8px;
  border: 1px solid #0ea5e9;
}

.workspace-icon {
  width: 40px;
  height: 40px;
  border-radius: 6px;
}

.workspace-details {
  flex: 1;
}

.workspace-details h3 {
  margin: 0 0 5px 0;
  color: #0c4a6e;
}

.workspace-details p {
  margin: 0;
  color: #075985;
  font-size: 14px;
}

.btn-small {
  padding: 6px 12px;
  font-size: 12px;
}

.btn-secondary {
  background: #6b7280;
  color: white;
}

.btn-secondary:hover {
  background: #4b5563;
}

.btn-success {
  background: #059669;
  color: white;
}

.btn-success:hover {
  background: #047857;
}
```

### 3. JavaScript 事件處理

```javascript
// OAuth UI 控制器
const OAuthUI = {
  // 初始化 UI
  async init() {
    await this.updateUIState();
    this.bindEvents();
  },

  // 綁定事件
  bindEvents() {
    const connectBtn = document.getElementById('connectNotionBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    
    if (connectBtn) {
      connectBtn.addEventListener('click', () => this.handleConnect());
    }
    
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', () => this.handleDisconnect());
    }
  },

  // 處理連接 Notion
  async handleConnect() {
    try {
      this.showSection('authorizingSection');
      
      // 開始 OAuth 流程
      const tokenData = await NotionOAuth.authorize();
      
      // 顯示設定中狀態
      this.showSection('settingUpSection');
      
      // 自動設定資料庫
      await this.autoSetupDatabase(tokenData);
      
      // 更新 UI 為已授權狀態
      await this.updateUIState();
      
      // 顯示成功訊息
      this.showSuccessMessage('🎉 設定完成！現在可以開始抓取職缺了');
      
    } catch (error) {
      console.error('❌ 連接失敗:', error);
      this.showErrorMessage(`連接失敗: ${error.message}`);
      this.showSection('authSection');
    }
  },

  // 處理中斷連接
  async handleDisconnect() {
    try {
      await NotionOAuth.clearTokenData();
      await this.updateUIState();
      this.showSuccessMessage('已中斷與 Notion 的連接');
    } catch (error) {
      console.error('❌ 中斷連接失敗:', error);
      this.showErrorMessage(`中斷連接失敗: ${error.message}`);
    }
  },

  // 自動設定資料庫
  async autoSetupDatabase(tokenData) {
    try {
      // 載入授權的頁面
      const pages = await this.loadAuthorizedPages(tokenData.accessToken);
      
      // 選擇最佳父頁面
      const parentPage = PageSelector.selectBestParentPage(pages);
      if (!parentPage) {
        throw new Error('沒有找到可用的父頁面');
      }
      
      // 設定資料庫
      const database = await DatabaseManager.setupDatabase(
        tokenData.accessToken, 
        parentPage.id
      );
      
      // 儲存設定
      await chrome.storage.sync.set({
        selectedParentPageId: parentPage.id,
        selectedParentPageName: parentPage.title || '未命名頁面',
        databaseId: database.id,
        databaseName: database.title?.[0]?.plain_text || '職缺追蹤資料庫',
        autoSetupCompleted: true,
        autoSetupTime: new Date().toISOString()
      });
      
      console.log('✅ 自動設定完成');
      
    } catch (error) {
      console.error('❌ 自動設定失敗:', error);
      throw error;
    }
  },

  // 載入授權的頁面
  async loadAuthorizedPages(accessToken) {
    const response = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        filter: {
          value: 'page',
          property: 'object'
        }
      })
    });

    const data = await response.json();
    return data.results || [];
  },

  // 更新 UI 狀態
  async updateUIState() {
    const isAuthorized = await NotionOAuth.isAuthorized();
    
    if (isAuthorized) {
      await this.showAuthorizedState();
    } else {
      this.showSection('authSection');
    }
  },

  // 顯示已授權狀態
  async showAuthorizedState() {
    try {
      // 取得工作區資訊
      const workspaceData = await chrome.storage.sync.get([
        'notionWorkspaceName',
        'notionWorkspaceIcon', 
        'databaseName'
      ]);
      
      // 更新 UI 元素
      const workspaceNameEl = document.getElementById('workspaceName');
      const workspaceIconEl = document.getElementById('workspaceIcon');
      const databaseNameEl = document.getElementById('databaseName');
      
      if (workspaceNameEl) {
        workspaceNameEl.textContent = workspaceData.notionWorkspaceName || '未知工作區';
      }
      
      if (workspaceIconEl && workspaceData.notionWorkspaceIcon) {
        workspaceIconEl.src = workspaceData.notionWorkspaceIcon;
      }
      
      if (databaseNameEl) {
        databaseNameEl.textContent = workspaceData.databaseName || '職缺追蹤資料庫';
      }
      
      this.showSection('authorizedSection');
      
    } catch (error) {
      console.error('❌ 顯示授權狀態失敗:', error);
      this.showSection('authSection');
    }
  },

  // 顯示指定區段
  showSection(sectionId) {
    const sections = [
      'authSection',
      'authorizingSection', 
      'settingUpSection',
      'authorizedSection'
    ];
    
    sections.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.style.display = id === sectionId ? 'block' : 'none';
      }
    });
  },

  // 顯示成功訊息
  showSuccessMessage(message) {
    // 實作成功訊息顯示
    console.log('✅', message);
  },

  // 顯示錯誤訊息  
  showErrorMessage(message) {
    // 實作錯誤訊息顯示
    console.error('❌', message);
  }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  OAuthUI.init();
});
```

## 🛡️ 錯誤處理與安全性

### 1. 常見錯誤處理

```javascript
const ErrorHandler = {
  // 錯誤類型定義
  ErrorTypes: {
    OAUTH_CANCELLED: 'oauth_cancelled',
    OAUTH_FAILED: 'oauth_failed',
    TOKEN_EXPIRED: 'token_expired',
    PERMISSION_DENIED: 'permission_denied',
    NETWORK_ERROR: 'network_error',
    SETUP_FAILED: 'setup_failed'
  },

  // 處理錯誤
  handle(error, context = '') {
    console.error(`❌ [${context}] 錯誤:`, error);
    
    const errorType = this.classifyError(error);
    const userMessage = this.getUserMessage(errorType, error);
    
    // 根據錯誤類型決定處理策略
    switch (errorType) {
      case this.ErrorTypes.OAUTH_CANCELLED:
        // 用戶取消授權，不需要特別處理
        break;
        
      case this.ErrorTypes.TOKEN_EXPIRED:
        // Token 過期，嘗試刷新或重新授權
        this.handleTokenExpired();
        break;
        
      case this.ErrorTypes.PERMISSION_DENIED:
        // 權限不足，引導用戶重新授權
        this.handlePermissionDenied();
        break;
        
      default:
        // 一般錯誤，顯示錯誤訊息
        this.showErrorMessage(userMessage);
    }
    
    return { type: errorType, message: userMessage };
  },

  // 分類錯誤
  classifyError(error) {
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('user cancelled') || message.includes('用戶取消')) {
      return this.ErrorTypes.OAUTH_CANCELLED;
    }
    
    if (message.includes('token') && message.includes('expired')) {
      return this.ErrorTypes.TOKEN_EXPIRED;
    }
    
    if (message.includes('permission') || message.includes('unauthorized')) {
      return this.ErrorTypes.PERMISSION_DENIED;
    }
    
    if (message.includes('network') || message.includes('fetch')) {
      return this.ErrorTypes.NETWORK_ERROR;
    }
    
    return this.ErrorTypes.OAUTH_FAILED;
  },

  // 取得用戶友善的錯誤訊息
  getUserMessage(errorType, error) {
    const messages = {
      [this.ErrorTypes.OAUTH_CANCELLED]: '授權已取消',
      [this.ErrorTypes.OAUTH_FAILED]: '連接 Notion 失敗，請稍後重試',
      [this.ErrorTypes.TOKEN_EXPIRED]: '授權已過期，正在重新連接...',
      [this.ErrorTypes.PERMISSION_DENIED]: '權限不足，請重新授權並確保選擇正確的頁面',
      [this.ErrorTypes.NETWORK_ERROR]: '網路連接異常，請檢查網路連接後重試',
      [this.ErrorTypes.SETUP_FAILED]: '自動設定失敗，請嘗試手動設定'
    };
    
    return messages[errorType] || `發生未知錯誤: ${error.message}`;
  },

  // 處理 Token 過期
  async handleTokenExpired() {
    try {
      await NotionOAuth.refreshToken();
      this.showSuccessMessage('連接已更新');
    } catch (refreshError) {
      this.showErrorMessage('連接已過期，請重新授權');
      await NotionOAuth.clearTokenData();
      OAuthUI.showSection('authSection');
    }
  },

  // 處理權限被拒
  handlePermissionDenied() {
    this.showErrorMessage('權限不足，請重新授權並確保選擇正確的頁面');
    OAuthUI.showSection('authSection');
  },

  // 顯示錯誤訊息
  showErrorMessage(message) {
    // 實作錯誤訊息 UI
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    // 添加到頁面並在 3 秒後移除
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 3000);
  },

  // 顯示成功訊息
  showSuccessMessage(message) {
    // 實作成功訊息 UI
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    
    document.body.appendChild(successDiv);
    setTimeout(() => successDiv.remove(), 3000);
  }
};
```

### 2. 安全性最佳實踐

```javascript
const SecurityManager = {
  // 驗證 Token 的有效性
  async validateToken(accessToken) {
    try {
      const response = await fetch('https://api.notion.com/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Notion-Version': '2022-06-28'
        }
      });
      
      return response.ok;
    } catch (error) {
      return false;
    }
  },

  // 安全的資料儲存
  async secureStore(key, value) {
    try {
      // 可以在這裡添加加密邏輯
      await chrome.storage.sync.set({ [key]: value });
    } catch (error) {
      console.error('安全儲存失敗:', error);
      throw error;
    }
  },

  // 安全的資料讀取
  async secureRetrieve(key) {
    try {
      const result = await chrome.storage.sync.get(key);
      // 可以在這裡添加解密邏輯
      return result[key];
    } catch (error) {
      console.error('安全讀取失敗:', error);
      return null;
    }
  },

  // 清理敏感資料
  async clearSensitiveData() {
    const sensitiveKeys = [
      'notionOAuthToken',
      'notionRefreshToken',
      'notionClientSecret' // 如果有儲存的話
    ];
    
    try {
      await chrome.storage.sync.remove(sensitiveKeys);
      console.log('敏感資料已清理');
    } catch (error) {
      console.error('清理敏感資料失敗:', error);
    }
  }
};
```

## 🧪 測試與驗證

### 1. OAuth 流程測試

```javascript
const OAuthTester = {
  // 測試完整的 OAuth 流程
  async testFullFlow() {
    console.log('🧪 開始測試 OAuth 流程');
    
    try {
      // 1. 清除現有的 Token
      await NotionOAuth.clearTokenData();
      console.log('✅ 清除現有 Token');
      
      // 2. 檢查初始狀態
      const initialAuth = await NotionOAuth.isAuthorized();
      console.assert(!initialAuth, '初始狀態應該是未授權');
      console.log('✅ 初始狀態檢查通過');
      
      // 3. 開始授權流程
      console.log('🔄 開始授權流程（需要用戶互動）');
      const tokenData = await NotionOAuth.authorize();
      console.log('✅ 授權完成:', tokenData);
      
      // 4. 檢查授權後狀態
      const afterAuth = await NotionOAuth.isAuthorized();
      console.assert(afterAuth, '授權後應該是已授權狀態');
      console.log('✅ 授權後狀態檢查通過');
      
      // 5. 測試 Token 取得
      const accessToken = await NotionOAuth.getAccessToken();
      console.assert(accessToken, '應該能取得 Access Token');
      console.log('✅ Access Token 取得成功');
      
      // 6. 測試 API 呼叫
      const isValid = await SecurityManager.validateToken(accessToken);
      console.assert(isValid, 'Token 應該有效');
      console.log('✅ Token 驗證通過');
      
      console.log('🎉 OAuth 流程測試全部通過');
      
    } catch (error) {
      console.error('❌ OAuth 流程測試失敗:', error);
      throw error;
    }
  },

  // 測試自動設定流程
  async testAutoSetup() {
    console.log('🧪 開始測試自動設定流程');
    
    try {
      const accessToken = await NotionOAuth.getAccessToken();
      if (!accessToken) {
        throw new Error('需要先完成 OAuth 授權');
      }
      
      // 測試頁面載入
      const pages = await OAuthUI.loadAuthorizedPages(accessToken);
      console.assert(pages.length > 0, '應該能載入到授權的頁面');
      console.log('✅ 頁面載入成功，數量:', pages.length);
      
      // 測試父頁面選擇
      const parentPage = PageSelector.selectBestParentPage(pages);
      console.assert(parentPage, '應該能選擇到父頁面');
      console.log('✅ 父頁面選擇成功:', parentPage.id);
      
      // 測試資料庫設定
      const database = await DatabaseManager.setupDatabase(accessToken, parentPage.id);
      console.assert(database.id, '應該能設定資料庫');
      console.log('✅ 資料庫設定成功:', database.id);
      
      console.log('🎉 自動設定流程測試全部通過');
      
    } catch (error) {
      console.error('❌ 自動設定流程測試失敗:', error);
      throw error;
    }
  },

  // 測試錯誤處理
  async testErrorHandling() {
    console.log('🧪 開始測試錯誤處理');
    
    // 測試無效 Token
    try {
      const response = await fetch('https://api.notion.com/v1/users/me', {
        headers: {
          'Authorization': 'Bearer invalid_token',
          'Notion-Version': '2022-06-28'
        }
      });
      
      console.assert(!response.ok, '無效 Token 應該返回錯誤');
      console.log('✅ 無效 Token 錯誤處理正確');
      
    } catch (error) {
      console.log('✅ 無效 Token 引發例外，處理正確');
    }
    
    // 測試網路錯誤
    try {
      await fetch('https://invalid-domain-12345.com');
    } catch (error) {
      const errorInfo = ErrorHandler.handle(error, '網路測試');
      console.assert(errorInfo.type === ErrorHandler.ErrorTypes.NETWORK_ERROR, '應該識別為網路錯誤');
      console.log('✅ 網路錯誤處理正確');
    }
    
    console.log('🎉 錯誤處理測試全部通過');
  }
};

// 開發模式下的測試快捷鍵
if (process.env.NODE_ENV === 'development') {
  window.runOAuthTests = async () => {
    await OAuthTester.testFullFlow();
    await OAuthTester.testAutoSetup(); 
    await OAuthTester.testErrorHandling();
  };
}
```

## 📦 部署與發布

### 1. 建構配置

```json
// package.json
{
  "name": "universal-job-scraper",
  "version": "2.0.0",
  "scripts": {
    "build": "webpack --mode=production",
    "build:dev": "webpack --mode=development",
    "test": "jest",
    "lint": "eslint src/",
    "package": "npm run build && zip -r extension.zip dist/"
  },
  "devDependencies": {
    "webpack": "^5.0.0",
    "webpack-cli": "^4.0.0",
    "copy-webpack-plugin": "^10.0.0"
  }
}
```

```javascript
// webpack.config.js
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    popup: './src/popup.js',
    background: './src/background.js',
    content: './src/content.js',
    oauth: './src/notionOAuth.js'
  },
  output: {
    path: __dirname + '/dist',
    filename: '[name].js'
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'popup.html', to: 'popup.html' },
        { from: '_locales', to: '_locales' },
        { from: 'icons', to: 'icons' }
      ]
    })
  ]
};
```

### 2. 環境變數管理

```javascript
// config/env.js
const environments = {
  development: {
    NOTION_CLIENT_ID: 'dev_client_id',
    API_BASE_URL: 'https://dev-api.yourserver.com',
    DEBUG: true
  },
  production: {
    NOTION_CLIENT_ID: 'prod_client_id', 
    API_BASE_URL: 'https://api.yourserver.com',
    DEBUG: false
  }
};

export default environments[process.env.NODE_ENV || 'development'];
```

### 3. Chrome Web Store 發布檢查清單

- [ ] **Manifest V3 兼容性**：確保使用最新的 Manifest 版本
- [ ] **權限最小化**：只請求必要的權限
- [ ] **隱私政策**：準備隱私政策文件
- [ ] **圖示和截圖**：準備高品質的應用圖示和功能截圖
- [ ] **描述文案**：撰寫清楚的應用描述和功能說明
- [ ] **測試覆蓋**：確保在不同瀏覽器版本上測試
- [ ] **錯誤處理**：完善的錯誤處理和用戶提示
- [ ] **安全性審查**：檢查是否有安全漏洞

## 🔧 維護與更新

### 1. Token 管理最佳實踐

```javascript
const TokenManager = {
  // 定期檢查 Token 狀態
  async healthCheck() {
    try {
      const tokenData = await NotionOAuth.getStoredToken();
      if (!tokenData) {
        console.log('ℹ️ 未找到 Token，用戶需要重新授權');
        return { status: 'not_authorized' };
      }
      
      // 檢查 Token 是否即將過期（提前 1 小時刷新）
      const expiresIn = tokenData.expiresAt - Date.now();
      const oneHour = 60 * 60 * 1000;
      
      if (expiresIn < oneHour) {
        console.log('⚠️ Token 即將過期，嘗試刷新');
        try {
          await NotionOAuth.refreshToken();
          return { status: 'refreshed' };
        } catch (error) {
          console.log('❌ Token 刷新失敗，需要重新授權');
          return { status: 'refresh_failed' };
        }
      }
      
      // 驗證 Token 是否仍然有效
      const isValid = await SecurityManager.validateToken(tokenData.accessToken);
      if (!isValid) {
        console.log('❌ Token 無效，需要重新授權');
        await NotionOAuth.clearTokenData();
        return { status: 'invalid' };
      }
      
      return { status: 'healthy' };
      
    } catch (error) {
      console.error('❌ Token 健康檢查失敗:', error);
      return { status: 'error', error: error.message };
    }
  },

  // 設定定期健康檢查
  startHealthCheckInterval() {
    // 每 30 分鐘檢查一次
    setInterval(() => {
      this.healthCheck().then(result => {
        console.log('🔍 Token 健康檢查結果:', result);
      });
    }, 30 * 60 * 1000);
  }
};

// 在 Extension 啟動時開始健康檢查
TokenManager.startHealthCheckInterval();
```

### 2. 版本更新處理

```javascript
const VersionManager = {
  currentVersion: '2.0.0',
  
  // 處理版本更新
  async handleUpdate(previousVersion) {
    console.log(`🔄 從版本 ${previousVersion} 更新到 ${this.currentVersion}`);
    
    // 版本比較和遷移邏輯
    if (this.isVersionLower(previousVersion, '2.0.0')) {
      await this.migrateToOAuth();
    }
    
    // 更新版本記錄
    await chrome.storage.sync.set({ 
      extensionVersion: this.currentVersion,
      lastUpdateTime: new Date().toISOString()
    });
  },

  // 遷移到 OAuth
  async migrateToOAuth() {
    try {
      console.log('🔄 遷移到 OAuth 系統...');
      
      // 檢查是否有舊的 Token
      const oldConfig = await chrome.storage.sync.get(['notionToken', 'databaseId']);
      
      if (oldConfig.notionToken) {
        // 顯示遷移提示
        this.showMigrationNotice();
        
        // 清除舊的 Token（安全考量）
        await chrome.storage.sync.remove(['notionToken']);
        
        console.log('✅ 舊系統遷移完成');
      }
      
    } catch (error) {
      console.error('❌ 遷移失敗:', error);
    }
  },

  // 顯示遷移通知
  showMigrationNotice() {
    // 實作遷移通知 UI
    console.log('📢 請重新連接您的 Notion 帳號以享受更好的體驗');
  },

  // 版本比較
  isVersionLower(version1, version2) {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part < v2Part) return true;
      if (v1Part > v2Part) return false;
    }
    
    return false;
  }
};
```

## 📊 監控與分析

### 1. 使用統計

```javascript
const Analytics = {
  // 記錄事件
  async trackEvent(eventName, properties = {}) {
    try {
      const eventData = {
        event: eventName,
        properties: {
          ...properties,
          timestamp: new Date().toISOString(),
          version: VersionManager.currentVersion,
          userAgent: navigator.userAgent
        }
      };
      
      // 儲存到本地（可選擇性同步到伺服器）
      await this.storeEvent(eventData);
      
      console.log('📊 事件記錄:', eventName, properties);
      
    } catch (error) {
      console.error('❌ 事件記錄失敗:', error);
    }
  },

  // 儲存事件到本地
  async storeEvent(eventData) {
    const events = await this.getStoredEvents();
    events.push(eventData);
    
    // 只保留最近 1000 個事件
    if (events.length > 1000) {
      events.splice(0, events.length - 1000);
    }
    
    await chrome.storage.local.set({ analyticsEvents: events });
  },

  // 取得儲存的事件
  async getStoredEvents() {
    const result = await chrome.storage.local.get('analyticsEvents');
    return result.analyticsEvents || [];
  },

  // 常用事件記錄方法
  trackOAuthStart: () => Analytics.trackEvent('oauth_started'),
  trackOAuthSuccess: () => Analytics.trackEvent('oauth_success'),
  trackOAuthFailed: (error) => Analytics.trackEvent('oauth_failed', { error: error.message }),
  trackJobScraped: (site) => Analytics.trackEvent('job_scraped', { site }),
  trackDatabaseCreated: () => Analytics.trackEvent('database_created'),
  
  // 生成使用報告
  async generateUsageReport() {
    const events = await this.getStoredEvents();
    const last30Days = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    const recentEvents = events.filter(event => 
      new Date(event.properties.timestamp).getTime() > last30Days
    );
    
    const report = {
      totalEvents: recentEvents.length,
      oauthSuccess: recentEvents.filter(e => e.event === 'oauth_success').length,
      jobsScraped: recentEvents.filter(e => e.event === 'job_scraped').length,
      errorsCount: recentEvents.filter(e => e.event.includes('failed')).length,
      mostCommonSite: this.getMostCommonSite(recentEvents)
    };
    
    console.log('📈 使用報告 (最近 30 天):', report);
    return report;
  },

  // 取得最常用的網站
  getMostCommonSite(events) {
    const siteCounts = {};
    events
      .filter(e => e.event === 'job_scraped' && e.properties.site)
      .forEach(e => {
        siteCounts[e.properties.site] = (siteCounts[e.properties.site] || 0) + 1;
      });
    
    return Object.keys(siteCounts).reduce((a, b) => 
      siteCounts[a] > siteCounts[b] ? a : b, null
    );
  }
};
```

## 🎯 總結

實作 Notion OAuth 2.0 授權系統可以大幅提升用戶體驗：

### 主要優勢
- **簡化設定流程**：從 5-10 分鐘縮短到 30 秒
- **提高安全性**：使用標準 OAuth 2.0 流程
- **自動化程度**：智慧選擇父頁面和資料庫
- **用戶信任度**：在 Notion 官方頁面操作

### 實作重點
1. **OAuth 流程**：使用 `chrome.identity.launchWebAuthFlow`
2. **自動設定**：智慧選擇父頁面和建立資料庫
3. **錯誤處理**：完善的錯誤分類和用戶提示
4. **安全性**：Token 管理和定期健康檢查

### 開發建議
- 先實作基本 OAuth 流程
- 逐步添加自動化功能
- 重視錯誤處理和用戶體驗
- 建立完善的測試機制

這個 OAuth 2.0 實作將讓您的 Chrome Extension 達到專業級的用戶體驗水準！