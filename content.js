// LinkedIn Job Content Scraper
console.log('LinkedIn Job Scraper content script loaded');

class LinkedInJobScraper {
  constructor() {
    this.jobData = {};
  }

  // Main scraping method
  scrapeJobDetails() {
    console.log('Starting job details scraping...');
    
    try {
      // 首先檢查 jobs-description__container 是否存在
      const descContainer = document.querySelector('article .jobs-description__container');
      console.log('Description container found:', !!descContainer);
      
      const rawDescription = this.getDescription();
      console.log('Raw description length:', rawDescription?.length || 0);
      
      this.jobData = {
        title: this.getJobTitle(),
        company: this.getCompany(),
        location: this.getLocation(),
        salary: this.getSalary(),
        description: rawDescription,
        requirements: this.getRequirements(),
        benefits: this.getBenefits(),
        jobType: this.getJobType(),
        experience: this.getExperience(),
        postedDate: this.getPostedDate(),
        url: window.location.href,
        scrapedAt: new Date().toISOString(),
        // 新增：原始資料用於 AI 分析
        rawData: {
          fullDescription: rawDescription,
          htmlContent: this.getRawHTML(),
          pageTitle: document.title,
          metaInfo: this.getMetaInfo(),
          descriptionInfo: this.extractInfoFromDescription()
        }
      };

      console.log('Successfully scraped job data:', this.jobData);
      
      // 檢查必要欄位是否為空
      const requiredFields = ['title', 'company'];
      const missingFields = requiredFields.filter(field => 
        !this.jobData[field] || this.jobData[field] === 'Unknown' || this.jobData[field].includes('Unknown')
      );
      
      if (missingFields.length > 0) {
        console.warn('Missing or unknown data for fields:', missingFields);
        console.log('Attempting fallback extraction...');
        
        // 嘗試從頁面標題提取資訊
        const titleInfo = this.extractFromPageTitle();
        if (titleInfo.title && (!this.jobData.title || this.jobData.title.includes('Unknown'))) {
          this.jobData.title = titleInfo.title;
          console.log('Updated title from page title:', titleInfo.title);
        }
        if (titleInfo.company && (!this.jobData.company || this.jobData.company.includes('Unknown'))) {
          this.jobData.company = titleInfo.company;
          console.log('Updated company from page title:', titleInfo.company);
        }
      }
      
      return this.jobData;
    } catch (error) {
      console.error('Critical scraping error:', error);
      console.error('Stack trace:', error.stack);
      
      // 返回基本的錯誤安全版本
      return {
        title: document.title.split('|')[0]?.trim() || 'Unknown Position',
        company: 'Unknown Company',
        location: 'Unknown Location',
        salary: 'Not provided',
        description: 'Unable to extract job description',
        requirements: 'Please check the original posting',
        benefits: 'Please check the original posting',
        jobType: 'Unknown',
        experience: 'Unknown',
        postedDate: 'Unknown',
        url: window.location.href,
        scrapedAt: new Date().toISOString(),
        error: error.message,
        rawData: {
          pageTitle: document.title,
          error: 'Extraction failed'
        }
      };
    }
  }

  // 從頁面標題提取資訊
  extractFromPageTitle() {
    try {
      const title = document.title;
      const parts = title.split('|').map(part => part.trim());
      
      return {
        title: parts[0] || null,
        company: parts[1] || null
      };
    } catch (error) {
      return { title: null, company: null };
    }
  }

  // 新增：獲取原始 HTML 內容
  getRawHTML() {
    const selectors = [
      'article.jobs-description__container',
      'article.jobs-description__container--condensed',
      '.jobs-description__container'
    ];
    
    for (const selector of selectors) {
      const container = document.querySelector(selector);
      if (container) {
        return container.innerHTML;
      }
    }
    return '';
  }

