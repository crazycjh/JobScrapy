// background.js - Functional Programming Refactor

// Import external scripts
try {
  importScripts('logger.js');
  Logger.info('✅ logger.js loaded successfully');
  importScripts('env.js');
  Logger.info('✅ env.js loaded successfully');
  importScripts('notionOAuth.js');
  Logger.info('✅ NotionOAuth module imported successfully');
} catch (error) {
  Logger.error('❌ Failed to import a script:', error);
}

Logger.info('Background service worker loaded (Functional)');

// --- Pure Helper Functions ---

// 多語言欄位名稱對照表
const fieldNames = {
  zh_TW: {
    jobTitle: "職位名稱",
    company: "公司",
    location: "地點", 
    salary: "薪資",
    jobType: "工作類型",
    responsibilities: "職責",
    requiredSkills: "必備技能",
    preferredSkills: "加分技能",
    toolsFrameworks: "工具框架",
    minExperienceYears: "最低經驗年數",
    experienceLevel: "經驗等級",
    educationRequirement: "學歷要求",
    languageRequirements: "語言要求",
    softSkills: "軟技能",
    industryDomains: "產業領域",
    benefitsHighlights: "福利亮點",
    originalExperience: "原始經驗要求",
    status: "狀態",
    link: "連結",
    scrapeTime: "抓取時間",
    priority: "優先級",
    aiProcessed: "AI 處理",
    aiModel: "AI 模型",
    // 狀態選項
    statusPending: "待申請",
    statusApplied: "已申請",
    statusInterview: "面試中",
    statusAccepted: "已錄取",
    statusRejected: "已拒絕",
    statusNotSuitable: "不適合",
    // 優先級選項
    priorityHigh: "高",
    priorityMedium: "中",
    priorityLow: "低",
    // 工作類型選項
    jobTypeFullTime: "全職",
    jobTypePartTime: "兼職",
    jobTypeContract: "約聘",
    jobTypeInternship: "實習",
    jobTypeRemote: "遠距",
    // 內容標題
    aiAnalysisSummary: "🤖 AI 分析摘要",
    mainResponsibilities: "👔 主要職責",
    requiredSkillsTitle: "⚡ 必備技能",
    preferredSkillsTitle: "✨ 加分技能",
    toolsFrameworksTitle: "🛠️ 工具與框架",
    softSkillsTitle: "🤝 軟技能",
    benefitsHighlightsTitle: "🌟 福利亮點",
    aiProcessedBy: "✨ 此職缺已由 AI",
    analysisProcessed: "分析處理",
    jobDescription: "📄 Job Description",
    requirements: "📌 Requirements",
    benefits: "🎁 Benefits"
  },
  en: {
    jobTitle: "Job Title",
    company: "Company",
    location: "Location",
    salary: "Salary", 
    jobType: "Job Type",
    responsibilities: "Responsibilities",
    requiredSkills: "Required Skills",
    preferredSkills: "Preferred Skills",
    toolsFrameworks: "Tools & Frameworks",
    minExperienceYears: "Min Experience Years",
    experienceLevel: "Experience Level",
    educationRequirement: "Education Requirement",
    languageRequirements: "Language Requirements",
    softSkills: "Soft Skills",
    industryDomains: "Industry Domains",
    benefitsHighlights: "Benefits Highlights",
    originalExperience: "Original Experience",
    status: "Status",
    link: "Link",
    scrapeTime: "Scrape Time",
    priority: "Priority",
    aiProcessed: "AI Processed",
    aiModel: "AI Model",
    // 狀態選項
    statusPending: "Pending",
    statusApplied: "Applied",
    statusInterview: "Interview",
    statusAccepted: "Accepted", 
    statusRejected: "Rejected",
    statusNotSuitable: "Not Suitable",
    // 優先級選項
    priorityHigh: "High",
    priorityMedium: "Medium",
    priorityLow: "Low",
    // 工作類型選項
    jobTypeFullTime: "Full-time",
    jobTypePartTime: "Part-time",
    jobTypeContract: "Contract",
    jobTypeInternship: "Internship",
    jobTypeRemote: "Remote",
    // 內容標題
    aiAnalysisSummary: "🤖 AI Analysis Summary",
    mainResponsibilities: "👔 Main Responsibilities",
    requiredSkillsTitle: "⚡ Required Skills",
    preferredSkillsTitle: "✨ Preferred Skills",
    toolsFrameworksTitle: "🛠️ Tools & Frameworks",
    softSkillsTitle: "🤝 Soft Skills",
    benefitsHighlightsTitle: "🌟 Benefits Highlights",
    aiProcessedBy: "✨ This job was analyzed by AI",
    analysisProcessed: "processed",
    jobDescription: "📄 Job Description",
    requirements: "📌 Requirements",
    benefits: "🎁 Benefits"
  }
};

const truncateText = (text, maxLength = 1950) => {
  if (!text || text.length <= maxLength) return text;
  const suffix = '\n\n... (內容已截斷，請查看原始連結)';
  const availableLength = maxLength - suffix.length;
  let truncated = text.substring(0, availableLength);
  const lastPeriod = truncated.lastIndexOf('.');
  if (lastPeriod > availableLength * 0.8) {
    truncated = truncated.substring(0, lastPeriod + 1);
  }
  return truncated + suffix;
};

const cleanSelectValue = (value) => {
  if (!value) return '';
  return value.replace(/,/g, ' | ').replace(/\s+/g, ' ').trim().substring(0, 100);
};

const createTextBlocks = (text, maxLength = 1800) => {
  if (!text || text.length <= maxLength) {
    return [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: text || '' } }] } }];
  }

  const blocks = [];
  let remaining = text;
  while (remaining.length > 0) {
    let chunk = remaining.substring(0, maxLength);
    // Smartly split chunk at a natural break
    remaining = remaining.substring(chunk.length);
    blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: chunk } }] } });
    if (blocks.length >= 90) { // Notion block limit is 100
        blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: '... content truncated due to length.' } }] } });
        break;
    }
  }
  return blocks;
};

