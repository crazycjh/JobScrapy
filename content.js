// LinkedIn Job Content Scraper
console.log('Universal Job Scraper content script loaded');

// 網站檢測器
class SiteDetector {
  static getCurrentSite() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('linkedin.com')) return 'linkedin';
    if (hostname.includes('104.com.tw')) return '104';
    if (hostname.includes('1111.com.tw')) return '1111';
    if (hostname.includes('yourator.co')) return 'yourator';
    if (hostname.includes('cakeresume.com')) return 'cakeresume';
    
    return 'unknown';
  }
  
  static isJobPage(site = null) {
    const currentSite = site || this.getCurrentSite();
    const url = window.location.href;
    const pathname = window.location.pathname;
    
    const patterns = {
      linkedin: /\/jobs\/(view\/\d+|search\/.*currentJobId=\d+)/,
      104: /\/job\//,
      1111: /\/job\//,
      yourator: /\/jobs\/\w+/,
      cakeresume: /\/jobs\//
    };
    
    const isMatch = patterns[currentSite]?.test(url) || patterns[currentSite]?.test(pathname);
    console.log(`🔍 Site: ${currentSite}, URL: ${url}, Is Job Page: ${isMatch}`);
    
    return isMatch || false;
  }
  
  static getSiteConfig(site = null) {
    const currentSite = site || this.getCurrentSite();
    
    const configs = {
      linkedin: {
        name: 'LinkedIn',
        buttonText: '📋 Scrape to Notion',
        selectors: {
          // 現有的 LinkedIn 選擇器將在重構時移到這裡
        }
      },
      104: {
        name: '104人力銀行',
        buttonText: '📋 抓取到 Notion',
        selectors: {
          title: '.job-header h1',
          company: '.company-name',
          description: '.job-description'
        }
      },
      1111: {
        name: '1111人力銀行',
        buttonText: '📋 抓取到 Notion',
        selectors: {
          title: '.job-title',
          company: '.company-name',
          description: '.job-content'
        }
      },
      yourator: {
        name: 'Yourator',
        buttonText: '📋 Scrape to Notion',
        selectors: {
          title: '.job-title',
          company: '.company-name',
          description: '.job-description'
        }
      },
      cakeresume: {
        name: 'CakeResume',
        buttonText: '📋 Scrape to Notion',
        selectors: {
          title: '.job-title',
          company: '.company-name',
          description: '.job-description'
        }
      }
    };
    
    return configs[currentSite] || null;
  }
}

// 基礎職缺抓取器抽象類別
class BaseJobScraper {
  constructor(site) {
    this.site = site;
    this.siteConfig = SiteDetector.getSiteConfig(site);
    this.jobData = {};
  }

  // 抽象方法 - 子類別必須實作
  async scrapeJob() {
    throw new Error('scrapeJob() method must be implemented');
  }

  getJobTitle() {
    throw new Error('getJobTitle() method must be implemented');
  }

  getCompany() {
    throw new Error('getCompany() method must be implemented');
  }

  getLocation() {
    throw new Error('getLocation() method must be implemented');
  }

  getDescription() {
    throw new Error('getDescription() method must be implemented');
  }

  getSalary() {
    return 'Unknown'; // 預設實作
  }

  getJobType() {
    return 'Unknown'; // 預設實作
  }

  getExperience() {
    return 'Unknown'; // 預設實作
  }

  getPostedDate() {
    return 'Unknown'; // 預設實作
  }

  getRequirements() {
    return ''; // 預設實作
  }

  getBenefits() {
    return ''; // 預設實作
  }

  // 通用輔助方法
  extractTextContent(selector) {
    const element = document.querySelector(selector);
    return element?.textContent?.trim() || '';
  }

  extractAllTextContent(selector) {
    const elements = document.querySelectorAll(selector);
    return Array.from(elements).map(el => el.textContent?.trim()).filter(text => text);
  }