  // 新增：獲取頁面元資訊
  getMetaInfo() {
    return {
      jobId: this.extractJobId(),
      companySize: this.getCompanySize(),
      industry: this.getIndustry()
    };
  }

  extractJobId() {
    const urlMatch = window.location.href.match(/jobs\/view\/(\d+)/);
    return urlMatch ? urlMatch[1] : null;
  }

  getCompanySize() {
    const sizeSelectors = [
      '.job-details-jobs-unified-top-card__job-insight--highlight',
      '.jobs-unified-top-card__job-insight'
    ];
    // 尋找包含員工數量的元素
    for (const selector of sizeSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const text = element.textContent;
        if (text && (text.includes('employees') || text.includes('員工'))) {
          return text.trim();
        }
      }
    }
    return 'Unknown';
  }

  getIndustry() {
    // 嘗試從公司資訊中提取行業
    const industrySelectors = [
      '.job-details-jobs-unified-top-card__company-name + div',
      '.jobs-unified-top-card__company-name + div'
    ];
    return this.getTextBySelectorList(industrySelectors) || 'Unknown';
  }

  getJobTitle() {
    try {
      // 基於真實 HTML 結構的 selector
      const selectors = [
        '.job-details-jobs-unified-top-card__job-title h1.t-24.t-bold',  // 最精確的
        '.job-details-jobs-unified-top-card__job-title h1',
        'h1.t-24.t-bold.inline',
        '.job-details-jobs-unified-top-card__job-title .t-24',
        'h1.top-card-layout__title',  // 舊版 fallback
        'h1',  // 最後的 fallback
        '[data-automation-id="job-title"]'
      ];
      
      let title = this.getTextBySelectorList(selectors, null);
      
      // 如果找不到，從 description container 中提取
      if (!title) {
        const descInfo = this.extractInfoFromDescription();
        title = descInfo.title || document.title.split('|')[0]?.trim() || 'Unknown Position';
      }
      
      console.log('Extracted job title:', title);
      return title;
    } catch (error) {
      console.error('Error getting job title:', error);
      return 'Unknown Position';
    }
  }

  getCompany() {
    try {
      console.log('🏢 Extracting company name...');
      const selectors = [
        '.job-details-jobs-unified-top-card__company-name a',  // 最精確的，基於真實結構
        '.job-details-jobs-unified-top-card__company-name',
        '.job-details-jobs-unified-top-card__company-name span',
        '.top-card-layout__card .topcard__org-name-link',
        '.topcard__org-name-link',
        '.jobs-unified-top-card__company-name a',
        '.jobs-unified-top-card__company-name',
        '[data-automation-id="company-name"]',
        'a[href*="/company/"]',  // 更寬鬆的公司連結 selector
        'a[href*="/company/life"]' // 基於實際觀察到的 /company/kayak/life
      ];
      
      let company = this.getTextBySelectorList(selectors, null);
      
      // 如果找不到，從 description container 中提取
      if (!company) {
        const descInfo = this.extractInfoFromDescription();
        company = descInfo.company || this.extractCompanyFromURL() || 'Unknown Company';
      }
      
      console.log('Extracted company:', company);
      return company;
    } catch (error) {
      console.error('Error getting company:', error);
      return 'Unknown Company';
    }
  }

  getLocation() {
    try {
      console.log('🌍 Extracting location...');
      
      // 嘗試從 JSON 數據中提取格式化的位置
      const jsonData = this.extractDataFromJSON();
      if (jsonData && jsonData.formattedLocation) {
        console.log('Found location in JSON data:', jsonData.formattedLocation);
        return jsonData.formattedLocation;
      }
      
      // 傳統的選擇器方法
      const selectors = [
        '.top-card-layout__card .topcard__flavor--bullet',
        '.job-details-jobs-unified-top-card__bullet',
        '.topcard__flavor--bullet',
        '.jobs-unified-top-card__bullet',
        '[data-automation-id="job-location"]'
      ];
      
      let location = this.getTextBySelectorList(selectors, null);
      
      // 從工作描述中提取地點信息
      if (!location) {
        const descInfo = this.extractInfoFromDescription();
        location = this.extractLocationFromText(descInfo.combinedText);
      }
      
      // 最後嘗試從描述文本中找到辦公室位置
      if (!location) {
        const description = this.getDescription();
        const officeMatch = description.match(/(?:from our|office in|located in|based in)\s*([^,\n.]{2,30})/i);
        if (officeMatch) {
          location = officeMatch[1].trim();
        }
      }
      
      const finalLocation = location || 'Unknown Location';
      console.log('✅ Extracted location:', finalLocation);
      return finalLocation;
    } catch (error) {
      console.error('❌ Error getting location:', error);
      return 'Unknown Location';
    }
  }

  // 輔助方法：從 URL 提取公司名稱
  extractCompanyFromURL() {
    try {
      const urlMatch = window.location.href.match(/company\/([^\/\?]+)/);
      return urlMatch ? decodeURIComponent(urlMatch[1]).replace(/-/g, ' ') : null;
    } catch (error) {
      return null;
    }
  }

  // 輔助方法：從文字中提取地點
  extractLocationFromText(text) {
    const locationPatterns = [
      /(?:位於|在|Located in|Based in|from our|office in|工作地點)\s*([^,\n.]{2,50})/i,
      /(Berlin|Munich|Hamburg|Frankfurt|Stuttgart|Cologne|Dresden|Leipzig)/i,
      /(台北|新北|桃園|台中|台南|高雄|Singapore|Hong Kong|Tokyo|Seoul|Bangkok|New York|London|Paris)/i,
      /(Remote|遠端|居家|Hybrid|混合)/i,
      /(?:德國|Germany)\s*([^,\n.]{2,30})/i
    ];
    
    for (const pattern of locationPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }
    return null;
  }

  getSalary() {
    try {
      console.log('💰 Extracting salary...');
      
      // 嘗試從各種選擇器中提取薪資信息
      const selectors = [
        '.job-details-jobs-unified-top-card__job-insight--highlight',
        '.salary-main-rail__salary-info',
        '.compensation__salary',
        '.job-details-jobs-unified-top-card__job-insight'
      ];
      
      const elements = document.querySelectorAll(selectors.join(', '));
      
      for (const element of elements) {
        const text = element.textContent?.trim();
        if (text && this.isSalaryText(text)) {
          console.log('✅ Found salary:', text);
          return text;
        }
      }
      
      // 從工作描述中搜索薪資信息
      const description = this.getDescription();
      const salaryPattern = /(?:salary|compensation|pay)\s*:?\s*([\$€£¥]?[\d,]+(?:\s*-\s*[\$€£¥]?[\d,]+)?[\s\w]*)/i;
      const salaryMatch = description.match(salaryPattern);
      
      if (salaryMatch) {
        console.log('✅ Found salary in description:', salaryMatch[1]);
        return salaryMatch[1].trim();
      }
      
      console.log('❌ No salary information found');
      return 'Not provided';
    } catch (error) {
      console.error('❌ Error getting salary:', error);
      return 'Not provided';
    }
  }

  getDescription() {
    try {
      console.log('📄 Extracting job description...');
      // 基於真實 HTML 結構的 selector
      const selectors = [
        'article.jobs-description__container .jobs-box__html-content',  // 最精確的
        'article.jobs-description__container--condensed .jobs-description-content__text--stretch',
        '.jobs-description__container .jobs-box__html-content',
        '.jobs-description-content__text--stretch',
        '#job-details',  // 基於實際觀察到的 ID
        'article .jobs-description__container',
        '.jobs-description__container',
        '.jobs-box__html-content',
        '.jobs-description-content__text'
      ];
      
      const element = this.getElementBySelectorList(selectors);
      if (element) {
        console.log('✅ Found description element, extracting content...');
        // 獲取所有文字內容，包括 span 標籤內的內容
        let fullText = '';
        
        // 收集所有 span 元素的文字
        const spans = element.querySelectorAll('span');
        console.log(`Found ${spans.length} span elements in description`);
        
        if (spans.length > 0) {
          // 更智能的 span 處理 - 考慮 DOM 結構和位置
          const processedSpans = [];
          
          spans.forEach((span, index) => {
            const text = span.textContent?.trim();
            if (text && text.length > 0) { // 不過濾短文字，因為可能是重要的連接詞
              
              // 檢查前一個兄弟節點，判斷是否需要空格
              let needsLeadingSpace = false;
              if (index > 0 && fullText.length > 0) {
                const prevSibling = span.previousSibling;
                const lastChar = fullText.slice(-1);
                const firstChar = text.charAt(0);
                
                // 如果前一個字符不是空白，且當前字符是字母或數字，則需要空格
                if (!lastChar.match(/[\s\n]/) && firstChar.match(/[a-zA-Z0-9]/)) {
                  needsLeadingSpace = true;
                }
                
                // 檢查是否跨越了不同的 DOM 元素
                if (prevSibling && prevSibling.nodeType === Node.TEXT_NODE) {
                  const siblingText = prevSibling.textContent?.trim();
                  if (siblingText && !siblingText.match(/[\s\n]$/)) {
                    needsLeadingSpace = true;
                  }
                }
              }
              
              // 檢查是否需要尾隨空格
              let needsTrailingSpace = false;
              const nextSibling = span.nextSibling;
              if (nextSibling) {
                if (nextSibling.nodeType === Node.TEXT_NODE) {
                  const siblingText = nextSibling.textContent?.trim();
                  if (siblingText && !siblingText.match(/^[\s\n]/)) {
                    needsTrailingSpace = true;
                  }
                } else if (nextSibling.nodeType === Node.ELEMENT_NODE) {
                  const nextText = nextSibling.textContent?.trim();
                  if (nextText && !text.match(/[.!?;:,\-\n\s]$/) && nextText.match(/^[a-zA-Z0-9]/)) {
                    needsTrailingSpace = true;
                  }
                }
              }
              
              let processedText = text;
              if (needsLeadingSpace) processedText = ' ' + processedText;
              if (needsTrailingSpace) processedText = processedText + ' ';
              
              fullText += processedText;
              processedSpans.push({ original: text, processed: processedText });
            }
          });
          
          console.log(`Processed ${processedSpans.length} spans:`, processedSpans.slice(0, 5));
        }
        
        // 如果沒找到有用的 span 內容，嘗試更好的提取方法
        if (!fullText.trim()) {
          console.log('No meaningful spans found, trying alternative extraction methods...');
          
          // 方法 1: 使用 innerText (最佳，保留格式)
          if (element.innerText && element.innerText.trim()) {
            fullText = element.innerText;
            console.log('Using innerText method');
          }
          // 方法 2: 處理 HTML 結構再提取文字
          else {
            console.log('Using HTML structure processing method');
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = element.innerHTML;
            
            // 在可能導致單詞連接的標籤間添加空格
            const addSpacesAroundTags = (container) => {
              const walker = document.createTreeWalker(
                container,
                NodeFilter.SHOW_ELEMENT,
                null,
                false
              );
              
              const elementsToProcess = [];
              let node;
              while (node = walker.nextNode()) {
                elementsToProcess.push(node);
              }
              
              elementsToProcess.forEach(el => {
                // 在塊級元素前後添加換行，確保語義塊分離
                if (['DIV', 'P', 'BR', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SECTION', 'ARTICLE'].includes(el.tagName)) {
                  if (el.tagName === 'BR') {
                    el.replaceWith(document.createTextNode('\n'));
                  } else {
                    // 為塊級元素添加更明確的分隔
                    el.before(document.createTextNode('\n '));
                    el.after(document.createTextNode(' \n'));
                  }
                }
                // 對於可能包含獨立語義內容的內聯元素，確保有適當的空格
                else if (['SPAN', 'A', 'STRONG', 'EM', 'B', 'I'].includes(el.tagName)) {
                  // 檢查元素內容是否是完整的詞或句子
                  const text = el.textContent?.trim();
                  if (text && text.length > 0) {
                    // 檢查前後是否需要空格分隔
                    const prevSibling = el.previousSibling;
                    const nextSibling = el.nextSibling;
                    
                    // 如果前面有內容且不以空白結尾，添加空格
                    if (prevSibling && prevSibling.textContent && !prevSibling.textContent.match(/[\s\n]$/)) {
                      el.before(document.createTextNode(' '));
                    }
                    
                    // 如果後面有內容且不以空白開始，添加空格
                    if (nextSibling && nextSibling.textContent && !nextSibling.textContent.match(/^[\s\n]/)) {
                      el.after(document.createTextNode(' '));
                    }
                  }
                }
              });
            };
            
            addSpacesAroundTags(tempDiv);
            fullText = tempDiv.textContent || '';
            console.log('Processed HTML structure for text extraction');
          }
        }
        
        // 清理文字 - 更精確的處理
        let cleanedText = fullText
          // 先處理多重換行
          .replace(/\n\s*\n/g, '\n')
          // 處理行內多重空格，但保留單個空格和換行
          .replace(/[ \t]+/g, ' ')
          // 清理行首行尾空格
          .replace(/[ ]+\n/g, '\n')
          .replace(/\n[ ]+/g, '\n')
          // 最終去除首尾空格
          .trim();

        // 最後清理多重空格，不做額外的單詞修復
        cleanedText = cleanedText
          // 只清理多重空格，保持原文完整性
          .replace(/\s+/g, ' ')
          .trim();
        
        console.log(`✅ Extracted description (${cleanedText.length} chars):`, cleanedText.substring(0, 100) + '...');
        return cleanedText;
      }
      
      console.log('❌ No description element found');
      return 'Unable to get job description';
    } catch (error) {
      console.error('❌ Error in getDescription:', error);
      return 'Unable to extract job description';
    }
  }

  getRequirements() {
    const description = this.getDescription();
    
    // 更智能的關鍵字識別，支援中英文
    const reqPatterns = [
      // 英文模式
      /(?:Requirements?|Qualifications?|What we're looking for|Skills?|Experience?):?(.*?)(?=\n\n|\n[A-Z]|We offer|Benefits|$)/is,
      // 中文模式
      /(?:職位要求|工作要求|申請條件|必備技能|工作經驗|資格要求):?(.*?)(?=\n\n|福利|待遇|$)/is,
      // 項目符號模式 (• - *) - 加上 g 標誌
      /(?:^|\n)[\s]*[•\-\*\+]\s*(.*?)$/gm
    ];
    
    const requirements = new Set(); // 使用 Set 避免重複
    
    reqPatterns.forEach(pattern => {
      try {
        if (pattern.global) {
          // 有 g 標誌的正則表達式，使用 matchAll
          const matches = [...description.matchAll(pattern)];
          matches.forEach(match => {
            if (match && match[1]) {
              const req = match[1].trim();
              if (req.length > 10) {
                requirements.add(req);
              }
            }
          });
        } else {
          // 沒有 g 標誌的正則表達式，使用 match
          const match = description.match(pattern);
          if (match && match[1]) {
            const req = match[1].trim();
            if (req.length > 10) {
              requirements.add(req);
            }
          }
        }
      } catch (error) {
        console.error('Error processing pattern:', pattern, error);
      }
    });
    
    return requirements.size > 0 ? Array.from(requirements).join('\n') : this.extractStructuredInfo(description, 'requirements');
  }

  getBenefits() {
    const description = this.getDescription();
    const benefitPatterns = [
      // 英文模式
      /(?:Benefits?|What we offer|Perks?|Compensation|Package):?(.*?)(?=\n\n|\n[A-Z]|Requirements|$)/is,
      // 中文模式  
      /(?:福利|待遇|薪資福利|員工福利|我們提供):?(.*?)(?=\n\n|職位要求|工作要求|$)/is
    ];
    
    for (const pattern of benefitPatterns) {
      const match = description.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return this.extractStructuredInfo(description, 'benefits');
  }

  // 新增：結構化資訊提取方法
  extractStructuredInfo(description, type) {
    // 這裡可以未來整合 AI 分析
    // 目前先用基礎的關鍵字提取
    const lines = description.split('\n').filter(line => line.trim().length > 5);
    
    const keywords = {
      requirements: ['年以上', 'experience', '經驗', '技能', 'skill', '學歷', '語言', 'language', '證照'],
      benefits: ['薪資', 'salary', '假期', 'vacation', '保險', 'insurance', '津貼', 'allowance', '股票']
    };
    
    const relevantLines = lines.filter(line => {
      const lowerLine = line.toLowerCase();
      return keywords[type]?.some(keyword => 
        lowerLine.includes(keyword.toLowerCase())
      );
    });
    
    return relevantLines.length > 0 ? relevantLines.join('\n') : `請查看完整${type === 'requirements' ? '工作要求' : '福利待遇'}`;
  }

  getJobType() {
    try {
      console.log('🏢 Extracting job type...');
      
      // 嘗試從 JSON 數據中提取工作類型
      const jsonData = this.extractDataFromJSON();
      if (jsonData && jsonData.workRemoteAllowed !== undefined) {
        const jobType = jsonData.workRemoteAllowed ? 'Remote' : 'On-site';
        console.log('Found job type in JSON:', jobType);
        return jobType;
      }
      
      const selectors = [
        '.job-details-jobs-unified-top-card__job-insight span',
        '.jobs-unified-top-card__job-insight',
        '.job-criteria__text'
      ];
      
      const elements = document.querySelectorAll(selectors.join(', '));
      for (const element of elements) {
        const text = element.textContent?.toLowerCase();
        if (text?.includes('full-time') || text?.includes('part-time') || 
            text?.includes('contract') || text?.includes('remote') ||
            text?.includes('全職') || text?.includes('兼職')) {
          const jobType = element.textContent.trim();
          console.log('✅ Found job type:', jobType);
          return jobType;
        }
      }
      
      // 從描述中查找工作類型
      const description = this.getDescription();
      const typePatterns = [
        /(?:this\s+(?:is\s+a\s+)?|position\s+is\s+)?(full[\s-]?time|part[\s-]?time|contract|remote|hybrid)/i,
        /(全職|兼職|合約|遠程|混合)/i
      ];
      
      for (const pattern of typePatterns) {
        const match = description.match(pattern);
        if (match) {
          console.log('✅ Found job type in description:', match[1]);
          return match[1];
        }
      }
      
      console.log('❌ No job type information found');
      return 'Not specified';
    } catch (error) {
      console.error('❌ Error getting job type:', error);
      return 'Not specified';
    }
  }

  getExperience() {
    const description = this.getDescription();
    const expPatterns = [
      /(\d+)\+?\s*years?\s*of\s*experience/i,
      /(\d+)\+?\s*years?\s*experience/i,
      /(junior|senior|mid-level|entry-level)/i
    ];
    
    for (const pattern of expPatterns) {
      const match = description.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return 'Not specified';
  }

  getPostedDate() {
    const selectors = [
      '.jobs-unified-top-card__posted-date',
      '.job-details-jobs-unified-top-card__posted-date',
      '.posted-time-ago__text'
    ];
    return this.getTextBySelectorList(selectors) || 'Unknown';
  }

  // 安全的文字提取方法
  getTextBySelectorList(selectors, fallback = 'Unknown') {
    try {
      console.log('Trying selectors:', selectors);
      for (let i = 0; i < selectors.length; i++) {
        const selector = selectors[i];
        const element = document.querySelector(selector);
        console.log(`Selector ${i + 1} (${selector}):`, element ? `Found: "${element.textContent?.trim()}"` : 'NOT FOUND');
        
        if (element && element.textContent && element.textContent.trim()) {
          const result = element.textContent.trim();
          console.log(`✅ Successfully extracted: "${result}"`);
          return result;
        }
      }
      console.warn('❌ No element found for any selectors:', selectors);
      return fallback;
    } catch (error) {
      console.error('❌ Error in getTextBySelectorList:', error);
      return fallback;
    }
  }

  // 安全的元素提取方法
  getElementBySelectorList(selectors) {
    try {
      console.log('Looking for elements with selectors:', selectors);
      for (let i = 0; i < selectors.length; i++) {
        const selector = selectors[i];
        const element = document.querySelector(selector);
        console.log(`Element ${i + 1} (${selector}):`, element ? 'FOUND' : 'NOT FOUND');
        
        if (element) {
          console.log(`✅ Successfully found element with: ${selector}`);
          return element;
        }
      }
      console.warn('❌ No element found for any selectors:', selectors);
      return null;
    } catch (error) {
      console.error('❌ Error in getElementBySelectorList:', error);
      return null;
    }
  }

  // 從 jobs-description__container 中提取基本資訊
  extractInfoFromDescription() {
    try {
      const containerSelectors = [
        'article.jobs-description__container',
        'article.jobs-description__container--condensed',
        '.jobs-description__container'
      ];
      
      let container = null;
      for (const selector of containerSelectors) {
        container = document.querySelector(selector);
        if (container) break;
      }
      
      if (!container) {
        console.warn('No description container found with any selector');
        return {};
      }
      
      const spans = container.querySelectorAll('span');
      const allText = Array.from(spans).map(span => span.textContent?.trim()).filter(Boolean);
      
      return {
        allSpanTexts: allText,
        combinedText: allText.join(' '),
        title: this.extractTitleFromDescription(allText),
        company: this.extractCompanyFromDescription(allText)
      };
    } catch (error) {
      console.error('Error extracting from description:', error);
      return {};
    }
  }

  // 從描述中提取職位標題
  extractTitleFromDescription(textArray) {
    // 尋找看起來像職位標題的文字
    for (const text of textArray) {
      if (text.length > 5 && text.length < 100 && 
          (text.includes('Engineer') || text.includes('Developer') || 
           text.includes('Manager') || text.includes('Analyst') ||
           text.includes('工程師') || text.includes('經理') || text.includes('專員'))) {
        return text;
      }
    }
    return null;
  }

  // 從描述中提取公司名稱
  extractCompanyFromDescription(textArray) {
    // 尋找看起來像公司名稱的文字
    for (const text of textArray) {
      if (text.length > 2 && text.length < 50 && 
          (text.includes('Inc') || text.includes('Ltd') || text.includes('Corp') ||
           text.includes('公司') || text.includes('科技') || text.includes('集團'))) {
        return text;
      }
    }
    return null;
  }

  // 新增：從頁面的 JSON 數據中提取信息
  extractDataFromJSON() {
    try {
      // 尋找包含工作職位數據的 script 標籤
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent || '';
        if (content.includes('formattedLocation') || content.includes('workRemoteAllowed')) {
          // 嘗試解析 JSON 數據
          const jsonMatch = content.match(/"formattedLocation":"([^"]+)"/);;
          const remoteMatch = content.match(/"workRemoteAllowed":(true|false)/);
          
          if (jsonMatch || remoteMatch) {
            return {
              formattedLocation: jsonMatch ? jsonMatch[1] : null,
              workRemoteAllowed: remoteMatch ? remoteMatch[1] === 'true' : null
            };
          }
        }
      }
      return null;
    } catch (error) {
      console.error('Error extracting JSON data:', error);
      return null;
    }
  }

  // 新增：判斷文字是否為薪資信息
  isSalaryText(text) {
    const salaryKeywords = [
      '$', '€', '£', '¥', 'USD', 'EUR', 'GBP', 'salary', 'pay', 'compensation',
      'k', 'thousand', 'million', '薪資', '年薪', '月薪'
    ];
    
    const lowerText = text.toLowerCase();
    
    // 排除不是薪資的文字
    if (lowerText.includes('full-time') || lowerText.includes('part-time') || 
        lowerText.includes('contract') || lowerText.includes('remote') ||
        lowerText.includes('全職') || lowerText.includes('兼職')) {
      return false;
    }
    
    return salaryKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
  }
}

// 測試用：顯示頁面上可用的所有相關元素
function debugPageElements() {
  console.log('🔍 Debugging page elements...');
  
  // 檢查所有可能的職位標題元素
  console.log('\n📋 Job Title Elements:');
  document.querySelectorAll('h1, [class*="job-title"], [class*="title"]').forEach((el, i) => {
    if (el.textContent?.trim()) {
      console.log(`${i + 1}. ${el.tagName}.${el.className}: "${el.textContent.trim()}"`);
    }
  });
  
  // 檢查所有可能的公司名稱元素
  console.log('\n🏢 Company Elements:');
  document.querySelectorAll('[class*="company"], a[href*="/company/"]').forEach((el, i) => {
    if (el.textContent?.trim()) {
      console.log(`${i + 1}. ${el.tagName}.${el.className}: "${el.textContent.trim()}"`);
    }
  });
  
  // 檢查描述容器
  console.log('\n📄 Description Containers:');
  document.querySelectorAll('[class*="description"], [class*="job-details"], article').forEach((el, i) => {
    console.log(`${i + 1}. ${el.tagName}.${el.className}: ${el.textContent?.trim().substring(0, 50)}...`);
  });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  console.log('Content script received message:', request);
  
  if (request.action === 'ping') {
    console.log('Ping received, responding...');
    sendResponse({ success: true, message: 'Content script loaded', url: window.location.href });
  } else if (request.action === 'debug') {
    debugPageElements();
    sendResponse({ success: true, message: 'Debug completed' });
  } else if (request.action === 'scrapeJob') {
    console.log('Scrape job request received');
    try {
      // 檢查當前頁面是否為職缺相關頁面
      const url = window.location.href;
      if (!url.includes('linkedin.com/jobs/')) {
        throw new Error('Not on a LinkedIn jobs page');
      }
      
      // 更詳細的頁面類型檢查
      const isJobDetailPage = url.includes('/jobs/view/');
      const isJobSearchPage = url.includes('/jobs/search/') || url.includes('/jobs/collections/');
      
      if (!isJobDetailPage && !isJobSearchPage) {
        console.warn('Page type may not be supported:', url);
      }
      
      const scraper = new LinkedInJobScraper();
      const jobData = scraper.scrapeJobDetails();
      console.log('Job data scraped:', jobData);
      sendResponse({ success: true, data: jobData });
    } catch (error) {
      console.error('Scraping error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
  return true;
});

// Show scraping button after page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initScraper);
} else {
  initScraper();
}

function initScraper() {
  // Add floating scraping button
  if (!document.getElementById('linkedin-scraper-btn')) {
    const button = document.createElement('button');
    button.id = 'linkedin-scraper-btn';
    button.innerHTML = '📋 Scrape to Notion';
    button.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      background: #0066cc;
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: bold;
      box-shadow: 0 4px 12px rgba(0,102,204,0.3);
      transition: all 0.3s ease;
    `;
    
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 6px 16px rgba(0,102,204,0.4)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 4px 12px rgba(0,102,204,0.3)';
    });
    
    button.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openPopup' });
    });
    
    document.body.appendChild(button);
  }
}