const createNotionPagePayload = (jobData, config, language = 'zh_TW') => {
  const { description = '無描述', requirements = '', benefits = '' } = jobData;
  const fields = fieldNames[language];

  const baseProperties = {
    [fields.jobTitle]: { title: [{ text: { content: truncateText(jobData.title || '未知職位', 2000) } }] },
    [fields.company]: { rich_text: [{ text: { content: truncateText(jobData.company || '未知公司', 2000) } }] },
    [fields.location]: { rich_text: [{ text: { content: truncateText(jobData.location || '未知', 2000) } }] },
    [fields.salary]: { rich_text: [{ text: { content: truncateText(jobData.salary || '未提供', 2000) } }] },
    [fields.jobType]: { select: { name: cleanSelectValue(jobData.jobType || '未指定') } },
    [fields.originalExperience]: { rich_text: [{ text: { content: truncateText(jobData.experience || '未指定', 2000) } }] },
    [fields.status]: { select: { name: fields.statusPending } },
    [fields.link]: { url: jobData.url },
    [fields.scrapeTime]: { date: { start: (jobData.scrapedAt || new Date().toISOString()).split('T')[0] } },
    [fields.priority]: { select: { name: fields.priorityMedium } },
    [fields.aiProcessed]: { checkbox: jobData.aiProcessed || false },
    [fields.aiModel]: { rich_text: [{ text: { content: jobData.aiModel ? `${jobData.aiProvider}:${jobData.aiModel}` : '' } }] }
  };

  const aiProperties = jobData.aiProcessed ? {
    [fields.responsibilities]: { rich_text: [{ text: { content: truncateText(jobData.職責 || '') } }] },
    [fields.requiredSkills]: { rich_text: [{ text: { content: truncateText(jobData.必備技能 || '') } }] },
    [fields.preferredSkills]: { rich_text: [{ text: { content: truncateText(jobData.加分技能 || '') } }] },
    [fields.toolsFrameworks]: { rich_text: [{ text: { content: truncateText(jobData.工具框架 || '') } }] },
    [fields.minExperienceYears]: { number: jobData.最低經驗年數 || null },
    [fields.experienceLevel]: { select: jobData.經驗等級 ? { name: cleanSelectValue(jobData.經驗等級) } : null },
    [fields.educationRequirement]: { select: jobData.學歷要求 ? { name: cleanSelectValue(jobData.學歷要求) } : null },
    [fields.languageRequirements]: { rich_text: [{ text: { content: truncateText(jobData.語言要求 || '') } }] },
    [fields.softSkills]: { rich_text: [{ text: { content: truncateText(jobData.軟技能 || '') } }] },
    [fields.industryDomains]: { rich_text: [{ text: { content: truncateText(jobData.產業領域 || '') } }] },
    [fields.benefitsHighlights]: { rich_text: [{ text: { content: truncateText(jobData.福利亮點 || '') } }] },
  } : {};

  const children = [
      ...(jobData.aiProcessed ? [
          { object: "block", type: "heading_2", heading_2: { rich_text: [{ text: { content: fields.aiAnalysisSummary } }] } },
          ...(jobData.職責 ? [
              { object: "block", type: "heading_3", heading_3: { rich_text: [{ text: { content: fields.mainResponsibilities } }] } },
              ...createTextBlocks(jobData.職責)
          ] : []),
          ...(jobData.必備技能 ? [
              { object: "block", type: "heading_3", heading_3: { rich_text: [{ text: { content: fields.requiredSkillsTitle } }] } },
              ...createTextBlocks(jobData.必備技能)
          ] : []),
          ...(jobData.加分技能 ? [
              { object: "block", type: "heading_3", heading_3: { rich_text: [{ text: { content: fields.preferredSkillsTitle } }] } },
              ...createTextBlocks(jobData.加分技能)
          ] : []),
          ...(jobData.工具框架 ? [
              { object: "block", type: "heading_3", heading_3: { rich_text: [{ text: { content: fields.toolsFrameworksTitle } }] } },
              ...createTextBlocks(jobData.工具框架)
          ] : []),
          ...(jobData.軟技能 ? [
              { object: "block", type: "heading_3", heading_3: { rich_text: [{ text: { content: fields.softSkillsTitle } }] } },
              ...createTextBlocks(jobData.軟技能)
          ] : []),
          ...(jobData.福利亮點 ? [
              { object: "block", type: "heading_3", heading_3: { rich_text: [{ text: { content: fields.benefitsHighlightsTitle } }] } },
              ...createTextBlocks(jobData.福利亮點)
          ] : []),
          { object: "block", type: "paragraph", paragraph: { 
              rich_text: [{ 
                  text: { content: `${fields.aiProcessedBy} (${jobData.aiProvider}:${jobData.aiModel}) ${fields.analysisProcessed}` },
                  annotations: { italic: true, color: "gray" }
              }] 
          }},
          { object: "block", type: "divider", divider: {} }
      ] : []),
      { object: "block", type: "heading_2", heading_2: { rich_text: [{ text: { content: fields.jobDescription } }] } },
      ...createTextBlocks(description),
      ...(requirements ? [
          { object: "block", type: "heading_2", heading_2: { rich_text: [{ text: { content: fields.requirements } }] } },
          ...createTextBlocks(requirements)
      ] : []),
      ...(benefits ? [
          { object: "block", type: "heading_2", heading_2: { rich_text: [{ text: { content: fields.benefits } }] } },
          ...createTextBlocks(benefits)
      ] : []),
  ];

  return {
    parent: { database_id: config.databaseId },
    properties: { ...baseProperties, ...aiProperties },
    children: children
  };
};