  cleanText(text) {
    return text?.replace(/\s+/g, ' ').trim() || '';
  }

  // 通用職缺資料結構
  createJobData() {
    return {
      site: this.site,
      siteName: this.siteConfig?.name || this.site,
      title: this.getJobTitle(),
      company: this.getCompany(),
      location: this.getLocation(),
      salary: this.getSalary(),
      description: this.getDescription(),
      requirements: this.getRequirements(),
      benefits: this.getBenefits(),
      jobType: this.getJobType(),
      experience: this.getExperience(),
      postedDate: this.getPostedDate(),
      url: window.location.href,
      scrapedAt: new Date().toISOString()
    };
  }
}

// LinkedIn 特定實作
class LinkedInJobScraper extends BaseJobScraper {
  constructor() {
    super('linkedin');
  }

  // 實作基礎類別的抽象方法
  async scrapeJob() {
    console.log('🔍 LinkedIn: Starting job scraping...');
    
    try {
      // 檢查描述容器是否存在
      const descContainer = document.querySelector('article .jobs-description__container');
      console.log('📄 Description container found:', !!descContainer);
      
      const rawDescription = this.getDescription();
      console.log('📝 Raw description length:', rawDescription?.length || 0);
      
      this.jobData = this.createJobData();
      
      // 新增原始資料用於 AI 分析
      this.jobData.rawData = {
        fullDescription: rawDescription,
        htmlContent: this.getRawHTML(),
        pageTitle: document.title,
        metaInfo: this.getMetaInfo(),
        descriptionInfo: this.extractInfoFromDescription()
      };

      console.log('✅ LinkedIn job data scraped:', this.jobData);
      
      // 檢查必要欄位
      const requiredFields = ['title', 'company'];
      const missingFields = requiredFields.filter(field => 
        !this.jobData[field] || this.jobData[field] === 'Unknown' || this.jobData[field].includes('Unknown')
      );
      
      if (missingFields.length > 0) {
        console.warn('⚠️ Missing required fields:', missingFields);
        return null;
      }
      
      return this.jobData;
      
    } catch (error) {
      console.error('❌ LinkedIn scraping failed:', error);
      return null;
    }
  }

