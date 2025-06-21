// Popup 界面邏輯
class LinkedInJobExtension {
  constructor() {
    this.notionToken = '';
    this.databaseId = '';
    this.aiProvider = 'openai';
    this.aiApiKey = '';
    this.aiModel = '';
    this.init();
  }

  async init() {
    // 載入儲存的設定
    const config = await chrome.storage.sync.get([
      'notionToken', 'databaseId', 'aiProvider', 'aiConfigs'
    ]);
    
    // Notion 設定
    if (config.notionToken) {
      document.getElementById('notionToken').value = config.notionToken;
      this.notionToken = config.notionToken;
    }
    if (config.databaseId) {
      document.getElementById('databaseId').value = config.databaseId;
      this.databaseId = config.databaseId;
    }
    
    // AI 設定
    this.aiConfigs = config.aiConfigs || {};
    if (config.aiProvider) {
      document.getElementById('aiProvider').value = config.aiProvider;
      this.aiProvider = config.aiProvider;
    }
    
    // 載入當前提供商的配置
    this.loadProviderConfig(this.aiProvider || 'openai');

    // 綁定事件
    document.getElementById('saveConfig').addEventListener('click', () => this.saveConfig());
    document.getElementById('saveAiConfig').addEventListener('click', () => this.saveAiConfig());
    document.getElementById('loadModels').addEventListener('click', () => this.loadModels());
    document.getElementById('aiProvider').addEventListener('change', () => this.onProviderChange());
    document.getElementById('scrapeBtn').addEventListener('click', () => this.scrapeAndSave());
    document.getElementById('previewBtn').addEventListener('click', () => this.previewData());
    document.getElementById('createDbBtn').addEventListener('click', () => this.createJobDatabase());
    
    // 綁定折疊功能
    document.getElementById('notionToggle').addEventListener('click', () => this.toggleSection('notionConfig', 'notionToggle'));
    document.getElementById('aiToggle').addEventListener('click', () => this.toggleSection('aiConfig', 'aiToggle'));
    
    // 加入調試按鈕
    const debugBtn = document.createElement('button');
    debugBtn.textContent = '🔍 調試頁面元素';
    debugBtn.className = 'btn';
    debugBtn.style.background = '#059669';
    debugBtn.style.fontSize = '12px';
    debugBtn.style.padding = '8px';
    debugBtn.addEventListener('click', () => this.debugPageElements());
    document.querySelector('.divider').parentNode.insertBefore(debugBtn, document.querySelector('.divider'));
  }

  async saveConfig() {
    const token = document.getElementById('notionToken').value;
    const dbId = document.getElementById('databaseId').value;

    if (!token || !dbId) {
      this.showStatus('請填入完整的 Notion 設定', 'error');
      return;
    }

    await chrome.storage.sync.set({
      notionToken: token,
      databaseId: dbId
    });

    this.notionToken = token;
    this.databaseId = dbId;
    this.showStatus('設定已儲存！', 'success');
  }