const createAIPrompt = (jobData) => `
Analyze the following job posting and extract structured information for resume matching:

Job Title: ${jobData.title || ''}
Company: ${jobData.company || ''}
Location: ${jobData.location || ''}
Job Description: ${jobData.description || ''}

Analysis Guidelines:
- Required skills should include explicitly mentioned professional capabilities.
- Soft skills include communication, leadership, teamwork, etc.
- For experience_level, use simple values: "Entry", "Junior", "Mid-level", "Senior", "Lead".
- For education_requirement, use simple values: "High School", "Associate", "Bachelor", "Master", "PhD", or empty string.

Output in JSON format, use empty string if information doesn't exist:
{
  "responsibilities": "Main job responsibilities summary (within 100 words)",
  "required_skills": ["skill1", "skill2"],
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

const mergeJobDataWithAI = (originalData, aiAnalysis, aiConfig) => ({
  ...originalData,
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
  aiProcessed: true,
  aiProvider: aiConfig.aiProvider,
  aiModel: aiConfig.aiModel
});

// --- API Interaction Functions (Impure) ---

const callApi = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`API Error: ${response.status} - ${errorData.error?.message || errorData.message || response.statusText}`);
  }
  return response.json();
};

const callOpenAI = (prompt, aiConfig) => {
  return callApi('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${aiConfig.aiApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: aiConfig.aiModel, messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 1000 })
  });
};

const callOpenRouter = (prompt, aiConfig) => {
  return callApi('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${aiConfig.aiApiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': chrome.runtime.getURL(''), 'X-Title': 'Universal Job Scraper' },
    body: JSON.stringify({ model: aiConfig.aiModel, messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 1000 })
  });
};

const detectDatabaseLanguage = async (databaseId, token, fallbackLanguage = 'zh_TW') => {
  try {
    Logger.debug(`🔍 偵測資料庫語言: ${databaseId.substring(0, 8)}...`);
    
    const database = await callApi(`https://api.notion.com/v1/databases/${databaseId}`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28' 
      }
    });
    
    const properties = database.properties;
    Logger.verbose('📋 資料庫現有欄位:', Object.keys(properties));
    
    // 檢查中文關鍵欄位
    const chineseFields = ['職位名稱', '公司', '學歷要求', '必備技能', '狀態'];
    const hasChineseFields = chineseFields.some(field => properties[field]);
    
    // 檢查英文關鍵欄位  
    const englishFields = ['Job Title', 'Company', 'Education Requirement', 'Required Skills', 'Status'];
    const hasEnglishFields = englishFields.some(field => properties[field]);
    
    if (hasChineseFields) {
      Logger.debug('✅ 偵測到中文資料庫');
      return 'zh_TW';
    }
    
    if (hasEnglishFields) {
      Logger.debug('✅ 偵測到英文資料庫');
      return 'en';
    }
    
    Logger.warn('⚠️ 未偵測到明確語言，使用預設語言:', fallbackLanguage);
    return fallbackLanguage;
    
  } catch (error) {
    Logger.error('❌ 偵測資料庫語言失敗:', error);
    Logger.debug('🔄 回退到預設語言:', fallbackLanguage);
    return fallbackLanguage;
  }
};

const uploadToNotion = async (jobData, config, requestLanguage = 'zh_TW') => {
  // 偵測資料庫實際語言
  const detectedLanguage = await detectDatabaseLanguage(
    config.databaseId, 
    config.notionToken, 
    requestLanguage
  );
  
  Logger.debug(`📝 使用語言: ${detectedLanguage} (請求語言: ${requestLanguage})`);
  
  const payload = createNotionPagePayload(jobData, config, detectedLanguage);
  return callApi('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.notionToken}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
    body: JSON.stringify(payload)
  });
};

// --- Message Handlers ---

const handleGetConfig = (request, sendResponse) => {
  chrome.storage.sync.get(request.keys || [], (result) => {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
    } else {
      sendResponse({ success: true, data: result });
    }
  });
};

const handleGetLocalStorage = (request, sendResponse) => {
  chrome.storage.local.get(request.keys || [], (result) => {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
    } else {
      sendResponse({ success: true, data: result });
    }
  });
};

const handleSetLocalStorage = (request, sendResponse) => {
  chrome.storage.local.set(request.data || {}, () => {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
    } else {
      sendResponse({ success: true });
    }
  });
};

const handleNotionUpload = async (request, sendResponse) => {
  try {
    const requestLanguage = request.language || 'zh_TW';
    Logger.debug('🚀 開始上傳到 Notion，請求語言:', requestLanguage);
    
    const result = await uploadToNotion(request.jobData, request.config, requestLanguage);
    
    Logger.info('✅ Notion 上傳成功');
    sendResponse({ success: true, result });
  } catch (error) {
    Logger.error('❌ Background upload error:', error);
    sendResponse({ success: false, error: error.message });
  }
};

const handleAIAnalysis = async (request, sendResponse) => {
  try {
    if (!request.aiConfig?.aiApiKey || !request.aiConfig?.aiModel) {
      throw new Error('AI API Key or Model is not configured.');
    }
    const prompt = createAIPrompt(request.jobData);
    const aiCall = request.aiConfig.aiProvider === 'openai' ? callOpenAI : callOpenRouter;
    const aiResult = await aiCall(prompt, request.aiConfig);
    const aiContent = aiResult.choices[0].message.content;
    const cleanResponse = aiContent.replace(/```json\n?|\n?```/g, '').trim();
    const aiAnalysis = JSON.parse(cleanResponse);
    const finalJobData = mergeJobDataWithAI(request.jobData, aiAnalysis, request.aiConfig);
    sendResponse({ success: true, result: finalJobData });
  } catch (error) {
    Logger.error('Background AI analysis error:', error);
    sendResponse({ success: false, error: error.message });
  }
};