  // 保留原有的主要抓取方法作為兼容性
  scrapeJobDetails() {
    return this.scrapeJob();
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
        const officeMatch = description?.match(/(?:from our|office in|located in|based in)\s*([^,\n.]{2,30})/i);
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
      const salaryMatch = description?.match(salaryPattern);
      
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
        
        // 處理所有子節點（包括純文本節點和元素節點）
        const allNodes = Array.from(element.childNodes);
        console.log(`Found ${allNodes.length} child nodes in description`);
        
        // 輔助函數：檢查是否為標題文字
        const isRequirementTitle = (text) => {
          return /^(Requirements?|Qualifications?|What we need|What we're looking for|必備條件|工作要求|申請條件)$/i.test(text.trim());
        };
        
        if (allNodes.length > 0) {
          // 處理所有節點 - 包括文本節點和元素節點
          const processedNodes = [];
          
          allNodes.forEach((node, index) => {
            // 處理純文本節點
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent?.trim();
              if (text && text.length > 0) {
                if (isRequirementTitle(text)) {
                  // 標題文字特殊處理
                  fullText += '\n\n**' + text + '**\n';
                  processedNodes.push({ type: 'text_title', original: text, processed: '**' + text + '**' });
                } else {
                  // 普通文本
                  fullText += text + '\n\n';
                  processedNodes.push({ type: 'text', original: text, processed: text });
                }
              }
            }
            // 處理元素節點（span, li 等）
            else if (node.nodeType === Node.ELEMENT_NODE && node.tagName) {
              if (node.tagName.toLowerCase() === 'span') {
                const text = node.textContent?.trim();
                if (text && text.length > 0) { // 不過濾短文字，因為可能是重要的連接詞
                  
                  // 檢查 span 內部是否包含 LI 元素
                  const containsListItems = node.querySelectorAll('li').length > 0;
                  
                  // 檢查前一個兄弟節點，判斷是否需要空格
                  let needsLeadingSpace = false;
                  if (index > 0 && fullText.length > 0) {
                    const prevSibling = node.previousSibling;
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
                  const nextSibling = node.nextSibling;
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
                  
                  // 如果 span 包含 LI 元素，需要特殊處理
                  if (containsListItems) {
                    // 獲取 span 內的所有 LI 元素
                    const listItems = node.querySelectorAll('li');
                    let listText = '';
                    
                    listItems.forEach(li => {
                      const liText = li.textContent?.trim();
                      if (liText) {
                        listText += '- ' + liText + '\n';
                      }
                    });
                    
                    fullText += listText + '\n'; // 列表後加一個額外換行
                  } else {
                    // 在每個有內容的 span 後面加上雙換行符號
                    fullText += processedText + '\n\n';
                  }
                  
                  processedNodes.push({ type: 'span', original: text, processed: processedText, containsLists: containsListItems });
                }
              }
            }
          });
          
          console.log(`Processed ${processedNodes.length} nodes:`, processedNodes.slice(0, 5));
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
                // 針對不同元素做格式化處理
                if (el.tagName === 'BR') {
                  el.replaceWith(document.createTextNode('\n'));
                } 
                else if (el.tagName === 'LI') {
                  // LI 元素：前面加 "- "
                  const text = el.textContent?.trim();
                  if (text && text.length > 0) {
                    el.before(document.createTextNode('\n- '));
                    el.after(document.createTextNode('\n'));
                  }
                }
                else if (['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SECTION', 'ARTICLE'].includes(el.tagName)) {
                  // 塊級元素：前後添加換行
                  const text = el.textContent?.trim();
                  if (text && text.length > 0) {
                    el.before(document.createTextNode('\n'));
                    el.after(document.createTextNode('\n'));
                  }
                }
                else if (el.tagName === 'SPAN') {
                  // SPAN 元素：有內容時後面加兩個換行符號，形成段落分隔
                  const text = el.textContent?.trim();
                  if (text && text.length > 0) {
                    el.after(document.createTextNode('\n\n'));
                  }
                }
                else if (['A', 'STRONG', 'EM', 'B', 'I'].includes(el.tagName)) {
                  // 其他內聯元素：確保適當的空格分隔
                  const text = el.textContent?.trim();
                  if (text && text.length > 0) {
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
          // 處理行內多重空格，但保留換行
          .replace(/[ \t]+/g, ' ')
          // 清理行首行尾空格
          .replace(/[ ]+\n/g, '\n')
          .replace(/\n[ ]+/g, '\n')
          // 把3個或更多連續換行合併成雙換行（保持段落分隔）
          .replace(/\n{3,}/g, '\n\n')
          // 最終去除首尾空格
          .trim();
        
        console.log(`✅ Extracted description (${cleanedText?.length || 0} chars):`, cleanedText?.substring(0, 200) + '...' || 'No content');
        console.log('🔍 First 500 chars with line breaks visible:', JSON.stringify(cleanedText?.substring(0, 500) || 'No content'));
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
    console.log("getRequirements - description preview:", description?.substring(0, 200) || 'No description available');
    
    // 更新的正則表達式，支援新格式
    const reqPatterns = [
      // Emoji 格式：✅ Who Are You? 或 ✅ Requirements
      /✅\s*(Who\s+Are\s+You\?|Requirements?|Qualifications?|What\s+we\s+need|What\s+we're\s+looking\s+for)[\s\n]+(.*?)(?=\n\n✅|\n\n🌍|\n\n💰|\n\n📩|$)/is,
      
      // 粗體格式：**Requirements**
      /\*\*(Requirements?|Qualifications?|What we need|What we're looking for)\*\*[\s\n]+(.*?)(?=\n\n\*\*|\n\n[A-Z]|\nBenefits|\nWHAT|\nWHY|\nABOUT|$)/is,
      
      // 帶冒號格式：Requirements:
      /(?:Requirements?|Qualifications?|What we need|What we're looking for):[\s\n]+(.*?)(?=\n\n[A-Z]|\nBenefits|\nWHAT|\nWHY|\nABOUT|$)/is,
      
      // 無冒號格式：Requirements（單獨行）
      /(?:^|\n)(Requirements?|Qualifications?|What we need|What we're looking for)[\s\n]+(.*?)(?=\n\n[A-Z]|\nBenefits|\nWHAT|\nWHY|\nABOUT|$)/is,
      
      // 中文模式
      /(?:\*\*)?(職位要求|工作要求|申請條件|必備技能|工作經驗|資格要求)(?:\*\*)?:?[\s\n]+(.*?)(?=\n\n|福利|待遇|$)/is
    ];
    
    // 確保 description 不是 undefined 或 null
    if (!description) {
      console.log('❌ Description is undefined, cannot extract requirements');
      return '';
    }
    
    for (let i = 0; i < reqPatterns.length; i++) {
      const pattern = reqPatterns[i];
      try {
        console.log(`🔍 Trying requirements pattern ${i + 1}:`, pattern.toString());
        const match = description.match(pattern);
        if (match) {
          console.log('✅ Requirements regex matched:', {
            patternIndex: i + 1,
            fullMatch: match[0]?.substring(0, 150) + '...' || 'No match',
            extracted: match[2] ? match[2]?.substring(0, 150) + '...' : (match[1] ? match[1]?.substring(0, 150) + '...' : 'No capture group')
          });
          
          // 根據不同的正則表達式，提取內容的位置可能不同
          const extractedContent = match[2] || match[1]; // 有些正則表達式捕獲組在 [2]，有些在 [1]
          if (extractedContent) {
            const req = extractedContent.trim();
            if (req.length > 20) { 
              console.log('🎯 Found requirements content:', req?.substring(0, 100) + '...' || 'No content');
              return req;
            }
          }
        } else {
          console.log(`❌ Pattern ${i + 1} didn't match`);
        }
      } catch (error) {
        console.error('Error processing pattern:', pattern, error);
      }
    }
    
    return '';
  }

  getBenefits() {
    const description = this.getDescription();
    console.log("getBenefits - description preview:", description?.substring(0, 200) || 'No description available');
    
    // 更新的正則表達式，支援新格式
    const benefitPatterns = [
      // Emoji 格式：🌍 Work Setup 或其他工作安排相關
      /🌍\s*(Work\s+Setup|Benefits?|What\s+we\s+offer|Perks?)[\s\n]+(.*?)(?=\n\n🚀|\n\n📩|\n\n✅|\n\n💻|$)/is,
      
      // 粗體格式：**Benefits**
      /\*\*(Benefits?|What we offer|Perks?|Compensation|Package|Compensation and Benefits)\*\*[\s\n]+(.*?)(?=\n\n\*\*|\n\n[A-Z]|\nRequirements|\nWHAT|\nWHY|\nABOUT|$)/is,
      
      // 帶冒號格式：Benefits:
      /(?:Benefits?|What we offer|Perks?|Compensation|Package):[\s\n]+(.*?)(?=\n\n[A-Z]|\nRequirements|\nWHAT|\nWHY|\nABOUT|$)/is,
      
      // 無冒號格式：Benefits（單獨行）
      /(?:^|\n)(Benefits?|What we offer|Perks?|Compensation|Package)[\s\n]+(.*?)(?=\n\n[A-Z]|\nRequirements|\nWHAT|\nWHY|\nABOUT|$)/is,
      
      // 中文模式
      /(?:\*\*)?(福利|待遇|薪資福利|員工福利|我們提供|薪酬福利)(?:\*\*)?:?[\s\n]+(.*?)(?=\n\n|職位要求|工作要求|$)/is
    ];
    
    // 確保 description 不是 undefined 或 null
    if (!description) {
      console.log('❌ Description is undefined, cannot extract benefits');
      return '';
    }
    
    for (let i = 0; i < benefitPatterns.length; i++) {
      const pattern = benefitPatterns[i];
      try {
        console.log(`🔍 Trying benefits pattern ${i + 1}:`, pattern.toString());
        const match = description.match(pattern);
        if (match) {
          console.log('✅ Benefits regex matched:', {
            patternIndex: i + 1,
            fullMatch: match[0]?.substring(0, 150) + '...' || 'No match',
            extracted: match[2] ? match[2]?.substring(0, 150) + '...' : (match[1] ? match[1]?.substring(0, 150) + '...' : 'No capture group')
          });
          
          // 根據不同的正則表達式，提取內容的位置可能不同
          const extractedContent = match[2] || match[1]; // 有些正則表達式捕獲組在 [2]，有些在 [1]
          if (extractedContent) {
            const benefits = extractedContent.trim();
            if (benefits.length > 20) { 
              console.log('🎯 Found benefits content:', benefits?.substring(0, 100) + '...' || 'No content');
              return benefits;
            }
          }
        } else {
          console.log(`❌ Pattern ${i + 1} didn't match`);
        }
      } catch (error) {
        console.error('Error processing pattern:', pattern, error);
      }
    }
    
    return '';
  }

  // 新增：結構化資訊提取方法
  extractStructuredInfo(description, type) {
    // 這裡可以未來整合 AI 分析
    // 目前先用基礎的關鍵字提取
    if (!description) {
      console.log('❌ Description is undefined, cannot extract structured info');
      return '';
    }
    
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
          
          // 清理文字，移除多餘的空白和換行
          let jobType = element.textContent.trim()
            .replace(/\s+/g, ' ')  // 多個空白合併成一個
            .replace(/\n+/g, ' ')  // 換行替換成空白
            .split(/[。\.]/)[0];   // 取第一句話（在句號前停止）
          
          // 進一步清理，只保留主要的工作類型資訊
          if (jobType.length > 50) {
            // 如果太長，嘗試提取關鍵字
            if (text.includes('full-time') || text.includes('全職')) jobType = 'Full-time';
            else if (text.includes('part-time') || text.includes('兼職')) jobType = 'Part-time';
            else if (text.includes('contract')) jobType = 'Contract';
            else if (text.includes('remote') || text.includes('遠距')) jobType = 'Remote';
          }
          
          console.log('✅ Found job type:', jobType);
          return jobType;
        }
      }
      
      // 從描述中查找工作類型
      const description = this.getDescription();
      if (description) {
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
    if (!description) {
      return 'Not specified';
    }
    
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
        lowerText.includes('全職') || lowerText.includes('兼職') ||
        lowerText.includes('premium') || lowerText.includes('試用') ||
        lowerText.includes('排名') || lowerText.includes('價格') ||
        lowerText.includes('應徵') || lowerText.includes('好奇') ||
        text.length > 100) {  // 薪資文字通常不會太長
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
    console.log(`${i + 1}. ${el.tagName}.${el.className}: ${el.textContent?.trim()?.substring(0, 50) || 'No content'}...`);
  });
}


// 拖動處理器類別
class DragHandler {
  constructor(element) {
    this.element = element;
    this.isDragging = false;
    this.hasMovedSignificantly = false;
    this.startPosition = { x: 0, y: 0 };
    this.elementStartPosition = { x: 0, y: 0 };
    this.SNAP_THRESHOLD = 50;
    this.EDGE_MARGIN = 10;
    this.MOVE_THRESHOLD = 5; // 超過 5px 才算真正拖動
    
    this.bindEvents();
    this.loadPosition();
  }

  async loadPosition() {
    try {
      const result = await chrome.storage.local.get(['buttonPosition']);
      const savedPosition = result.buttonPosition;
      
      if (savedPosition) {
        // 確保位置在螢幕範圍內
        const boundedPosition = this.constrainToViewport(savedPosition.x, savedPosition.y);
        this.setElementPosition(boundedPosition.x, boundedPosition.y);
      }
    } catch (error) {
      console.log('Failed to load button position:', error);
      // 使用預設位置
      this.setElementPosition(window.innerWidth - this.element.offsetWidth - 20, 20);
    }
  }

  async savePosition(x, y) {
    try {
      await chrome.storage.local.set({
        buttonPosition: { x, y, timestamp: Date.now() }
      });
    } catch (error) {
      console.log('Failed to save button position:', error);
    }
  }

  setElementPosition(x, y) {
    this.element.style.left = x + 'px';
    this.element.style.top = y + 'px';
    this.element.style.right = 'auto'; // 清除 right 定位
  }

  constrainToViewport(x, y) {
    const rect = this.element.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;
    
    return {
      x: Math.max(0, Math.min(x, maxX)),
      y: Math.max(0, Math.min(y, maxY))
    };
  }

  snapToEdge(x, y) {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const buttonWidth = this.element.offsetWidth;
    const buttonHeight = this.element.offsetHeight;
    
    // 調試資訊
    console.log('🧲 Auto-snap to nearest edge:', {
      position: { x, y },
      window: { width: windowWidth, height: windowHeight },
      button: { width: buttonWidth, height: buttonHeight }
    });
    
    // 計算到各個邊緣的距離
    const distanceToLeft = x;
    const distanceToRight = windowWidth - (x + buttonWidth);
    const distanceToTop = y;
    const distanceToBottom = windowHeight - (y + buttonHeight);
    
    console.log('📏 Distances to edges:', {
      left: distanceToLeft,
      right: distanceToRight,
      top: distanceToTop,
      bottom: distanceToBottom
    });
    
    // 找出最近的水平邊緣（左或右）
    let finalX, finalY;
    let snapDirection = '';
    
    if (distanceToLeft <= distanceToRight) {
      // 貼左邊
      finalX = this.EDGE_MARGIN;
      snapDirection = 'left';
      console.log('🧲 Auto-snapping to LEFT edge');
    } else {
      // 貼右邊
      finalX = windowWidth - buttonWidth - this.EDGE_MARGIN;
      snapDirection = 'right';
      console.log('🧲 Auto-snapping to RIGHT edge');
    }
    
    // Y 位置保持不變，但確保在螢幕範圍內
    finalY = Math.max(this.EDGE_MARGIN, Math.min(y, windowHeight - buttonHeight - this.EDGE_MARGIN));
    
    console.log(`✅ Final auto-snap position: (${finalX}, ${finalY}) - Direction: ${snapDirection}`);
    
    // 總是返回 snapped: true，因為我們總是會自動貼邊
    return { x: finalX, y: finalY, snapped: true };
  }

  bindEvents() {
    // 滑鼠事件
    this.element.addEventListener('mousedown', this.handleMouseDown.bind(this));
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));

    // 觸控事件
    this.element.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    document.addEventListener('touchend', this.handleTouchEnd.bind(this));

    // 視窗大小改變時重新調整位置
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  handleMouseDown(e) {
    e.preventDefault();
    this.startDrag(e.clientX, e.clientY);
  }

  handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    this.startDrag(touch.clientX, touch.clientY);
  }

  startDrag(clientX, clientY) {
    this.isDragging = true;
    this.hasMovedSignificantly = false;
    
    this.startPosition = { x: clientX, y: clientY };
    
    const rect = this.element.getBoundingClientRect();
    this.elementStartPosition = { x: rect.left, y: rect.top };
    
    console.log('🖱️ Start drag:', {
      mouse: this.startPosition,
      element: this.elementStartPosition,
      buttonSize: { width: rect.width, height: rect.height }
    });
    
    // 拖動時的視覺回饋
    this.element.style.cursor = 'grabbing';
    this.element.style.transform = 'scale(1.05)';
    this.element.style.transition = 'transform 0.1s ease';
    this.element.style.zIndex = '10000';
  }

  handleMouseMove(e) {
    if (!this.isDragging) return;
    this.updateDrag(e.clientX, e.clientY);
  }

  handleTouchMove(e) {
    if (!this.isDragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    this.updateDrag(touch.clientX, touch.clientY);
  }

  updateDrag(clientX, clientY) {
    const deltaX = clientX - this.startPosition.x;
    const deltaY = clientY - this.startPosition.y;
    
    // 檢查是否移動了足夠距離
    if (!this.hasMovedSignificantly) {
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (distance > this.MOVE_THRESHOLD) {
        this.hasMovedSignificantly = true;
      }
    }
    
    const newX = this.elementStartPosition.x + deltaX;
    const newY = this.elementStartPosition.y + deltaY;
    
    const constrainedPosition = this.constrainToViewport(newX, newY);
    this.setElementPosition(constrainedPosition.x, constrainedPosition.y);
  }

  handleMouseUp() {
    if (!this.isDragging) return;
    this.endDrag();
  }

  handleTouchEnd() {
    if (!this.isDragging) return;
    this.endDrag();
  }

  endDrag() {
    this.isDragging = false;
    console.log('🏁 End drag started');
    
    // 獲取當前位置
    const rect = this.element.getBoundingClientRect();
    let finalX = rect.left;
    let finalY = rect.top;
    
    console.log('📍 Current position before snap:', { x: finalX, y: finalY });
    
    // 磁吸邊緣
    const snapResult = this.snapToEdge(finalX, finalY);
    finalX = snapResult.x;
    finalY = snapResult.y;
    
    console.log('📍 Position after snap:', { x: finalX, y: finalY, snapped: snapResult.snapped });
    
    // 總是使用動畫過渡到側邊
    console.log('🎬 Applying auto-snap animation');
    this.element.style.transition = 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    this.setElementPosition(finalX, finalY);
    
    // 動畫完成後移除過渡
    setTimeout(() => {
      this.element.style.transition = 'transform 0.1s ease';
      console.log('🎬 Auto-snap animation completed');
    }, 200);
    
    // 恢復視覺狀態
    this.element.style.cursor = 'grab';
    this.element.style.transform = 'scale(1)';
    this.element.style.zIndex = '9999';
    
    // 儲存位置
    this.savePosition(finalX, finalY);
  }

  handleResize() {
    // 視窗大小改變時，確保按鈕仍在可見範圍內
    const rect = this.element.getBoundingClientRect();
    const constrainedPosition = this.constrainToViewport(rect.left, rect.top);
    
    if (rect.left !== constrainedPosition.x || rect.top !== constrainedPosition.y) {
      this.setElementPosition(constrainedPosition.x, constrainedPosition.y);
      this.savePosition(constrainedPosition.x, constrainedPosition.y);
    }
  }
}

// 職缺抓取器工廠類別
class JobScraperFactory {
  static createScraper(site = null) {
    const currentSite = site || SiteDetector.getCurrentSite();
    
    switch (currentSite) {
      case 'linkedin':
        return new LinkedInJobScraper();
      case '104':
        // TODO: 實作 104JobScraper
        console.log('104 scraper not implemented yet');
        return null;
      case '1111':
        // TODO: 實作 1111JobScraper
        console.log('1111 scraper not implemented yet');
        return null;
      case 'yourator':
        // TODO: 實作 YouratorJobScraper
        console.log('Yourator scraper not implemented yet');
        return null;
      case 'cakeresume':
        // TODO: 實作 CakeResumeJobScraper
        console.log('CakeResume scraper not implemented yet');
        return null;
      default:
        console.warn('Unsupported site:', currentSite);
        return null;
    }
  }
}

async function initScraper() {
  // 檢查當前網站
  const currentSite = SiteDetector.getCurrentSite();
  console.log('🔍 Current site detected:', currentSite);
  
  // 檢查是否為職缺頁面
  const isJobPage = SiteDetector.isJobPage();
  console.log('📋 Is job page:', isJobPage, 'URL:', window.location.href);
  
  if (!isJobPage) {
    console.log('ℹ️ Not a job page, scraper not initialized');
    return;
  }
  
  // 獲取網站配置
  let siteConfig = SiteDetector.getSiteConfig();
  if (!siteConfig) {
    console.warn('⚠️ No site configuration found for:', currentSite);
    // 使用預設配置
    siteConfig = {
      name: 'Unknown Site',
      buttonText: '📋 Scrape to Notion'
    };
    console.log('Using default configuration');
  }
  
  // 新增懸浮抓取按鈕
  if (!document.getElementById('universal-scraper-btn')) {
    const button = document.createElement('button');
    button.id = 'universal-scraper-btn';
    button.innerHTML = siteConfig.buttonText;
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
      cursor: grab;
      font-weight: bold;
      box-shadow: 0 4px 12px rgba(0,102,204,0.3);
      transition: transform 0.1s ease;
      user-select: none;
    `;
    
    // 建立拖動處理器
    const dragHandler = new DragHandler(button);
    
    // 懸停效果（僅在非拖動時觸發）
    button.addEventListener('mouseenter', () => {
      if (!dragHandler.isDragging) {
        button.style.transform = 'translateY(-2px)';
        button.style.boxShadow = '0 6px 16px rgba(0,102,204,0.4)';
      }
    });
    
    button.addEventListener('mouseleave', () => {
      if (!dragHandler.isDragging) {
        button.style.transform = 'translateY(0)';
        button.style.boxShadow = '0 4px 12px rgba(0,102,204,0.3)';
      }
    });
    
    // 點擊事件（僅在未顯著移動時觸發）
    button.addEventListener('click', () => {
      if (!dragHandler.hasMovedSignificantly) {
        chrome.runtime.sendMessage({ action: 'openPopup' });
      }
    });
    
    document.body.appendChild(button);
    console.log('✅ Universal scraper button initialized for', siteConfig.name);
  }
}

// Message listener for universal scraper
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  console.log('Universal scraper received message:', request);
  
  if (request.action === 'ping') {
    console.log('Ping received, responding...');
    const currentSite = SiteDetector.getCurrentSite();
    const isJobPage = SiteDetector.isJobPage();
    sendResponse({ 
      success: true, 
      message: 'Universal scraper loaded', 
      url: window.location.href,
      site: currentSite,
      isJobPage: isJobPage
    });
  } else if (request.action === 'debug') {
    debugPageElements();
    sendResponse({ success: true, message: 'Debug completed' });
  } else if (request.action === 'scrapeJob') {
    console.log('Scrape job request received');
    (async () => {
      try {
        // 檢查當前頁面是否為支援的職缺頁面
        const currentSite = SiteDetector.getCurrentSite();
        if (currentSite === 'unknown') {
          throw new Error('Unsupported job site');
        }
        
        if (!SiteDetector.isJobPage()) {
          throw new Error('Not on a job page');
        }
        
        // 使用工廠模式創建對應的抓取器
        const scraper = JobScraperFactory.createScraper(currentSite);
        if (!scraper) {
          throw new Error(`Scraper not available for ${currentSite}`);
        }
        
        // 執行抓取
        const jobData = await scraper.scrapeJob();
        console.log('Job data scraped:', jobData);
        sendResponse({ success: true, data: jobData });
      } catch (error) {
        console.error('Scraping error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
  }
  return true;
});

// Show scraping button after page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initScraper);
} else {
  initScraper();
}