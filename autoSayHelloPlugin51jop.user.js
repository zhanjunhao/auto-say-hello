// ==UserScript==
// @name         前程无忧PC端自动投递简历脚本（可配置版+薪资过滤）
// @namespace    http://tampermonkey.net/
// @version      2026.01.15
// @description  支持前端/AI Agent模式切换，支持薪资区间交集匹配的自动投递脚本。
// @author       wood (refactored)
// @match        https://we.51job.com/pc/search*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ==================== 配置中心 ====================
  const CONFIG = {
    activeMode: 'aiAgent',

    // ---- 薪资期望配置（单位：元/月）----
    salary: {
      min: 15000,        // 期望最低月薪
      max: 30000,        // 期望最高月薪（如无上限可设为 Infinity 或 999999）
      ifMissing: 'pass', // 页面未显示薪资时的策略: 'pass' (默认通过) 或 'reject' (默认拒绝)
    },

    // ---- 投递节奏控制 ----
    delay: { min: 1000, max: 2000 },
    pageTurnDelay: { min: 2000, max: 3000 },

    // ---- 各模式配置 ----
    modes: {
      frontend: {
        name: '前端开发',
        requiredKeywords: /(前端|web|h5)/i,
        blacklist: [
          'react', 'angular', 'flutter', 'cocos', 'laya', 'lay', '白鹭',
          'gis', 'geo', 'unity', 'webgl', '2d', '3d', '三维', '射频',
          'pc', '游戏', 'MES', '大数据', '大模型', 'ai', '区块链',
          '鸿蒙', 'harmonyos', '外派', '第三方', '全栈', '软件',
          '英语', '口语', '外包', '劳务', '派遣', '驻场', '后端',
          '后台', 'UI', '设计', '初级', '实习', '兼职', '日结',
          '短期', 'net', 'c#', 'c++', 'java', 'go', 'golang',
          'python', 'php', '安卓', '苹果', 'android', 'ios',
        ],
        conflictRoles: /(销售|市场|商务|客服|运营|主播|顾问|代理)/iu,
        techKeywords: /(工程师|开发|架构|技术)/iu,
        positionHalfLimit: true,
        positionHalfRatio: 0.5,
      },

      aiAgent: {
        name: 'AI Agent 开发',
        requiredKeywords: /(agent|智能体|ai\s*应用|大模型|LLM|AI\s*开发|ai\s*agent)/i,
        blacklist: [
          '销售', '市场', '商务', '客服', '运营', '主播', '顾问',
          '代理', '实习', '兼职', '日结', '短期', '初级',
          '游戏', '区块链', '鸿蒙', 'harmonyos',
          'java', 'php', 'android', 'ios', '安卓', '苹果',
          'ui设计', '视觉设计', '平面设计',
          '数据标注', '数据录入', '客服专员',
          '电话销售', '房产', '保险', '金融销售',
          'cocos', 'unity', 'webgl', '三维',
          '单片机', '嵌入式', '硬件', '射频',
          '前端', 'web前端', 'h5',
          '运维', '测试工程师', '功能测试', '自动化测试',
        ],
        conflictRoles: /(销售|市场|商务|客服|运营|主播|顾问|代理|行政|人事|财务)/iu,
        techKeywords: /(工程师|开发|架构|技术|研发|算法|应用|平台|专家)/iu,
        positionHalfLimit: false,
        positionHalfRatio: 0.5,
      },
    },
  };

  // ==================== 薪资解析与匹配模块 ====================

  /**
   * 解析薪资字符串，统一转换为 { min: 元/月, max: 元/月 }
   * 支持格式：
   * - "25-40万/年"
   * - "1.2-1.8万·13薪"
   * - "6.5千-1.2万"
   * - "1.6-2.4万"
   * - "15-25K"
   */
  function parseSalary(salaryStr) {
    if (!salaryStr || typeof salaryStr !== 'string') return null;

    // 清理空格和全角符号
    const cleanStr = salaryStr.replace(/\s+/g, '').replace(/[－—]/g, '-');

    // 正则匹配：数字(万|千|K)? - 数字(万|千|K)? (/年|·13薪|薪)?
    // 捕获组: 1:最小数字, 2:最小单位, 3:最大数字, 4:最大单位, 5:时间/薪数单位, 6:具体薪数
    const regex = /(\d+(?:\.\d+)?)([万千Kk]?)-(\d+(?:\.\d+)?)([万千Kk]?)(?:\/(年|月)|·(\d+)薪)?/;
    const match = cleanStr.match(regex);
    if (!match) return null;

    const minVal = parseFloat(match[1]);
    const unit1 = match[2];
    const maxVal = parseFloat(match[3]);
    const unit2 = match[4];
    const timeUnit = match[5]; // '年' 或 '月'
    const months = match[6] ? parseInt(match[6], 10) : 12; // 默认12薪

    // 单位转“元”
    const toYuan = (val, unit) => {
      if (unit === '万') return val * 10000;
      if (unit === '千' || unit === 'K' || unit === 'k') return val * 1000;
      return val;
    };

    let minYuan = toYuan(minVal, unit1);
    let maxYuan = toYuan(maxVal, unit2);

    // 如果只有第一个数字有单位，第二个没单位（如 1.2-1.8万），则共用单位
    if (!unit2 && unit1) {
      maxYuan = toYuan(maxVal, unit1);
    }
    // 处理 6.5千-1.2万 这种，上面已正确解析 unit1='千', unit2='万' 无需特殊处理

    // 时间单位转换
    if (timeUnit === '年') {
      minYuan = minYuan / months;
      maxYuan = maxYuan / months;
    } else if (timeUnit === '月' && months !== 12) {
      // 处理 ·13薪 等：等效月薪 = 基础月薪 * 13 / 12
      minYuan = minYuan * months / 12;
      maxYuan = maxYuan * months / 12;
    }

    return {
      min: Math.round(minYuan),
      max: Math.round(maxYuan),
      original: salaryStr,
    };
  }

  /**
   * 判断岗位薪资与期望薪资是否有交集
   * @param {Object} jobSalary 解析后的岗位薪资 { min, max }
   * @param {Object} userSalary 配置中的期望薪资 { min, max }
   */
  function checkSalaryIntersection(jobSalary, userSalary) {
    if (!jobSalary) return CONFIG.salary.ifMissing === 'pass';
    return jobSalary.min <= userSalary.max && jobSalary.max >= userSalary.min;
  }

  // ==================== 核心匹配逻辑 ====================

  /**
   * 校验职位信息（标题 + 薪资）
   * @param {HTMLElement} item 职位列表项DOM元素
   */
  function validateJob(item) {
    const title = item.querySelector('.joblist-item-jobname .jname')?.textContent;
    if (!title || typeof title !== 'string') return false;

    const mode = CONFIG.modes[getActiveMode()];
    if (!mode) return false;

    const lowerTitle = title.toLowerCase();

    // 1. 黑名单校验
    if (mode.blacklist.some(word => lowerTitle.includes(word.toLowerCase()))) return false;

    // 2. 必选关键词校验
    if (!mode.requiredKeywords.test(title)) return false;

    // 3. 位置约束校验
    if (mode.positionHalfLimit) {
      const halfLength = Math.ceil(title.length * mode.positionHalfRatio);
      const positionRegex = new RegExp(`^.{0,${halfLength}}?([^]*?(${mode.requiredKeywords.source}))`, 'iu');
      if (!positionRegex.test(title)) return false;
    }

    // 4. 冲突岗位校验
    if (mode.conflictRoles.test(title)) return false;

    // 5. 技术岗位特征校验
    if (!mode.techKeywords.test(title)) return false;

    // 6. 薪资校验
    // 51job常见的薪资元素类名，做多重兜底
    const salaryEl = item.querySelector('.sal') || 
                     item.querySelector('.joblist-item-salary') || 
                     item.querySelector('[class*="salary"]');
    const salaryStr = salaryEl ? salaryEl.textContent.trim() : '';
    
    const jobSalary = parseSalary(salaryStr);
    if (!checkSalaryIntersection(jobSalary, CONFIG.salary)) {
      console.log(`[自动投递] 薪资不符跳过: ${title} (${salaryStr || '未知薪资'}) -> 解析为: ${jobSalary ? `${jobSalary.min}-${jobSalary.max}元/月` : '无'}`);
      return false;
    }

    console.log(`[自动投递] 匹配成功: ${title} | 薪资: ${salaryStr || '未知'} (交集通过)`);
    return true;
  }

  // ==================== 自动投递主流程 ====================

  async function autoSend() {
    bindEvent();

    const currentMode = getActiveMode();
    const modeName = CONFIG.modes[currentMode]?.name || currentMode;
    console.log(`[自动投递] 当前模式：${modeName}，期望薪资：${CONFIG.salary.min}-${CONFIG.salary.max}元/月，开始扫描...`);

    let count = 0;
    const jobList = document.querySelectorAll('.joblist .joblist-item');

    for (const item of jobList) {
      if (validateJob(item)) {
        await delay(getRandomInterval(CONFIG.delay.min, CONFIG.delay.max));

        const btnEle = item.querySelector('.btn.apply');
        if (btnEle && !btnEle.classList.contains('active')) {
          btnEle.click();
          count++;

          await delay(1500, () => {
            const popupElement = document.querySelector('.success-popup');
            if (popupElement) {
              const closeBtn = popupElement.querySelector('.close-button');
              if (isElementDisplayed(closeBtn)) closeBtn.click();
            }
          });
        }
      }
    }

    if (count === 0) {
      console.log(`[自动投递] ${modeName} 模式下本次未匹配到可投递的公司`);
    } else {
      console.log(`[自动投递] ${modeName} 模式下本次共投递 ${count} 家公司`);
    }

    clickNextPage();
  }

  // ==================== 配置读取与菜单 ====================
  function getActiveMode() {
    const saved = (typeof GM_getValue === 'function') ? GM_getValue('activeMode', null) : null;
    return saved && CONFIG.modes[saved] ? saved : CONFIG.activeMode;
  }

  function setActiveMode(modeKey) {
    if (!CONFIG.modes[modeKey]) return;
    CONFIG.activeMode = modeKey;
    if (typeof GM_setValue === 'function') GM_setValue('activeMode', modeKey);
    console.log(`[自动投递] 已切换模式：${CONFIG.modes[modeKey].name}`);
  }

  function registerMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    for (const [key, mode] of Object.entries(CONFIG.modes)) {
      GM_registerMenuCommand(`切换模式 → ${mode.name}`, () => setActiveMode(key));
    }
    GM_registerMenuCommand('查看当前配置', () => {
      const current = getActiveMode();
      console.table({
        当前模式: CONFIG.modes[current].name,
        模式Key: current,
        期望薪资: `${CONFIG.salary.min}~${CONFIG.salary.max}元/月`,
        无薪资策略: CONFIG.salary.ifMissing,
      });
    });
  }

  // ==================== 工具函数 ====================
  function clickNextPage() {
    const activePageEle = document.querySelector('.el-pager li[class*="active"]');
    if (!activePageEle) return;
    if (activePageEle.nextElementSibling) {
      activePageEle.classList.remove('active');
      activePageEle.nextElementSibling.click();
    } else {
      console.log('[自动投递] 已到最后一页，刷新页面重新开始');
      window.location.reload();
    }
  }

  function delay(timer, callBack) {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (typeof callBack === 'function') callBack();
        resolve();
      }, timer);
    });
  }

  function isElementDisplayed(element) {
    if (!element || !document.body.contains(element)) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && style.width !== '0px' && style.height !== '0px';
  }

  function bindEvent() {
    const pageButton = document.querySelectorAll('.el-pager li');
    for (const btn of pageButton) {
      if (btn.dataset.autoSendBound) continue;
      btn.dataset.autoSendBound = '1';
      btn.addEventListener('click', () => {
        if (!btn.classList.contains('active')) {
          setTimeout(autoSend, getRandomInterval(CONFIG.pageTurnDelay.min, CONFIG.pageTurnDelay.max));
        }
      });
    }
  }

  function getRandomInterval(min1, max2) {
    const min = min1 || 3000;
    const max = max2 || 5000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // ==================== 初始化 ====================
  function init() {
    registerMenu();
    setTimeout(() => autoSend(), 3000);
  }

  window.addEventListener('load', init);
})();