  async previewData() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!this.isLinkedInJobPage(tab.url)) {
        this.showStatus('請在 LinkedIn 職缺頁面使用此功能', 'error');
        return;
      }

      // 確保 content script 已載入
      await this.ensureContentScriptLoaded(tab.id);
      
      const response = await this.sendMessageWithRetry(tab.id, { action: 'scrapeJob' });
      
      if (response && response.success) {
        this.showPreview(response.data);
      } else {
        this.showStatus('無法抓取職缺資料', 'error');
      }
    } catch (error) {
      this.showStatus('抓取失敗: ' + error.message, 'error');
    }
  }

  async scrapeAndSave() {
    if (!this.notionToken || !this.databaseId) {
      this.showStatus('請先設定 Notion Token 和 Database ID', 'error');
      return;
    }

    try {
      document.getElementById('scrapeBtn').disabled = true;
      this.showStatus('正在抓取資料...', '');

      // 抓取職缺資料
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!this.isLinkedInJobPage(tab.url)) {
        this.showStatus('請在 LinkedIn 職缺頁面使用此功能', 'error');
        return;
      }

      // 確保 content script 已載入
      await this.ensureContentScriptLoaded(tab.id);
      
      const response = await this.sendMessageWithRetry(tab.id, { action: 'scrapeJob' });
      
      if (!response || !response.success) {
        throw new Error('無法抓取職缺資料');
      }

      let jobData = response.data;
      console.log('🔍 原始抓取資料:', jobData);

      // 如果有設定 AI，使用 AI 分析優化資料
      if (this.aiApiKey && this.aiModel) {
        this.showStatus('正在使用 AI 分析職缺資料...', '');
        
        try {
          const aiAnalysis = await this.analyzeJobWithAI(jobData);
          console.log('🤖 AI 分析結果:', aiAnalysis);
          
          // 合併原始資料和 AI 分析結果
          jobData = this.mergeJobDataWithAI(jobData, aiAnalysis);
          console.log('📊 合併後的資料:', jobData);
          
          this.showStatus('AI 分析完成，正在上傳到 Notion...', '');
        } catch (aiError) {
          console.error('AI 分析失敗:', aiError);
          this.showStatus('AI 分析失敗，使用原始資料上傳...', '');
          // 繼續使用原始資料，不中斷流程
        }
      } else {
        this.showStatus('資料抓取成功，正在上傳到 Notion...', '');
      }

      // 上傳到 Notion
      await this.uploadToNotion(jobData);
      
      const successMessage = this.aiApiKey && this.aiModel ? 
        '✅ 職缺已成功分析並儲存到 Notion！' : 
        '✅ 職缺已成功儲存到 Notion！';
      
      this.showStatus(successMessage, 'success');

    } catch (error) {
      this.showStatus('❌ 操作失敗: ' + error.message, 'error');
    } finally {
      document.getElementById('scrapeBtn').disabled = false;
    }
  }

  // 新增：截斷文字以符合 Notion API 限制
  truncateText(text, maxLength = 1950) { // 更保守的限制，留更多緩衝空間
    if (!text || text.length <= maxLength) {
      return text;
    }
    
    const suffix = '\n\n... (內容已截斷，請查看原始連結)';
    const availableLength = maxLength - suffix.length; // 確保加上後綴後不超過限制
    
    // 截斷到可用長度
    let truncated = text.substring(0, availableLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    
    // 如果找到句點或換行，在那裡截斷（但只有在不會太短的情況下）
    if (lastPeriod > availableLength * 0.7) {
      truncated = text.substring(0, lastPeriod + 1);
    } else if (lastNewline > availableLength * 0.7) {
      truncated = text.substring(0, lastNewline);
    }
    
    const result = truncated + suffix;
    console.log(`📏 Truncated text length: ${result.length} (limit: ${maxLength})`);
    return result;
  }

  async uploadToNotion(jobData) {
    // 先檢查原始內容長度
    console.log('📊 Original content lengths:');
    console.log(`Description: ${(jobData.description || '').length} chars`);
    console.log(`Requirements: ${(jobData.requirements || '').length} chars`);
    console.log(`Benefits: ${(jobData.benefits || '').length} chars`);
    console.log(`Title: ${(jobData.title || '').length} chars`);
    console.log(`Company: ${(jobData.company || '').length} chars`);
    console.log(`Location: ${(jobData.location || '').length} chars`);
    
    // 保留原始內容，由 createTextBlocks 處理分割
    const description = jobData.description || '無描述';
    const requirements = jobData.requirements || '請查看工作描述';
    const benefits = jobData.benefits || '請查看工作描述';
    
    console.log('📝 Original content lengths:');
    console.log(`Description: ${description.length} chars`);
    console.log(`Requirements: ${requirements.length} chars`);
    console.log(`Benefits: ${benefits.length} chars`);
    
    // 找出最長的內容
    const contents = [
      { name: 'Description', length: description.length },
      { name: 'Requirements', length: requirements.length },
      { name: 'Benefits', length: benefits.length }
    ];
    const longest = contents.reduce((prev, current) => (prev.length > current.length) ? prev : current);
    console.log(`🏆 Longest content: ${longest.name} (${longest.length} chars)`);
    
    // 智能分割文字內容，方便用戶快速閱讀
    const createTextBlocks = (text, maxLength = 1800, title = '') => {
      if (!text || text.length <= maxLength) {
        return [{ 
          object: "block", 
          type: "paragraph", 
          paragraph: { rich_text: [{ text: { content: text || '' } }] } 
        }];
      }
      
      const blocks = [];
      
      // 如果有標題，先添加標題提示
      if (title) {
        blocks.push({
          object: "block",
          type: "paragraph",
          paragraph: { 
            rich_text: [{ 
              text: { content: `📄 ${title} (內容較長，已分段顯示)` },
              annotations: { italic: true, color: "gray" }
            }] 
          }
        });
      }
      
      let remaining = text;
      let partNum = 1;
      
      while (remaining.length > 0) {
        let chunk = remaining.substring(0, maxLength);
        
        // 智能分割：優先在自然斷點處分割
        if (remaining.length > maxLength) {
          // 1. 優先在段落間分割（雙換行）
          const doubleLine = chunk.lastIndexOf('\n\n');
          // 2. 其次在句子結尾分割
          const lastPeriod = chunk.lastIndexOf('. ');
          const lastExclamation = chunk.lastIndexOf('! ');
          const lastQuestion = chunk.lastIndexOf('? ');
          // 3. 再次在單換行處分割
          const lastNewline = chunk.lastIndexOf('\n');
          // 4. 最後在空格處分割
          const lastSpace = chunk.lastIndexOf(' ');
          
          let splitPoint = -1;
          
          if (doubleLine > maxLength * 0.5) {
            splitPoint = doubleLine + 2;
          } else if (lastPeriod > maxLength * 0.6 || lastExclamation > maxLength * 0.6 || lastQuestion > maxLength * 0.6) {
            splitPoint = Math.max(lastPeriod, lastExclamation, lastQuestion) + 2;
          } else if (lastNewline > maxLength * 0.7) {
            splitPoint = lastNewline + 1;
          } else if (lastSpace > maxLength * 0.8) {
            splitPoint = lastSpace + 1;
          }
          
          if (splitPoint > 0) {
            chunk = remaining.substring(0, splitPoint);
          }
        }
        
        // 為續篇添加標記
        if (partNum > 1) {
          blocks.push({
            object: "block",
            type: "paragraph",
            paragraph: { 
              rich_text: [{ 
                text: { content: `--- 第 ${partNum} 部分 ---` },
                annotations: { bold: true, color: "blue" }
              }] 
            }
          });
        }
        
        blocks.push({
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ text: { content: chunk.trim() } }] }
        });
        
        remaining = remaining.substring(chunk.length).trim();
        partNum++;
        
        // 安全措施：避免無限循環，但允許更多段落
        if (partNum > 10) {
          blocks.push({
            object: "block",
            type: "callout",
            callout: {
              icon: { emoji: "⚠️" },
              rich_text: [{ text: { content: `內容過長，已顯示前 ${partNum-1} 段。剩餘 ${remaining.length} 字符已省略。` } }]
            }
          });
          break;
        }
      }
      
      return blocks;
    };

    const notionPage = {
      parent: { database_id: this.databaseId },
      properties: {
        "職位名稱": {
          title: [{ text: { content: (jobData.title || '未知職位').substring(0, 2000) } }]
        },
        "公司": {
          rich_text: [{ text: { content: (jobData.company || '未知公司').substring(0, 2000) } }]
        },
        "地點": {
          rich_text: [{ text: { content: (jobData.location || '未知').substring(0, 2000) } }]
        },
        "薪資": {
          rich_text: [{ text: { content: (jobData.salary || '未提供').substring(0, 2000) } }]
        },
        "工作類型": {
          select: { name: this.cleanSelectValue(jobData.jobType || '未指定') }
        },
        
        // AI 分析欄位
        "職責": {
          rich_text: [{ text: { content: this.truncateText(jobData.職責 || '', 1900) } }]
        },
        "必備技能": {
          rich_text: [{ text: { content: this.truncateText(jobData.必備技能 || '', 1900) } }]
        },
        "加分技能": {
          rich_text: [{ text: { content: this.truncateText(jobData.加分技能 || '', 1900) } }]
        },
        "工具框架": {
          rich_text: [{ text: { content: this.truncateText(jobData.工具框架 || '', 1900) } }]
        },
        "最低經驗年數": {
          number: jobData.最低經驗年數 || null
        },
        "經驗等級": {
          select: jobData.經驗等級 ? { name: this.cleanSelectValue(jobData.經驗等級) } : null
        },
        "學歷要求": {
          select: jobData.學歷要求 ? { name: this.cleanSelectValue(jobData.學歷要求) } : null
        },
        "語言要求": {
          rich_text: [{ text: { content: this.truncateText(jobData.語言要求 || '', 1900) } }]
        },
        "軟技能": {
          rich_text: [{ text: { content: this.truncateText(jobData.軟技能 || '', 1900) } }]
        },
        "產業領域": {
          rich_text: [{ text: { content: this.truncateText(jobData.產業領域 || '', 1900) } }]
        },
        "福利亮點": {
          rich_text: [{ text: { content: this.truncateText(jobData.福利亮點 || '', 1900) } }]
        },
        
        // 原有欄位
        "原始經驗要求": {
          rich_text: [{ text: { content: (jobData.experience || '未指定').substring(0, 2000) } }]
        },
        "狀態": {
          select: { name: '待申請' }
        },
        "連結": {
          url: jobData.url
        },
        "抓取時間": {
          date: { start: jobData.scrapedAt.split('T')[0] }
        },
        "優先級": {
          select: { name: '中' }
        },
        
        // AI 處理標記
        "AI 處理": {
          checkbox: jobData.aiProcessed || false
        },
        "AI 模型": {
          rich_text: [{ text: { content: jobData.aiModel ? `${jobData.aiProvider}:${jobData.aiModel}` : '' } }]
        }
      },
      children: [
        // AI 分析在前面（如果有的話）
        ...(jobData.aiProcessed ? [
          {
            object: "block",
            type: "heading_1",
            heading_1: {
              rich_text: [{ 
                text: { content: "🤖 AI Structured Analysis" },
                annotations: { color: "blue", bold: true }
              }]
            }
          },
          {
            object: "block",
            type: "callout",
            callout: {
              icon: { emoji: "🎯" },
              rich_text: [{ text: { content: `This job posting has been analyzed by ${jobData.aiProvider}'s ${jobData.aiModel} model to extract structured information for resume matching.` } }]
            }
          },
          
          ...(jobData.職責 ? [
            {
              object: "block",
              type: "heading_3",
              heading_3: {
                rich_text: [{ text: { content: "🎯 Key Responsibilities" } }]
              }
            },
            ...createTextBlocks(jobData.職責, 1800, 'Key Responsibilities')
          ] : []),
          
          ...(jobData.必備技能 ? [
            {
              object: "block",
              type: "heading_3",
              heading_3: {
                rich_text: [{ text: { content: "⚡ Required Skills" } }]
              }
            },
            ...createTextBlocks(jobData.必備技能, 1800, 'Required Skills')
          ] : []),
          
          ...(jobData.加分技能 ? [
            {
              object: "block",
              type: "heading_3",
              heading_3: {
                rich_text: [{ text: { content: "✨ Preferred Skills" } }]
              }
            },
            ...createTextBlocks(jobData.加分技能, 1800, 'Preferred Skills')
          ] : []),
          
          ...(jobData.工具框架 ? [
            {
              object: "block",
              type: "heading_3",
              heading_3: {
                rich_text: [{ text: { content: "🛠️ Tools & Frameworks" } }]
              }
            },
            ...createTextBlocks(jobData.工具框架, 1800, 'Tools & Frameworks')
          ] : []),
          
          {
            object: "block",
            type: "divider",
            divider: {}
          }
        ] : []),
        
        // 原文內容在後面
        {
          object: "block",
          type: "heading_1",
          heading_1: {
            rich_text: [{ text: { content: "📋 Original Job Posting" } }]
          }
        },
        
        {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [{ text: { content: "📄 Job Description" } }]
          }
        },
        ...createTextBlocks(jobData.aiProcessed && jobData.原始描述 ? jobData.原始描述 : description, 1800, 'Job Description'),
        
        {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [{ text: { content: "📌 Requirements" } }]
          }
        },
        ...createTextBlocks(requirements, 1800, 'Requirements'),
        
        {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [{ text: { content: "🎁 Benefits" } }]
          }
        },
        ...createTextBlocks(benefits, 1800, 'Benefits')
      ]
    };

    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify(notionPage)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Notion API 錯誤: ${error.message || response.statusText}`);
    }

    return await response.json();
  }

  showPreview(data) {
    const preview = document.getElementById('preview');
    preview.className = 'preview';
    preview.innerHTML = `
      <strong>職位:</strong> ${data.title}<br>
      <strong>公司:</strong> ${data.company}<br>
      <strong>地點:</strong> ${data.location}<br>
      <strong>薪資:</strong> ${data.salary}<br>
      <strong>類型:</strong> ${data.jobType}<br>
      <strong>經驗:</strong> ${data.experience}<br>
      <strong>描述:</strong> ${data.description.substring(0, 200)}...
    `;
  }

  // 自動建立 Notion 資料庫
  async createJobDatabase() {
    const token = document.getElementById('notionToken').value;
    
    if (!token) {
      this.showStatus('請先填入 Notion Integration Token', 'error');
      return;
    }

    try {
      document.getElementById('createDbBtn').disabled = true;
      this.showStatus('正在建立 Notion 資料庫...', '');

      // 首先獲取 workspace 中的頁面
      const pagesResponse = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify({
          filter: {
            value: "page",
            property: "object"
          }
        })
      });

      if (!pagesResponse.ok) {
        throw new Error('無法獲取 Notion 頁面列表');
      }

      const pagesData = await pagesResponse.json();
      
      // 選擇第一個可用的頁面作為父頁面
      let parentPageId = null;
      if (pagesData.results && pagesData.results.length > 0) {
        parentPageId = pagesData.results[0].id;
      } else {
        // 如果沒有找到頁面，嘗試建立一個新頁面
        const newPageResponse = await this.createJobTrackingPage(token);
        parentPageId = newPageResponse.id;
      }

      // 建立資料庫
      const databaseResponse = await fetch('https://api.notion.com/v1/databases', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify({
          parent: {
            type: "page_id",
            page_id: parentPageId
          },
          title: [
            {
              type: "text",
              text: {
                content: "LinkedIn 職缺追蹤"
              }
            }
          ],
          properties: {
            "職位名稱": { title: {} },
            "公司": { rich_text: {} },
            "地點": { rich_text: {} },
            "薪資": { rich_text: {} },
            "工作類型": {
              select: {
                options: [
                  { name: "全職", color: "blue" },
                  { name: "兼職", color: "green" },
                  { name: "合約", color: "yellow" },
                  { name: "遠程", color: "purple" },
                  { name: "混合", color: "orange" }
                ]
              }
            },
            
            // AI 分析欄位
            "職責": { rich_text: {} },
            "必備技能": { rich_text: {} },
            "加分技能": { rich_text: {} },
            "工具框架": { rich_text: {} },
            "最低經驗年數": { number: {} },
            "經驗等級": {
              select: {
                options: [
                  { name: "Junior", color: "green" },
                  { name: "Mid-level", color: "yellow" },
                  { name: "Senior", color: "orange" },
                  { name: "Lead", color: "red" },
                  { name: "不限", color: "gray" }
                ]
              }
            },
            "學歷要求": {
              select: {
                options: [
                  { name: "不限", color: "gray" },
                  { name: "高中", color: "blue" },
                  { name: "專科", color: "green" },
                  { name: "Bachelor", color: "yellow" },
                  { name: "Master", color: "orange" },
                  { name: "PhD", color: "red" }
                ]
              }
            },
            "語言要求": { rich_text: {} },
            "軟技能": { rich_text: {} },
            "產業領域": { rich_text: {} },
            "福利亮點": { rich_text: {} },
            
            // 原有欄位
            "原始經驗要求": { rich_text: {} },
            "狀態": {
              select: {
                options: [
                  { name: "待申請", color: "gray" },
                  { name: "已申請", color: "blue" },
                  { name: "面試中", color: "yellow" },
                  { name: "已拒絕", color: "red" },
                  { name: "已錄取", color: "green" }
                ]
              }
            },
            "連結": { url: {} },
            "抓取時間": { date: {} },
            "優先級": {
              select: {
                options: [
                  { name: "高", color: "red" },
                  { name: "中", color: "yellow" },
                  { name: "低", color: "gray" }
                ]
              }
            },
            
            // AI 處理標記
            "AI 處理": { checkbox: {} },
            "AI 模型": { rich_text: {} }
          }
        })
      });

      if (!databaseResponse.ok) {
        const error = await databaseResponse.json();
        throw new Error(`建立資料庫失敗: ${error.message || databaseResponse.statusText}`);
      }

      const databaseData = await databaseResponse.json();
      
      // 自動填入資料庫 ID
      document.getElementById('databaseId').value = databaseData.id;
      this.databaseId = databaseData.id;
      
      // 儲存設定
      await chrome.storage.sync.set({
        notionToken: token,
        databaseId: databaseData.id
      });

      this.showStatus('✅ 資料庫建立成功！已自動填入 Database ID', 'success');

    } catch (error) {
      this.showStatus('❌ 建立失敗: ' + error.message, 'error');
    } finally {
      document.getElementById('createDbBtn').disabled = false;
    }
  }

  // 建立求職追蹤頁面
  async createJobTrackingPage(token) {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        parent: {
          type: "workspace",
          workspace: true
        },
        properties: {
          title: {
            title: [
              {
                text: {
                  content: "求職追蹤中心"
                }
              }
            ]
          }
        },
        children: [
          {
            object: "block",
            type: "heading_1",
            heading_1: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: "🚀 求職追蹤中心"
                  }
                }
              ]
            }
          },
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: "使用 LinkedIn Job Scraper 自動建立的求職追蹤頁面"
                  }
                }
              ]
            }
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error('無法建立求職追蹤頁面');
    }

    return await response.json();
  }

  // 檢查是否為 LinkedIn 職缺頁面
  isLinkedInJobPage(url) {
    console.log('Checking if LinkedIn job page:', url);
    const isValid = url && (
      url.includes('linkedin.com/jobs/view/') ||
      url.includes('linkedin.com/jobs/collections/') ||
      url.includes('linkedin.com/jobs/search/') ||
      url.includes('linkedin.com/jobs/')  // 更寬鬆的檢查
    );
    console.log('Is valid LinkedIn job page:', isValid);
    return isValid;
  }

  // 確保 content script 已載入
  async ensureContentScriptLoaded(tabId) {
    console.log('Checking if content script is loaded...');
    try {
      // 嘗試發送 ping 消息檢查 content script 是否已載入
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      console.log('Content script ping response:', response);
      return true;
    } catch (error) {
      console.log('Content script not loaded, injecting...', error);
      try {
        // 如果失敗，注入 content script
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        });
        console.log('Content script injected successfully');
        // 等待一下讓 script 初始化
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 驗證注入是否成功
        const verifyResponse = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        console.log('Content script verification response:', verifyResponse);
        return true;
      } catch (injectError) {
        console.error('Failed to inject content script:', injectError);
        throw new Error('無法載入內容腳本，請重新整理頁面後再試');
      }
    }
  }

  // 帶重試機制的消息發送
  async sendMessageWithRetry(tabId, message, maxRetries = 3) {
    console.log('Sending message with retry:', message);
    for (let i = 0; i < maxRetries; i++) {
      try {
        console.log(`Attempt ${i + 1} of ${maxRetries}`);
        const response = await chrome.tabs.sendMessage(tabId, message);
        console.log('Message response:', response);
        return response;
      } catch (error) {
        console.error(`Attempt ${i + 1} failed:`, error);
        if (i === maxRetries - 1) {
          throw new Error(`通訊失敗：${error.message}`);
        }
        // 每次重試前等待遞增的時間
        console.log(`Waiting ${(i + 1) * 500}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, (i + 1) * 500));
        
        // 重試前確保 content script 已載入
        try {
          await this.ensureContentScriptLoaded(tabId);
        } catch (injectError) {
          console.error('Failed to ensure content script loaded:', injectError);
        }
      }
    }
  }

  // 調試頁面元素
  async debugPageElements() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      await this.ensureContentScriptLoaded(tab.id);
      const response = await this.sendMessageWithRetry(tab.id, { action: 'debug' });
      
      if (response && response.success) {
        this.showStatus('✅ 調試完成，請查看 Console', 'success');
      } else {
        this.showStatus('❌ 調試失敗', 'error');
      }
    } catch (error) {
      this.showStatus('❌ 調試錯誤: ' + error.message, 'error');
    }
  }

  // AI 設定相關方法
  async saveAiConfig() {
    const provider = document.getElementById('aiProvider').value;
    const apiKey = document.getElementById('aiApiKey').value;
    const model = document.getElementById('aiModel').value;

    if (!apiKey) {
      this.showStatus('請填入 AI API Key', 'error');
      return;
    }

    // 使用通用配置系統儲存
    await this.saveProviderConfig(provider, apiKey, model);
    
    // 儲存當前選擇的提供商
    await chrome.storage.sync.set({ aiProvider: provider });

    this.aiProvider = provider;
    this.aiApiKey = apiKey;
    this.aiModel = model;
    
    this.showStatus('AI 設定已儲存！', 'success');
  }

  // 通用的載入提供商配置
  loadProviderConfig(provider) {
    const config = this.aiConfigs[provider] || {};
    
    // 載入 API Key
    if (config.apiKey) {
      document.getElementById('aiApiKey').value = config.apiKey;
      this.aiApiKey = config.apiKey;
    } else {
      document.getElementById('aiApiKey').value = '';
      this.aiApiKey = '';
    }
    
    // 載入模型選項
    const modelSelect = document.getElementById('aiModel');
    modelSelect.innerHTML = '<option value="">選擇模型...</option>';
    
    if (config.models && config.models.length > 0) {
      config.models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        modelSelect.appendChild(option);
      });
      
      // 載入已選擇的模型
      if (config.selectedModel) {
        modelSelect.value = config.selectedModel;
        this.aiModel = config.selectedModel;
      }
    } else {
      this.aiModel = '';
    }
  }

  // 通用的儲存提供商配置
  async saveProviderConfig(provider, apiKey, selectedModel, models = null) {
    if (!this.aiConfigs) this.aiConfigs = {};
    if (!this.aiConfigs[provider]) this.aiConfigs[provider] = {};
    
    // 儲存配置
    if (apiKey) this.aiConfigs[provider].apiKey = apiKey;
    if (selectedModel) this.aiConfigs[provider].selectedModel = selectedModel;
    if (models) this.aiConfigs[provider].models = models;
    
    // 保存到 Chrome Storage
    await chrome.storage.sync.set({ aiConfigs: this.aiConfigs });
  }

  async onProviderChange() {
    const newProvider = document.getElementById('aiProvider').value;
    
    // 儲存當前提供商的設定
    await this.saveCurrentProviderConfig();
    
    // 切換到新提供商
    this.aiProvider = newProvider;
    this.loadProviderConfig(newProvider);
    
    // 儲存新的提供商選擇
    await chrome.storage.sync.set({ aiProvider: newProvider });
    
    this.showStatus(`已切換到 ${this.getProviderDisplayName(newProvider)}`, 'success');
  }

  // 儲存當前提供商的配置
  async saveCurrentProviderConfig() {
    const apiKey = document.getElementById('aiApiKey').value;
    const model = document.getElementById('aiModel').value;
    
    if (this.aiProvider && (apiKey || model)) {
      await this.saveProviderConfig(this.aiProvider, apiKey, model);
    }
  }

  // 獲取提供商顯示名稱
  getProviderDisplayName(provider) {
    const names = {
      'openai': 'OpenAI',
      'openrouter': 'OpenRouter',
      'anthropic': 'Anthropic',
      'google': 'Google AI',
      // 未來可以輕鬆添加更多提供商
    };
    return names[provider] || provider;
  }

  async loadModels() {
    const provider = document.getElementById('aiProvider').value;
    const apiKey = document.getElementById('aiApiKey').value;

    if (!apiKey) {
      this.showStatus('請先填入 API Key', 'error');
      return;
    }

    try {
      document.getElementById('loadModels').disabled = true;
      this.showStatus('正在載入模型列表...', '');

      let models = [];
      
      if (provider === 'openai') {
        models = await this.fetchOpenAIModels(apiKey);
      } else if (provider === 'openrouter') {
        models = await this.fetchOpenRouterModels(apiKey);
      }

      this.populateModelSelect(models);
      
      // 使用通用配置系統儲存模型列表
      await this.saveProviderConfig(provider, apiKey, null, models);
      
      this.showStatus(`已載入 ${models.length} 個模型`, 'success');

    } catch (error) {
      this.showStatus(`載入模型失敗: ${error.message}`, 'error');
    } finally {
      document.getElementById('loadModels').disabled = false;
    }
  }

  async fetchOpenAIModels(apiKey) {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`OpenAI API 錯誤: ${response.status}`);
    }

    const data = await response.json();
    
    // 篩選適合的模型（GPT 系列）
    return data.data
      .filter(model => model.id.includes('gpt'))
      .map(model => ({
        id: model.id,
        name: model.id
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async fetchOpenRouterModels(apiKey) {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API 錯誤: ${response.status}`);
    }

    const data = await response.json();
    
    return data.data
      .map(model => ({
        id: model.id,
        name: `${model.name || model.id} (${model.id})`
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  populateModelSelect(models) {
    const modelSelect = document.getElementById('aiModel');
    modelSelect.innerHTML = '<option value="">選擇模型...</option>';
    
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      modelSelect.appendChild(option);
    });
  }

  // AI 分析職缺資料
  async analyzeJobWithAI(jobData) {
    if (!this.aiApiKey || !this.aiModel) {
      throw new Error('請先設定 AI API Key 和模型');
    }

    const prompt = `
Analyze the following LinkedIn job posting and extract structured information for resume matching:

Job Title: ${jobData.title || ''}
Company: ${jobData.company || ''}
Location: ${jobData.location || ''}
Job Description: ${jobData.description || ''}

Analysis Guidelines:
- Required skills should include explicitly mentioned professional capabilities: programming languages, frameworks, testing skills, professional tools, certifications, etc.
- Testing-related requirements (unit tests, integration tests, E2E tests, testing, QA) belong to required skills
- Tools/frameworks include specific technical tools, software, platforms, systems
- Nice-to-have skills are mentioned with "would help", "nice to have", "bonus", "preferred", "plus", etc.
- Soft skills include communication, leadership, teamwork, problem-solving, innovation, etc.
- Carefully identify experience requirements with numbers and level descriptions
- For experience_level, use simple values: "Entry", "Junior", "Mid-level", "Senior", "Lead"
- For education_requirement, use simple values: "High School", "Associate", "Bachelor", "Master", "PhD", or empty string

Output in JSON format, use empty string if information doesn't exist:
{
  "responsibilities": "Main job responsibilities summary (within 100 words)",
  "required_skills": ["skill1", "skill2", "skill3"],
  "preferred_skills": ["skill1", "skill2"],
  "tools_frameworks": ["tool1", "tool2"],
  "min_experience_years": 3,
  "experience_level": "Senior",
  "education_requirement": "Bachelor",
  "language_requirements": ["English: Fluent"],
  "soft_skills": ["teamwork", "communication"],
  "industry_domains": ["SaaS", "Tech"],
  "benefits_highlights": ["remote work", "learning budget"]
}

Please ensure the output is valid JSON format without any other text.
`;

    try {
      let aiResponse;
      
      if (this.aiProvider === 'openai') {
        aiResponse = await this.callOpenAI(prompt);
      } else if (this.aiProvider === 'openrouter') {
        aiResponse = await this.callOpenRouter(prompt);
      }

      // 解析 AI 回應的 JSON
      const cleanResponse = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
      console.log('AI 回應:', cleanResponse);
      return JSON.parse(cleanResponse);

    } catch (error) {
      console.error('AI 分析失敗:', error);
      throw new Error(`AI 分析失敗: ${error.message}`);
    }
  }

  async callOpenAI(prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.aiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.aiModel,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API 錯誤: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async callOpenRouter(prompt) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.aiApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': chrome.runtime.getURL(''), // 擴展的 URL
        'X-Title': 'LinkedIn Job Scraper'
      },
      body: JSON.stringify({
        model: this.aiModel,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API 錯誤: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  // 清理 Notion select 字段值（移除逗號，截斷長度）
  cleanSelectValue(value) {
    if (!value) return '';
    return value
      .replace(/,/g, ' |') // 將逗號替換為 |
      .replace(/\s+/g, ' ') // 清理多重空格
      .trim()
      .substring(0, 100); // Notion select 限制 100 字符
  }

  // 合併原始資料和 AI 分析結果
  mergeJobDataWithAI(originalData, aiAnalysis) {
    return {
      // 保留原始的基本資料（已經很準確）
      title: originalData.title,
      company: originalData.company,
      location: originalData.location,
      url: originalData.url,
      scrapedAt: originalData.scrapedAt,
      
      // 使用 AI 分析的結構化資料
      職責: aiAnalysis.responsibilities || '',
      必備技能: Array.isArray(aiAnalysis.required_skills) ? aiAnalysis.required_skills.join(', ') : '',
      加分技能: Array.isArray(aiAnalysis.preferred_skills) ? aiAnalysis.preferred_skills.join(', ') : '',
      工具框架: Array.isArray(aiAnalysis.tools_frameworks) ? aiAnalysis.tools_frameworks.join(', ') : '',
      最低經驗年數: aiAnalysis.min_experience_years || 0,
      經驗等級: aiAnalysis.experience_level || '',
      學歷要求: aiAnalysis.education_requirement || '',
      語言要求: Array.isArray(aiAnalysis.language_requirements) ? aiAnalysis.language_requirements.join(', ') : '',
      軟技能: Array.isArray(aiAnalysis.soft_skills) ? aiAnalysis.soft_skills.join(', ') : '',
      產業領域: Array.isArray(aiAnalysis.industry_domains) ? aiAnalysis.industry_domains.join(', ') : '',
      福利亮點: Array.isArray(aiAnalysis.benefits_highlights) ? aiAnalysis.benefits_highlights.join(', ') : '',
      
      // 保留完整的原始資料
      原始描述: originalData.description || '',
      
      // 工作類型的智能判斷：優先使用原始資料，AI 分析作為補充
      jobType: originalData.jobType !== 'Not specified' ? originalData.jobType : aiAnalysis.工作類型 || 'Not specified',
      
      // 薪資資訊：保留原始資料
      salary: originalData.salary || 'Not provided',
      
      // 保留其他原始欄位
      experience: originalData.experience,
      postedDate: originalData.postedDate,
      
      // 新增 AI 處理標記
      aiProcessed: true,
      aiProvider: this.aiProvider,
      aiModel: this.aiModel
    };
  }

  // 折疊/展開設定區塊
  toggleSection(contentId, toggleId) {
    const content = document.getElementById(contentId);
    const toggle = document.getElementById(toggleId);
    
    const isActive = content.classList.contains('active');
    
    if (isActive) {
      content.classList.remove('active');
      toggle.classList.remove('active');
    } else {
      content.classList.add('active');
      toggle.classList.add('active');
    }
  }

  showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    
    if (type === 'success') {
      setTimeout(() => {
        status.textContent = '';
        status.className = '';
      }, 3000);
    }
  }
}

// 初始化擴展
new LinkedInJobExtension();