// 內部函數：載入 Notion 頁面（不依賴消息系統）
const loadNotionPagesInternal = async (token) => {
  Logger.debug('🚀 [Background] loadNotionPagesInternal 開始執行');
  Logger.debug('📝 [Background] Token 長度:', token?.length);
  
  if (!token) {
    Logger.error('❌ [Background] Token 缺失');
    throw new Error('Notion token is required');
  }

  Logger.debug('📡 [Background] 準備調用 Notion Search API...');
  const apiPayload = {
    filter: { property: 'object', value: 'page' },
    sort: {
      direction: 'descending',
      timestamp: 'last_edited_time'
    }
  };
  Logger.verbose('📋 [Background] API Payload:', apiPayload);

  const result = await callApi('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify(apiPayload)
  });

  Logger.info('✅ [Background] Notion API 調用成功');
  Logger.verbose('🔍 [Background] API 原始回應結構:', {
    hasResults: !!result.results,
    resultsLength: result.results?.length,
    hasNextCursor: !!result.next_cursor,
    resultKeys: Object.keys(result)
  });
  Logger.debug('📊 [Background] Notion API 返回的頁面數量:', result.results?.length);

  Logger.debug('🔄 [Background] 開始過濾頁面...');
  
  const filteredPages = result.results.filter(page => {
    Logger.verbose('🔍 [Background] 檢查頁面:', {
      id: page.id.substring(0, 8) + '...',
      object: page.object,
      archived: page.archived,
      parent: page.parent?.type,
      propertiesKeys: Object.keys(page.properties || {})
    });
    
    // 只處理頁面對象，排除資料庫
    if (page.object !== 'page') {
      Logger.debug('❌ [Background] 跳過非頁面對象:', page.object);
      return false;
    }
    
    // 排除已歸檔的頁面
    if (page.archived) {
      Logger.debug('❌ [Background] 跳過已歸檔頁面');
      return false;
    }
    
    // 檢查是否有有效的標題
    const hasValidTitle = page.properties?.title?.title?.[0]?.text?.content ||
                         page.properties?.Name?.title?.[0]?.text?.content ||
                         Object.values(page.properties || {}).some(prop => 
                           prop.type === 'title' && prop.title?.[0]?.text?.content);
    
    Logger.verbose('🔍 [Background] 標題檢查結果:', {
      id: page.id.substring(0, 8) + '...',
      hasValidTitle: hasValidTitle,
      titleContent: page.properties?.title?.title?.[0]?.text?.content,
      nameContent: page.properties?.Name?.title?.[0]?.text?.content
    });
    
    if (!hasValidTitle) {
      Logger.debug('❌ [Background] 跳過無效標題頁面');
      return false;
    }
    
    Logger.verbose('✅ [Background] 頁面通過過濾');
    return true;
  });
  
  Logger.debug(`📊 [Background] 過濾結果: ${filteredPages.length}/${result.results.length} 頁面通過過濾`);
  
  const pages = filteredPages
    .map(page => {
      // 更完善的標題解析
      let title = 'Untitled';
      
      try {
        // 方法 1: 標準頁面標題
        if (page.properties?.title?.title?.[0]?.text?.content) {
          title = page.properties.title.title[0].text.content;
        }
        // 方法 2: 如果是資料庫類型的頁面
        else if (page.properties?.Name?.title?.[0]?.text?.content) {
          title = page.properties.Name.title[0].text.content;
        }
        // 方法 3: 檢查其他可能的標題欄位
        else if (page.properties) {
          const titleProp = Object.values(page.properties).find(prop => 
            prop.type === 'title' && prop.title?.[0]?.text?.content
          );
          if (titleProp) {
            title = titleProp.title[0].text.content;
          }
        }
        
        // 如果還是沒有標題，使用頁面 ID 的一部分
        if (!title || title === '') {
          title = `頁面 ${page.id.substring(0, 8)}`;
        }
      } catch (error) {
        Logger.warn('解析頁面標題失敗:', error);
        title = `頁面 ${page.id.substring(0, 8)}`;
      }

      const parentType = page.parent?.type;
      
      Logger.verbose('📄 處理頁面:', {
        id: page.id.substring(0, 8) + '...',
        title: title,
        parent: parentType,
        object: page.object,
        created: page.created_time,
        lastEdited: page.last_edited_time
      });
      
      // 添加父頁面類型標識
      let displayTitle = title;
      if (parentType === 'workspace') {
        displayTitle = `📁 ${title} (Workspace)`;
      } else if (parentType === 'page_id') {
        displayTitle = `📄 ${title} (子頁面)`;
      }
      
      return {
        id: page.id,
        title: displayTitle,
        originalTitle: title,
        parentType: parentType,
        url: page.url,
        lastEditedTime: page.last_edited_time,
        // 添加排序權重
        priority: parentType === 'workspace' ? 1 : 2
      };
    })
    .sort((a, b) => {
      // 優先級排序：workspace 頁面優先，然後按最後編輯時間
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return new Date(b.lastEditedTime) - new Date(a.lastEditedTime);
    })
    .slice(0, 15); // 限制最多顯示 15 個頁面
  
  Logger.info('✅ [Background] 最終處理完成，頁面總數:', pages.length);
  Logger.verbose('📋 [Background] 最終頁面列表:', pages.map(p => ({
    id: p.id.substring(0, 8) + '...',
    title: p.originalTitle,
    parent: p.parentType,
    priority: p.priority
  })));

  return pages;
};

// 消息處理器：載入 Notion 頁面（使用內部函數）
const handleLoadNotionPages = async (request, sendResponse) => {
  Logger.debug('🚀 [Background] handleLoadNotionPages 開始執行');
  Logger.debug('📝 [Background] 收到的請求:', { hasToken: !!request.token, tokenPrefix: request.token?.substring(0, 10) });
  
  try {
    const pages = await loadNotionPagesInternal(request.token);
    
    Logger.debug('📤 [Background] 準備發送回應...');
    sendResponse({ success: true, data: pages });
    Logger.debug('✅ [Background] 回應已發送');
    
  } catch (error) {
    Logger.error('❌ [Background] 載入頁面發生錯誤:', error);
    Logger.error('🔍 [Background] 錯誤詳細信息:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    sendResponse({ success: false, error: error.message });
    Logger.debug('📤 [Background] 錯誤回應已發送');
  }
};

const createNotionDatabasePayload = (parentPageId, databaseName, language = 'zh_TW') => {
  const fields = fieldNames[language];
  
  return {
    parent: { type: "page_id", page_id: parentPageId },
    title: [{ type: "text", text: { content: databaseName } }],
    properties: {
      [fields.jobTitle]: { title: {} },
      [fields.company]: { rich_text: {} },
      [fields.location]: { rich_text: {} },
      [fields.salary]: { rich_text: {} },
      [fields.jobType]: { select: { options: [
        { name: fields.jobTypeFullTime, color: "blue" },
        { name: fields.jobTypePartTime, color: "green" },
        { name: fields.jobTypeContract, color: "orange" },
        { name: fields.jobTypeInternship, color: "yellow" },
        { name: fields.jobTypeRemote, color: "purple" }
      ]}},
      [fields.responsibilities]: { rich_text: {} },
      [fields.requiredSkills]: { rich_text: {} },
      [fields.preferredSkills]: { rich_text: {} },
      [fields.toolsFrameworks]: { rich_text: {} },
      [fields.minExperienceYears]: { number: {} },
      [fields.experienceLevel]: { select: { options: [
        { name: "Entry", color: "green" },
        { name: "Junior", color: "blue" },
        { name: "Mid-level", color: "orange" },
        { name: "Senior", color: "red" },
        { name: "Lead", color: "purple" }
      ]}},
      [fields.educationRequirement]: { select: { options: [
        { name: "High School", color: "gray" },
        { name: "Associate", color: "blue" },
        { name: "Bachelor", color: "green" },
        { name: "Master", color: "orange" },
        { name: "PhD", color: "red" }
      ]}},
      [fields.languageRequirements]: { rich_text: {} },
      [fields.softSkills]: { rich_text: {} },
      [fields.industryDomains]: { rich_text: {} },
      [fields.benefitsHighlights]: { rich_text: {} },
      [fields.originalExperience]: { rich_text: {} },
      [fields.status]: { select: { options: [
        { name: fields.statusPending, color: "yellow" },
        { name: fields.statusApplied, color: "blue" },
        { name: fields.statusInterview, color: "orange" },
        { name: fields.statusAccepted, color: "green" },
        { name: fields.statusRejected, color: "red" },
        { name: fields.statusNotSuitable, color: "gray" }
      ]}},
      [fields.link]: { url: {} },
      [fields.scrapeTime]: { date: {} },
      [fields.priority]: { select: { options: [
        { name: fields.priorityHigh, color: "red" },
        { name: fields.priorityMedium, color: "orange" },
        { name: fields.priorityLow, color: "gray" }
      ]}},
      [fields.aiProcessed]: { checkbox: {} },
      [fields.aiModel]: { rich_text: {} }
    }
  };
};

// 內部函數：載入 Notion 資料庫（不依賴消息系統）
const loadNotionDatabasesInternal = async (token, parentPageId = null) => {
  Logger.debug('🚀 [Background] loadNotionDatabasesInternal 開始執行');
  
  if (!token) {
    throw new Error('Notion token is required');
  }

  Logger.debug('📡 [Background] 搜尋 Notion 資料庫...', parentPageId ? `父頁面: ${parentPageId.substring(0, 8)}...` : '所有資料庫');
  
  const result = await callApi('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify({
      filter: { property: 'object', value: 'database' },
      sort: {
        direction: 'descending',
        timestamp: 'last_edited_time'
      }
    })
  });

  Logger.debug('📊 [Background] 找到資料庫數量:', result.results?.length);

  let databases = result.results
    .filter(db => !db.archived); // 排除已歸檔的資料庫
  
  // 如果指定了父頁面，則只返回該頁面下的資料庫
  if (parentPageId) {
    databases = databases.filter(db => {
      const dbParentId = db.parent?.page_id;
      Logger.verbose('🔍 [Background] 檢查資料庫父頁面:', {
        dbId: db.id.substring(0, 8) + '...',
        dbParentId: dbParentId?.substring(0, 8) + '...',
        targetParentId: parentPageId.substring(0, 8) + '...',
        match: dbParentId === parentPageId
      });
      return dbParentId === parentPageId;
    });
    Logger.debug(`📍 [Background] 篩選後的資料庫數量 (父頁面 ${parentPageId.substring(0, 8)}...):`, databases.length);
  }

  databases = databases
    .map(db => {
      const title = db.title?.[0]?.text?.content || `資料庫 ${db.id.substring(0, 8)}`;
      
      // 檢查資料庫相容性
      const compatibility = checkDatabaseCompatibility(db.properties);
      
      Logger.verbose('🔍 [Background] 資料庫分析:', {
        id: db.id.substring(0, 8) + '...',
        title: title,
        compatibility: compatibility.level,
        missingFields: compatibility.missingFields
      });

      return {
        id: db.id,
        title: title,
        url: db.url,
        lastEditedTime: db.last_edited_time,
        compatibility: compatibility,
        properties: Object.keys(db.properties),
        parentPageId: db.parent?.page_id
      };
    })
    .sort((a, b) => {
      // 優先顯示相容性高的資料庫
      if (a.compatibility.level !== b.compatibility.level) {
        const order = { 'perfect': 0, 'good': 1, 'partial': 2, 'poor': 3 };
        return order[a.compatibility.level] - order[b.compatibility.level];
      }
      return new Date(b.lastEditedTime) - new Date(a.lastEditedTime);
    });

  Logger.info('✅ [Background] 資料庫處理完成，返回數量:', databases.length);
  return databases;
};

