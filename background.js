// 背景服務工作器 (Service Worker)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openPopup') {
    // 開啟 popup 窗口（這個事件通常由 content script 觸發）
    try {
      chrome.action.openPopup();
      sendResponse({ success: true });
    } catch (error) {
      console.error('Failed to open popup:', error);
      sendResponse({ success: false, error: error.message });
    }
  } else if (request.action === 'getConfig') {
    // 獲取配置資料
    chrome.storage.sync.get(request.keys || [], (result) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, data: result });
      }
    });
    return true; // 保持消息通道開放以進行異步回應
  } else if (request.action === 'getLocalStorage') {
    // 獲取本地存儲資料
    chrome.storage.local.get(request.keys || [], (result) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, data: result });
      }
    });
    return true; // 保持消息通道開放以進行異步回應
  } else if (request.action === 'setLocalStorage') {
    // 設定本地存儲資料
    chrome.storage.local.set(request.data || {}, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true });
      }
    });
    return true; // 保持消息通道開放以進行異步回應
  } else if (request.action === 'uploadToNotion') {
    // 處理 Notion 上傳請求
    handleNotionUpload(request.jobData, request.config)
      .then(result => {
        sendResponse({ success: true, result: result });
      })
      .catch(error => {
        console.error('Background upload error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道開放以進行異步回應
  } else if (request.action === 'analyzeWithAI') {
    // 處理 AI 分析請求
    handleAIAnalysis(request.jobData, request.aiConfig)
      .then(result => {
        sendResponse({ success: true, result: result });
      })
      .catch(error => {
        console.error('Background AI analysis error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道開放以進行異步回應
  }
});

// 輔助函數：截斷文字
function truncateText(text, maxLength = 1950) {
  if (!text || text.length <= maxLength) {
    return text;
  }
  
  const suffix = '\n\n... (內容已截斷，請查看原始連結)';
  const availableLength = maxLength - suffix.length;
  
  let truncated = text.substring(0, availableLength);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastPeriod > availableLength * 0.8) {
    truncated = truncated.substring(0, lastPeriod + 1);
  } else if (lastSpace > availableLength * 0.9) {
    truncated = truncated.substring(0, lastSpace);
  }
  
  return truncated + suffix;
}

// 輔助函數：清理 Select 欄位值
function cleanSelectValue(value) {
  if (!value) return '';
  return value
    .replace(/,/g, ' |')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);
}

// 處理 Notion 上傳的完整函數（從 popup.js 移植）
async function handleNotionUpload(jobData, config) {
  try {
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
    const requirements = jobData.requirements || '';
    const benefits = jobData.benefits || '';
    
    // 智能分割文字內容
    const createTextBlocks = (text, maxLength = 1800, title = '') => {
      if (!text || text.length <= maxLength) {
        return [{ 
          object: "block", 
          type: "paragraph", 
          paragraph: { rich_text: [{ text: { content: text || '' } }] } 
        }];
      }
      
      const blocks = [];
      
      if (title) {
        blocks.push({
          object: "block",
          type: "paragraph",
          paragraph: { 
            rich_text: [{ 
              text: { content: ` (內容較長，已分段顯示)` },
              annotations: { italic: true, color: "gray" }
            }] 
          }
        });
      }
      
      let remaining = text;
      let partNum = 1;
      
      while (remaining.length > 0) {
        let chunk = remaining.substring(0, maxLength);
        
        if (remaining.length > maxLength) {
          const doubleLine = chunk.lastIndexOf('\n\n');
          const lastPeriod = chunk.lastIndexOf('. ');
          const lastExclamation = chunk.lastIndexOf('! ');
          const lastQuestion = chunk.lastIndexOf('? ');
          const lastNewline = chunk.lastIndexOf('\n');
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
        
        const paragraphs = chunk.split('\n\n').filter(para => para.trim().length > 0);
        paragraphs.forEach(para => {
          const trimmedPara = para.trim();
          if (trimmedPara) {
            blocks.push({
              object: "block",
              type: "paragraph",
              paragraph: { rich_text: [{ text: { content: trimmedPara } }] }
            });
          }
        });
        
        remaining = remaining.substring(chunk.length).trim();
        partNum++;
        
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
      parent: { database_id: config.databaseId },
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
          select: { name: cleanSelectValue(jobData.jobType || '未指定') }
        },
        
        // AI 分析欄位（僅在AI處理時添加）
        ...(jobData.aiProcessed ? {
          "職責": {
            rich_text: [{ text: { content: truncateText(jobData.職責 || '', 1900) } }]
          },
          "必備技能": {
            rich_text: [{ text: { content: truncateText(jobData.必備技能 || '', 1900) } }]
          },
          "加分技能": {
            rich_text: [{ text: { content: truncateText(jobData.加分技能 || '', 1900) } }]
          },
          "工具框架": {
            rich_text: [{ text: { content: truncateText(jobData.工具框架 || '', 1900) } }]
          },
          "最低經驗年數": {
            number: jobData.最低經驗年數 || null
          },
          "經驗等級": {
            select: jobData.經驗等級 ? { name: cleanSelectValue(jobData.經驗等級) } : null
          },
          "學歷要求": {
            select: jobData.學歷要求 ? { name: cleanSelectValue(jobData.學歷要求) } : null
          },
          "語言要求": {
            rich_text: [{ text: { content: truncateText(jobData.語言要求 || '', 1900) } }]
          },
          "軟技能": {
            rich_text: [{ text: { content: truncateText(jobData.軟技能 || '', 1900) } }]
          },
          "產業領域": {
            rich_text: [{ text: { content: truncateText(jobData.產業領域 || '', 1900) } }]
          },
          "福利亮點": {
            rich_text: [{ text: { content: truncateText(jobData.福利亮點 || '', 1900) } }]
          }
        } : {}),
        
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
          date: { start: jobData.scrapedAt ? jobData.scrapedAt.split('T')[0] : new Date().toISOString().split('T')[0] }
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
        
        // 只有AI處理時才顯示"Original Job Posting"標題
        ...(jobData.aiProcessed ? [
          {
            object: "block",
            type: "heading_1",
            heading_1: {
              rich_text: [{ text: { content: "📋 Original Job Posting" } }]
            }
          }
        ] : []),
        
        // Job Description (總是顯示)
        {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [{ text: { content: "📄 Job Description" } }]
          }
        },
        ...createTextBlocks(description, 1800, 'Job Description'),
        
        // Requirements (只在有內容時顯示)
        ...(requirements && requirements.trim() ? [
          {
            object: "block",
            type: "heading_2",
            heading_2: {
              rich_text: [{ text: { content: "📌 Requirements" } }]
            }
          },
          ...createTextBlocks(requirements, 1800, 'Requirements')
        ] : []),
        
        // Benefits (只在有內容時顯示)
        ...(benefits && benefits.trim() ? [
          {
            object: "block",
            type: "heading_2",
            heading_2: {
              rich_text: [{ text: { content: "🎁 Benefits" } }]
            }
          },
          ...createTextBlocks(benefits, 1800, 'Benefits')
        ] : [])
      ]
    };

    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify(notionPage)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Notion API 錯誤: ${errorData.message || response.statusText}`);
    }

    const result = await response.json();
    console.log('✅ Successfully uploaded to Notion:', result.id);
    return result;
    
  } catch (error) {
    console.error('❌ Notion upload failed:', error);
    throw error;
  }
}

// 擴展安裝時的初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('Universal Job Scraper 擴展已安裝');
});

// 檢查是否為支援的職缺頁面
function isSupportedJobPage(url) {
  if (!url) return false;
  
  const supportedPatterns = [
    /linkedin\.com\/jobs\/(view\/\d+|search\/.*currentJobId=\d+)/,
    /104\.com\.tw\/job\//,
    /1111\.com\.tw\/job\//,
    /yourator\.co\/jobs\/\w+/,
    /cakeresume\.com\/jobs\//
  ];
  
  return supportedPatterns.some(pattern => pattern.test(url));
}

// 監聽標籤頁更新，檢查是否為支援的職缺頁面
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && isSupportedJobPage(tab.url)) {
    console.log(`支援的職缺頁面已載入 (Tab ID: ${tabId}): ${tab.url}`);
  }
});

// 處理 AI 分析的函數
async function handleAIAnalysis(jobData, aiConfig) {
  try {
    if (!aiConfig.aiApiKey || !aiConfig.aiModel) {
      throw new Error('請先設定 AI API Key 和模型');
    }

    const prompt = `
Analyze the following job posting and extract structured information for resume matching:

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

    let aiResponse;
    
    if (aiConfig.aiProvider === 'openai') {
      aiResponse = await callOpenAI(prompt, aiConfig);
    } else if (aiConfig.aiProvider === 'openrouter') {
      aiResponse = await callOpenRouter(prompt, aiConfig);
    } else {
      throw new Error(`不支援的 AI 提供商: ${aiConfig.aiProvider}`);
    }

    // 解析 AI 回應的 JSON
    const cleanResponse = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
    console.log('AI 回應:', cleanResponse);
    const aiAnalysis = JSON.parse(cleanResponse);
    
    // 合併原始資料和 AI 分析結果
    return mergeJobDataWithAI(jobData, aiAnalysis, aiConfig);
    
  } catch (error) {
    console.error('❌ AI 分析失敗:', error);
    throw error;
  }
}

async function callOpenAI(prompt, aiConfig) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${aiConfig.aiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: aiConfig.aiModel,
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
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API 錯誤: ${response.status} - ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callOpenRouter(prompt, aiConfig) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${aiConfig.aiApiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': chrome.runtime.getURL(''), // 擴展的 URL
      'X-Title': 'Universal Job Scraper'
    },
    body: JSON.stringify({
      model: aiConfig.aiModel,
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
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`OpenRouter API 錯誤: ${response.status} - ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// 合併原始資料和 AI 分析結果
function mergeJobDataWithAI(originalData, aiAnalysis, aiConfig) {
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
    description: originalData.description || '', // 保留原始的 description 欄位
    requirements: originalData.requirements || '', // 保留原始的 requirements 欄位
    benefits: originalData.benefits || '', // 保留原始的 benefits 欄位
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
    aiProvider: aiConfig.aiProvider,
    aiModel: aiConfig.aiModel
  };
}

// 處理擴展圖示點擊
chrome.action.onClicked.addListener((tab) => {
  // 檢查是否在支援的職缺頁面
  if (tab.url && isSupportedJobPage(tab.url)) {
    console.log('在支援的職缺頁面使用擴展');
  } else {
    // 如果不在正確的頁面，顯示通知
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon-128.png',
      title: 'Universal Job Scraper',
      message: '請在支援的求職網站職缺頁面使用此擴展（LinkedIn、104、1111、Yourator、CakeResume）'
    });
  }
});