// 消息處理器：載入 Notion 資料庫（使用內部函數）
const handleLoadNotionDatabases = async (request, sendResponse) => {
  Logger.debug('🚀 [Background] handleLoadNotionDatabases 開始執行');
  
  try {
    const databases = await loadNotionDatabasesInternal(request.token, request.parentPageId);
    sendResponse({ success: true, data: databases });

  } catch (error) {
    Logger.error('❌ [Background] 載入資料庫錯誤:', error);
    sendResponse({ success: false, error: error.message });
  }
};

const checkDatabaseCompatibility = (properties) => {
  const requiredFields = {
    zh_TW: ['職位名稱', '公司', '狀態'],
    en: ['Job Title', 'Company', 'Status']
  };
  
  const importantFields = {
    zh_TW: ['地點', '薪資', '連結', 'AI 處理'],
    en: ['Location', 'Salary', 'Link', 'AI Processed']
  };

  // 檢查中文和英文欄位
  const propertyNames = Object.keys(properties);
  
  let language = 'unknown';
  let foundRequired = 0;
  let foundImportant = 0;
  let missingFields = [];

  // 檢查中文欄位
  const zhRequired = requiredFields.zh_TW.filter(field => propertyNames.includes(field));
  const zhImportant = importantFields.zh_TW.filter(field => propertyNames.includes(field));
  
  // 檢查英文欄位  
  const enRequired = requiredFields.en.filter(field => propertyNames.includes(field));
  const enImportant = importantFields.en.filter(field => propertyNames.includes(field));

  if (zhRequired.length >= enRequired.length) {
    language = 'zh_TW';
    foundRequired = zhRequired.length;
    foundImportant = zhImportant.length;
    missingFields = requiredFields.zh_TW.filter(field => !propertyNames.includes(field));
  } else {
    language = 'en';
    foundRequired = enRequired.length;
    foundImportant = enImportant.length;
    missingFields = requiredFields.en.filter(field => !propertyNames.includes(field));
  }

  // 判斷相容性等級
  let level;
  if (foundRequired === requiredFields[language].length && foundImportant >= 3) {
    level = 'perfect';
  } else if (foundRequired === requiredFields[language].length) {
    level = 'good';
  } else if (foundRequired >= 2) {
    level = 'partial';
  } else {
    level = 'poor';
  }

  return {
    level,
    language,
    foundRequired,
    foundImportant,
    missingFields,
    totalFields: propertyNames.length
  };
};

const handleCreateNotionDatabase = async (request, sendResponse) => {
  try {
    if (!request.token || !request.parentPageId) {
      throw new Error('Token and parent page ID are required');
    }

    const language = request.language || 'zh_TW';
    const databaseName = request.databaseName || (language === 'zh_TW' ? '求職追蹤資料庫' : 'Job Tracking Database');
    const payload = createNotionDatabasePayload(request.parentPageId, databaseName, language);

    const result = await callApi('https://api.notion.com/v1/databases', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${request.token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify(payload)
    });

    sendResponse({ 
      success: true, 
      databaseId: result.id,
      databaseUrl: result.url,
      title: databaseName
    });
  } catch (error) {
    Logger.error('Create database error:', error);
    sendResponse({ success: false, error: error.message });
  }
};

// === OAuth API Handlers ===

// 內部函數：交換授權碼為 Token（不依賴消息系統）
const exchangeCodeForTokenInternal = async (code, redirectUri) => {
  Logger.debug('🔄 [Background] exchangeCodeForTokenInternal 開始執行');
  
  if (!code || !redirectUri) {
    throw new Error('Authorization code and redirect URI are required');
  }

  const tokenUrl = 'https://api.notion.com/v1/oauth/token';
  
  // 從 OAUTH_CONFIG 取得配置
  const { clientId, clientSecret } = OAUTH_CONFIG;
  
  Logger.debug('📡 [Background] 向 Notion API 發送 token 交換請求');
  Logger.debug('🔍 [Background] 使用 Basic Auth 格式');

  // 實際向 Notion API 發送請求
  // 根據 Notion 官方文檔，需要使用 Basic Auth + JSON 格式
  const credentials = btoa(`${clientId}:${clientSecret}`); // Base64 編碼
  
  const tokenRequestBody = {
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri
  };

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify(tokenRequestBody)
  });

  Logger.debug('📨 [Background] Notion API 回應狀態:', response.status, response.statusText);

  if (!response.ok) {
    const errorData = await response.json();
    Logger.error('❌ [Background] Notion API 錯誤回應:', errorData);
    throw new Error(`Token 交換失敗: ${errorData.error || response.statusText}`);
  }

  const tokenData = await response.json();
  Logger.info('✅ [Background] 成功從 Notion API 取得 Token');

  // 格式化回應資料
  const formattedData = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresIn: tokenData.expires_in || 3600,
    tokenType: tokenData.token_type,
    scope: tokenData.scope,
    workspaceId: tokenData.workspace_id,
    workspaceName: tokenData.workspace_name,
    workspaceIcon: tokenData.workspace_icon,
    botId: tokenData.bot_id,
    owner: tokenData.owner,
    expiresAt: Date.now() + ((tokenData.expires_in || 3600) * 1000)
  };

  Logger.debug('✅ [Background] Token 資料格式化完成');
  
  // 儲存 Token 到 storage
  const saveData = {
    notionOAuthToken: formattedData.accessToken,
    notionRefreshToken: formattedData.refreshToken,
    notionTokenExpiresAt: formattedData.expiresAt,
    notionWorkspaceId: formattedData.workspaceId,
    notionWorkspaceName: formattedData.workspaceName,
    notionWorkspaceIcon: formattedData.workspaceIcon,
    notionBotId: formattedData.botId,
    notionOAuthOwner: formattedData.owner,
    lastOAuthTime: new Date().toISOString(),
    authMethod: 'oauth',
    // 為了向後相容，也設定舊的 token 欄位
    notionToken: formattedData.accessToken,
    // 清除手動設定的標記
    manualTokenMode: false
  };

  await chrome.storage.sync.set(saveData);
  Logger.debug('💾 [Background] Token 資料已儲存到 storage');
  
  return formattedData;
};

// 消息處理器：交換授權碼為 Token（使用內部函數）
const handleExchangeOAuthToken = async (request, sendResponse) => {
  try {
    Logger.debug('🔄 [Background] 處理 OAuth Token 交換請求');
    
    const tokenData = await exchangeCodeForTokenInternal(request.code, request.redirectUri);
    sendResponse({ success: true, data: tokenData });

  } catch (error) {
    Logger.error('❌ [Background] OAuth Token 交換失敗:', error);
    sendResponse({ success: false, error: error.message });
  }
};

const handleRefreshOAuthToken = async (request, sendResponse) => {
  try {
    Logger.debug('🔄 [Background] 處理 OAuth Token 刷新請求');
    
    if (!request.refreshToken) {
      throw new Error('Refresh token is required');
    }

    const tokenUrl = 'https://api.notion.com/v1/oauth/token';
    
    // 從 OAUTH_CONFIG 取得配置
    const { clientId, clientSecret } = OAUTH_CONFIG;
    
    // 根據 Notion 官方文檔，refresh token 也需要使用 Basic Auth + JSON 格式
    const credentials = btoa(`${clientId}:${clientSecret}`); // Base64 編碼
    
    const refreshRequestBody = {
      grant_type: 'refresh_token',
      refresh_token: request.refreshToken
    };

    Logger.debug('📡 [Background] 向 Notion API 發送 token 刷新請求');

    // 實際向 Notion API 發送請求
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify(refreshRequestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Token 刷新失敗: ${errorData.error || response.statusText}`);
    }

    const tokenData = await response.json();
    Logger.info('✅ [Background] 成功從 Notion API 刷新 Token');

    // 格式化回應資料
    const formattedData = {
      accessToken: tokenData.access_token,
      expiresIn: tokenData.expires_in || 3600,
      tokenType: tokenData.token_type,
      expiresAt: Date.now() + ((tokenData.expires_in || 3600) * 1000)
    };

    Logger.debug('✅ [Background] Token 刷新資料格式化完成');
    sendResponse({ success: true, data: formattedData });

  } catch (error) {
    Logger.error('❌ [Background] OAuth Token 刷新失敗:', error);
    sendResponse({ success: false, error: error.message });
  }
};

const handleValidateOAuthToken = async (request, sendResponse) => {
  try {
    Logger.debug('🔍 [Background] 驗證 OAuth Token');
    
    if (!request.token) {
      throw new Error('Token is required for validation');
    }

    // 透過呼叫 Notion API 驗證 token
    const response = await callApi('https://api.notion.com/v1/users/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${request.token}`,
        'Notion-Version': '2022-06-28'
      }
    });

    Logger.debug('✅ [Background] Token 驗證成功');
    sendResponse({ success: true, valid: true, data: response });

  } catch (error) {
    Logger.error('❌ [Background] Token 驗證失敗:', error);
    sendResponse({ success: false, valid: false, error: error.message });
  }
};

const handleStartOAuthFlow = async (request, sendResponse) => {
  try {
    Logger.info('🚀 [Background] 開始完整 OAuth 流程');
    Logger.verbose('🔍 [Background] 請求內容:', JSON.stringify(request, null, 2));
    
    // 在 background 中直接執行完整 OAuth 流程
    const { clientId } = OAUTH_CONFIG;
    const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/oauth2`;
    
    // 建立授權 URL
    const authUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${clientId}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    Logger.debug('📡 [Background] 啟動 OAuth 授權流程');
    Logger.verbose('🔗 [Background] 授權 URL:', authUrl);
    
    // 執行 OAuth 授權
    const redirectUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      }, (redirectUrl) => {
        if (chrome.runtime.lastError) {
          Logger.error('❌ [Background] OAuth 授權錯誤:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!redirectUrl) {
          reject(new Error('用戶取消授權或授權失敗'));
        } else {
          resolve(redirectUrl);
        }
      });
    });

    Logger.debug('📨 [Background] 授權回調 URL:', redirectUrl);

    // 從回調 URL 中提取授權碼
    const url = new URL(redirectUrl);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    
    if (error) {
      throw new Error(`授權錯誤: ${error}`);
    }
    
    if (!code) {
      throw new Error('未能從回調 URL 中提取授權碼');
    }

    Logger.debug('🔑 [Background] 取得授權碼:', code.substring(0, 10) + '...');

    // 交換授權碼為 Access Token
    Logger.debug('🔄 [Background] 交換授權碼為 Access Token');
    const tokenData = await exchangeCodeForTokenInternal(code, redirectUri);
    
    Logger.info('✅ [Background] OAuth 授權完成，開始自動設定');

    // 執行自動設定工作流程
    const setupResult = await executeAutoSetupWorkflow(tokenData.accessToken);
    
    Logger.info('🎉 [Background] OAuth 和自動設定完成');
    
    sendResponse({ 
      success: true, 
      message: 'OAuth 和自動設定完成',
      result: setupResult
    });

  } catch (error) {
    Logger.error('❌ [Background] OAuth 初始化失敗:', error);
    Logger.error('❌ [Background] 錯誤堆棧:', error.stack);
    sendResponse({ success: false, error: error.message });
  }
};

const handleProcessOAuthToken = async (request, sendResponse) => {
  try {
    Logger.debug('🎯 [Background] 處理 OAuth Token 和自動設定');
    Logger.verbose('🔍 [Background] 收到請求:', JSON.stringify({
      action: request.action,
      hasTokenData: !!request.tokenData,
      tokenDataKeys: request.tokenData ? Object.keys(request.tokenData) : []
    }, null, 2));
    
    const { tokenData } = request;
    if (!tokenData || !tokenData.accessToken) {
      Logger.error('❌ [Background] 無效的 token 資料:', tokenData);
      throw new Error('無效的 token 資料');
    }

    Logger.info('✅ [Background] Token 驗證通過，開始自動設定流程');
    Logger.debug('🔧 [Background] Token 資料摘要:', {
      hasAccessToken: !!tokenData.accessToken,
      accessTokenLength: tokenData.accessToken?.length,
      workspaceName: tokenData.workspaceName,
      workspaceId: tokenData.workspaceId
    });

    // 執行自動設定流程（在 background 中）
    Logger.debug('⚙️ [Background] 開始執行 executeAutoSetupWorkflow');
    let setupResult;
    try {
      setupResult = await executeAutoSetupWorkflow(tokenData.accessToken);
      Logger.info('✅ [Background] executeAutoSetupWorkflow 完成:', setupResult);
    } catch (setupError) {
      Logger.error('❌ [Background] executeAutoSetupWorkflow 失敗:', setupError);
      throw new Error(`自動設定失敗: ${setupError.message}`);
    }
    
    // 儲存完成狀態
    Logger.debug('💾 [Background] 儲存 OAuth 狀態到 chrome.storage');
    const storageData = {
      oauthAuthorized: true,
      authMethod: 'oauth',
      workspaceInfo: {
        name: tokenData.workspaceName || 'Notion Workspace',
        icon: tokenData.workspaceIcon,
        id: tokenData.workspaceId
      },
      autoSetupCompleted: true,
      autoSetupTime: new Date().toISOString()
    };
    
    try {
      await chrome.storage.sync.set(storageData);
      Logger.debug('✅ [Background] 狀態儲存成功');
    } catch (storageError) {
      Logger.error('❌ [Background] 狀態儲存失敗:', storageError);
      throw new Error(`狀態儲存失敗: ${storageError.message}`);
    }

    Logger.info('🎉 [Background] OAuth 後續處理完全完成');
    
    const response = { 
      success: true, 
      data: { 
        tokenData, 
        setupResult,
        message: 'OAuth 後續處理完成' 
      } 
    };
    
    Logger.debug('📤 [Background] 發送成功回應:', JSON.stringify({
      success: response.success,
      hasSetupResult: !!response.data.setupResult,
      setupMode: response.data.setupResult?.mode,
      message: response.data.message
    }, null, 2));
    
    sendResponse(response);

  } catch (error) {
    Logger.error('❌ [Background] OAuth 後續處理失敗:', error);
    Logger.error('❌ [Background] 錯誤堆棧:', error.stack);
    
    const errorResponse = { success: false, error: error.message };
    Logger.debug('📤 [Background] 發送錯誤回應:', errorResponse);
    
    sendResponse(errorResponse);
  }
};

const handleClearOAuthData = async (request, sendResponse) => {
  try {
    Logger.debug('🗑️ [Background] 清除 OAuth 資料');
    
    // 清除 OAuth 相關的儲存資料
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
    ]);

    Logger.info('✅ [Background] OAuth 資料已清除');
    sendResponse({ success: true });

  } catch (error) {
    Logger.error('❌ [Background] 清除 OAuth 資料失敗:', error);
    sendResponse({ success: false, error: error.message });
  }
};

const messageHandlers = {
  getConfig: handleGetConfig,
  getLocalStorage: handleGetLocalStorage,
  setLocalStorage: handleSetLocalStorage,
  uploadToNotion: handleNotionUpload,
  analyzeWithAI: handleAIAnalysis,
  loadNotionPages: handleLoadNotionPages,
  loadNotionDatabases: handleLoadNotionDatabases,
  createNotionDatabase: handleCreateNotionDatabase,
  // OAuth 相關處理器
  startOAuthFlow: handleStartOAuthFlow,
  processOAuthToken: handleProcessOAuthToken,
  exchangeOAuthToken: handleExchangeOAuthToken,
  refreshOAuthToken: handleRefreshOAuthToken,
  validateOAuthToken: handleValidateOAuthToken,
  clearOAuthData: handleClearOAuthData,
  openPopup: (_req, sendResponse) => { chrome.action.openPopup(); sendResponse({success: true}); },
};

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const handler = messageHandlers[request.action];
  if (handler) {
    handler(request, sendResponse);
    return true; // Indicate async response
  } 
  // Fallback for non-async handlers or unknown actions
  sendResponse({ success: false, error: 'Unknown action' });
  return false;
});

// --- Other Listeners ---

chrome.runtime.onInstalled.addListener(() => {
  Logger.info('Universal Job Scraper extension installed.');
});

const isSupportedJobPage = (url) => {
  if (!url) return false;
  const supportedPatterns = [
    /linkedin\.com\/jobs\/(view\/\d+|search\/.*currentJobId=\d+)/,
    /104\.com\.tw\/job\//,
    /1111\.com\.tw\/job\//,
    /yourator\.co\/jobs\/\w+/,
    /cakeresume\.com\/jobs\//
  ];
  return supportedPatterns.some(pattern => pattern.test(url));
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && isSupportedJobPage(tab.url)) {
    Logger.debug(`Supported job page loaded (Tab ID: ${tabId}): ${tab.url}`);
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab.url || !isSupportedJobPage(tab.url)) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon-128.png',
      title: 'Universal Job Scraper',
      message: 'Please use this extension on a supported job posting page.'
    });
  }
});

// === OAuth Auto Setup Workflow (Background Version) ===

/**
 * 在 background script 中執行自動設定工作流程
 * 這樣即使 popup 關閉也不會中斷
 */
const executeAutoSetupWorkflow = async (accessToken) => {
  try {
    Logger.info('🔧 [Background] 開始自動設定工作流程');
    Logger.debug('🔍 [Background] Access Token 長度:', accessToken?.length);

    // 載入授權的頁面
    Logger.debug('📋 [Background] 步驟1: 載入 Notion 頁面');
    let pages;
    try {
      pages = await loadNotionPagesInternal(accessToken);
      Logger.debug('📄 [Background] 頁面載入結果:', {
        pageCount: pages?.length || 0
      });
    } catch (pagesError) {
      Logger.error('❌ [Background] 載入頁面失敗:', pagesError);
      throw new Error(`載入頁面失敗: ${pagesError.message}`);
    }
    
    if (!pages || pages.length === 0) {
      Logger.error('❌ [Background] 沒有找到可用的頁面');
      throw new Error('沒有找到可用的頁面');
    }
    Logger.info('📄 [Background] 找到', pages.length, '個可用頁面');
    Logger.verbose('📋 [Background] 頁面列表:', pages.map(p => ({ 
      id: p.id, 
      title: p.title, 
      parentType: p.parent?.type 
    })));

    // 智慧選擇父頁面（優先選擇 workspace 根頁面）
    Logger.debug('🎯 [Background] 步驟2: 智慧選擇父頁面');
    let parentPage;
    try {
      parentPage = selectBestParentPage(pages);
      Logger.info('📌 [Background] 自動選擇父頁面:', {
        id: parentPage.id,
        title: parentPage.title,
        parentType: parentPage.parent?.type
      });
    } catch (selectError) {
      Logger.error('❌ [Background] 選擇父頁面失敗:', selectError);
      throw new Error(`選擇父頁面失敗: ${selectError.message}`);
    }

    // 嘗試找到相容的資料庫
    Logger.debug('🗄️ [Background] 步驟3: 載入現有資料庫');
    let databases;
    try {
      databases = await loadNotionDatabasesInternal(accessToken, parentPage.id);
      Logger.debug('📊 [Background] 資料庫載入結果:', {
        databaseCount: databases?.length || 0
      });
    } catch (dbError) {
      Logger.error('❌ [Background] 載入資料庫失敗:', dbError);
      throw new Error(`載入資料庫失敗: ${dbError.message}`);
    }

    if (databases.length > 0) {
      Logger.info('📊 [Background] 找到', databases.length, '個資料庫，儲存設定供用戶選擇');
      Logger.verbose('🗄️ [Background] 資料庫列表:', databases.map(db => ({
        id: db.id,
        title: db.title
      })));
      
      // 儲存基本配置（不包含資料庫 ID）
      const storageData = {
        notionToken: accessToken,
        selectedParentPageId: parentPage.id,
        availableDatabases: databases,
        parentPageInfo: parentPage
      };
      
      try {
        await chrome.storage.sync.set(storageData);
        Logger.debug('✅ [Background] 用戶選擇模式配置已儲存');
      } catch (storageError) {
        Logger.error('❌ [Background] 儲存配置失敗:', storageError);
        throw new Error(`儲存配置失敗: ${storageError.message}`);
      }

      return {
        parentPage,
        databases,
        mode: 'user-select'
      };
    }

    // 沒有資料庫，自動建立新的
    Logger.debug('❓ [Background] 步驟4: 需要建立新的職缺追蹤資料庫');
    
    const defaultName = '職缺追蹤資料庫'; // 在 background 中使用默認中文名稱
    Logger.info('🏗️ [Background] 開始建立資料庫:', defaultName);
    
    let createResult;
    try {
      createResult = await handleCreateNotionDatabase({
        token: accessToken,
        parentId: parentPage.id,
        databaseName: defaultName
      });
      Logger.debug('🗄️ [Background] 資料庫建立結果:', {
        success: createResult.success,
        databaseId: createResult.database?.id,
        error: createResult.error
      });
    } catch (createError) {
      Logger.error('❌ [Background] 建立資料庫失敗:', createError);
      throw new Error(`建立資料庫失敗: ${createError.message}`);
    }

    if (!createResult.success) {
      throw new Error('建立資料庫失敗: ' + createResult.error);
    }

    const targetDatabase = createResult.database;
    Logger.info('✅ [Background] 自動建立資料庫成功:', {
      id: targetDatabase.id,
      title: targetDatabase.title
    });

    // 儲存完整配置
    const finalStorageData = {
      notionToken: accessToken,
      databaseId: targetDatabase.id,
      selectedParentPageId: parentPage.id,
      databaseName: targetDatabase.title,
      parentPageInfo: parentPage
    };
    
    try {
      await chrome.storage.sync.set(finalStorageData);
      Logger.debug('✅ [Background] 自動建立模式配置已儲存');
    } catch (storageError) {
      Logger.error('❌ [Background] 儲存最終配置失敗:', storageError);
      throw new Error(`儲存最終配置失敗: ${storageError.message}`);
    }

    Logger.info('🎉 [Background] 自動設定工作流程完全完成');
    
    return {
      parentPage,
      database: targetDatabase,
      mode: 'auto-created'
    };

  } catch (error) {
    Logger.error('❌ [Background] 自動設定工作流程失敗:', error);
    Logger.error('❌ [Background] 工作流程錯誤堆棧:', error.stack);
    throw error;
  }
};

/**
 * 智慧選擇最佳父頁面
 */
const selectBestParentPage = (pages) => {
  // 優先選擇 workspace 根頁面（添加空值檢查）
  let bestPage = pages.find(page => page.parent?.type === 'workspace');
  
  if (!bestPage) {
    // 如果沒有 workspace 根頁面，選擇第一個可用頁面
    bestPage = pages[0];
  }
  
  return bestPage;
};
