// ==UserScript==
// @name         Boss直聘移动端自动打招呼脚本
// @namespace    http://tampermonkey.net/
// @version      2026.09.21
// @description  自动和boss打招呼，减少操作负担。支持前端/AI 多岗位画像一键切换。
// @author       wood
// @match        *://*.zhipin.com/c101280100*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  /* ==============================
   * 一、配置区（按需修改）
   * ============================== */
  const CONFIG = {
    // ★ 岗位画像开关：切换打招呼的目标岗位
    // 可选值：frontend(前端开发) | aiAgent(AI Agent 应用开发)
    //        | aiApp(AI 应用开发) | aiFullstack(AI 应用全栈开发)
    // 具体画像定义见下方 JOB_PROFILES，可自由扩展新岗位
    ACTIVE_PROFILE: "frontend",

    // 薪资区间(k)：与职位薪资区间有交集即通过（例：12-25k）
    MIN_SALARY: 12,
    MAX_SALARY: 25,

    // 打招呼间隔(毫秒)：每次从 [MIN, MAX] 中随机取值
    // 模拟人工操作节奏，降低被后端风控识别为机器请求的风险
    GREET_INTERVAL: { MIN: 1000, MAX: 3000 },

    // 滚动加载间隔(毫秒)：每次随机，留足页面渲染时间
    SCROLL_INTERVAL: { MIN: 2000, MAX: 3000 },

    // 滚动/加载行为参数（一般无需改动）
    SCROLL_OFFSET: 500,
    LOADING_DELAY: 3000,
    ITEM_HEIGHT: 0,
    LOADMORE_SELECTOR: ".loadmore.disabled"
  };

  /* ==============================
   * 二、岗位画像注册表（扩展入口）
   * 新增岗位：复制一个配置块，填写 name / requiredRegex / positionRegex / blacklist，
   * 然后在 CONFIG.ACTIVE_PROFILE 中切换即可。
   * - requiredRegex : 标题必须包含的关键词（不区分大小写）
   * - positionRegex : requiredRegex 对应的关键词须出现在标题前半段
   * - blacklist     : 标题含任一黑名单词即过滤
   * ============================== */

  // 所有岗位画像共用的黑名单（用工形态/级别类，与具体技术栈无关）
  const COMMON_BLACKLIST = [
    "外派", "第三方", "外包", "劳务", "派遣", "驻场",
    "初级", "实习", "兼职", "日结", "短期", "英语", "口语"
  ];

  // 各画像共用的过滤规则
  const CONFLICT_ROLES = /(销售|市场|商务|客服|运营|主播|顾问|代理)/iu; // 矛盾职位（非研发岗）
  const TECH_KEYWORDS = /(工程师|开发|架构|技术)/iu;                    // 技术岗位特征

  const JOB_PROFILES = {
    // 前端开发（原始画像）
    frontend: {
      name: "前端开发",
      requiredRegex: /(前端|web|h5)/i,
      positionRegex: /(前端|web|h5)/i,
      blacklist: [
        ...COMMON_BLACKLIST,
        "angular", "flutter", "cocos", "laya", "lay", "白鹭", "gis", "geo", "unity",
        "webgl", "2d", "3d", "三维", "射频", "pc", "游戏", "mes", "大数据", "大模型",
        "区块链", "鸿蒙", "harmonyos", "软件", "后端", "后台", "ui", "设计",
        "net", "c#", "c++", "java", "go", "golang", "python", "php", "安卓", "苹果", "android", "ios"
      ]
    },

    // AI Agent 应用开发（含智能体开发）
    aiAgent: {
      name: "AI Agent 应用开发",
      requiredRegex: /(ai\s*agent|智能体|agent)/i,
      positionRegex: /(ai\s*agent|智能体|agent)/i,
      blacklist: [
        ...COMMON_BLACKLIST,
        "unreal", "unity", "cocos", "flutter", "gis", "geo", "webgl",
        "2d", "3d", "三维", "游戏", "射频", "pc", "mes", "区块链", "鸿蒙", "harmonyos",
        "net", "c#", "c++", "php", "安卓", "苹果", "android", "ios", "测试", "运维"
      ]
    },

    // AI 应用开发（AI 相关词须邻近"应用/开发"，避免误匹配算法/产品岗）
    aiApp: {
      name: "AI 应用开发",
      requiredRegex: /((ai|人工智能|aigc|大模型)[^，,。\s]{0,8}(应用|开发))/i,
      positionRegex: /(ai|人工智能|aigc|大模型)/i,
      blacklist: [
        ...COMMON_BLACKLIST,
        "unreal", "unity", "cocos", "flutter", "gis", "webgl",
        "2d", "3d", "三维", "游戏", "pc", "区块链", "鸿蒙", "harmonyos",
        "net", "c#", "c++", "php", "安卓", "苹果", "android", "ios", "嵌入式", "芯片", "测试", "运维"
      ]
    },

    // AI 应用全栈开发（AI 相关词与"全栈"邻近出现，顺序不限）
    aiFullstack: {
      name: "AI 应用全栈开发",
      requiredRegex: /((ai|人工智能|aigc|大模型)[^，,。\s]{0,12}(全栈|full\s*stack)|(全栈|full\s*stack)[^，,。\s]{0,12}(ai|人工智能|aigc|大模型))/i,
      positionRegex: /(ai|人工智能|aigc|大模型|全栈|full\s*stack)/i,
      blacklist: [
        ...COMMON_BLACKLIST,
        "unreal", "unity", "cocos", "flutter", "gis", "webgl",
        "2d", "3d", "三维", "游戏", "pc", "区块链", "鸿蒙", "harmonyos",
        "net", "c#", "c++", "php", "安卓", "苹果", "android", "ios", "嵌入式", "芯片", "测试", "运维"
      ]
    }
  };

  /* ==============================
   * 三、岗位名称校验
   * ============================== */

  // 解析当前启用的岗位画像（未知 key 时回退到 frontend 并报错提示）
  function resolveProfile() {
    const profile = JOB_PROFILES[CONFIG.ACTIVE_PROFILE];
    if (!profile) {
      console.error(`[autoSayHello] 未知岗位画像: ${CONFIG.ACTIVE_PROFILE}，已回退到 frontend`);
      return JOB_PROFILES.frontend;
    }
    return profile;
  }

  // 关键词是否出现在标题前半段
  // （关键词只出现在后半段的，多为"偏 XXX / XXX 方向"型岗位，直接过滤）
  function isKeywordInFirstHalf(title, regex) {
    const firstHalf = title.slice(0, Math.ceil(title.length / 2));
    return regex.test(firstHalf);
  }

  // 五重验证：黑名单 / 必选关键词 / 关键词位置 / 矛盾职位 / 技术岗特征
  function validateJobTitle(title, profile) {
    const lower = title.toLowerCase();

    // 黑名单校验：标题含任一黑名单词即排除
    const isBlacklistValid = !profile.blacklist.some((word) =>
      lower.includes(word.toLowerCase())
    );

    // 画像校验：标题必须包含画像必选关键词
    const hasRequiredKeyword = profile.requiredRegex.test(title);

    // 位置校验：必选关键词须出现在标题前半段
    const isPositionValid = isKeywordInFirstHalf(title, profile.positionRegex);

    // 角色校验：排除销售/客服等非研发岗
    const isRoleValid = !CONFLICT_ROLES.test(title);

    // 技术校验：必须体现工程师/开发等技术岗特征（兜底排除产品/经理/助理等）
    const isTechValid = TECH_KEYWORDS.test(title);

    return (
      isBlacklistValid &&
      hasRequiredKeyword &&
      isPositionValid &&
      isRoleValid &&
      isTechValid
    );
  }

  /* ==============================
   * 四、统计面板
   * ============================== */

  // 运行时锁定当前画像（如需切换，修改 CONFIG.ACTIVE_PROFILE 后刷新页面）
  const activeProfile = resolveProfile();

  const counterDiv = document.createElement("div");
  counterDiv.className = "counterDiv";
  counterDiv.textContent = `成功发送0次 | 岗位:${activeProfile.name}`;
  counterDiv.style.cssText = `
    position: fixed; bottom: 20px; right: 20px;
    background: rgba(0,200,100,0.8); color: white;
    padding: 10px 15px; border-radius: 5px; z-index: 9999;
  `;
  document.body.appendChild(counterDiv);

  /* ==============================
   * 五、状态与定时器管理
   * ============================== */

  const state = {
    successCount: 0,
    isLoading: false,
    isProcessing: false,
    isStopped: false
  };

  const timerPool = {
    clickTimers: [],
    scrollTimer: null,
    observer: null,
    clearAll() {
      this.clickTimers.forEach(clearTimeout);
      clearTimeout(this.scrollTimer);
    }
  };

  /* ==============================
   * 六、薪资校验
   * ============================== */

  // 在 [min, max] 区间内生成随机整数（含边界）
  function getRandomInterval(range) {
    const { MIN: min, MAX: max } = range;
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  // 检查薪资范围：职位薪资区间与配置区间是否有交集；"面议"直接通过
  function checkSalary(salaryText) {
    if (salaryText.includes("面议")) return true;
    const match = salaryText.match(/(\d+)(?:-(\d+))?k/i); // 忽略大小写
    if (!match) return false;
    const min = parseInt(match[1], 10);
    const max = match[2] ? parseInt(match[2], 10) : min;
    return max >= CONFIG.MIN_SALARY && min <= CONFIG.MAX_SALARY; // 判断是否有交集
  }

  /* ==============================
   * 七、滚动加载控制器
   * ============================== */

  function autoScrollAndLoad() {
    if (state.isStopped) return;
    if (document.querySelector(CONFIG.LOADMORE_SELECTOR)?.textContent.includes("没有更多了")) {
      window.scrollTo({
        top: Number.MAX_SAFE_INTEGER,
        behavior: "smooth"
      });
      timerPool.clearAll();
      timerPool.observer?.disconnect();
      state.isStopped = true;
      return refreshPage();
    }

    clearTimeout(timerPool.scrollTimer);
    timerPool.scrollTimer = setTimeout(() => {
      window.scrollTo({
        top: window.scrollY + CONFIG.ITEM_HEIGHT * 20,
        behavior: "smooth"
      });

      new MutationObserver((_, observer) => {
        const items = document.querySelectorAll('.job-list .item');
        if (items.length) {
          observer.disconnect();
          processPageData();
        }
      }).observe(document.body, { childList: true, subtree: true });
    }, getRandomInterval(CONFIG.SCROLL_INTERVAL));
  }

  // 通用刷新页面方法
  function refreshPage(force = false) {
    // 方法1: 使用 location.reload() - 最可靠的方式
    if (window.location.reload) {
      window.location.reload(force); // force 为 true 时强制绕过缓存
      return;
    }

    // 方法2: 重新设置当前URL
    window.location.href = window.location.href;
  }

  /* ==============================
   * 八、核心处理器
   * ============================== */

  function processPageData() {
    if (state.isStopped || state.isProcessing) return;

    const items = document.querySelectorAll(".job-list .item");
    const validButtons = Array.from(items).reduce((acc, item) => {
      const button = item.querySelector(".btn-chat");
      const title = item.querySelector(".title-text")?.textContent?.trim();
      const salary = item.querySelector(".salary")?.textContent?.trim();
      if (
        button?.textContent.includes("立即沟通") &&
        title &&
        salary &&
        validateJobTitle(title, activeProfile) &&
        checkSalary(salary)
      ) {
        acc.push(button);
      }
      return acc;
    }, []);

    // console.log(validButtons);
    console.log(`[${activeProfile.name}] 本次匹配到${validButtons.length}家公司！`);

    processValidButtons(validButtons);
  }

  // 点击序列控制器：逐个打招呼，间隔取 CONFIG.GREET_INTERVAL 随机值
  function processValidButtons(buttons) {
    state.isProcessing = true;
    timerPool.clickTimers = [];

    const clickNext = index => {
      if (index >= buttons.length) {
        state.isProcessing = false;
        autoScrollAndLoad();
        return;
      }

      const timerId = setTimeout(() => {
        buttons[index].click();
        counterDiv.textContent = `成功发送${++state.successCount}次 | 岗位:${activeProfile.name}`;
        clickNext(index + 1);
      }, getRandomInterval(CONFIG.GREET_INTERVAL));

      timerPool.clickTimers.push(timerId);
    };
    clickNext(0);
  }

  /* ==============================
   * 九、初始化模块
   * ============================== */

  window.addEventListener("load", () => {
    const sampleItem = document.querySelector(".job-list .item");
    if (sampleItem) {
      const style = getComputedStyle(sampleItem);
      CONFIG.ITEM_HEIGHT = sampleItem.offsetHeight +
        parseInt(style.marginTop) +
        parseInt(style.marginBottom);
    }

    // 滚动监听器
    let lastScrollTime = 0;
    window.addEventListener("scroll", () => {
      const now = Date.now();
      if (now - lastScrollTime < 500) return;
      lastScrollTime = now;

      // 检测页面滚动状态：当视口底部接近文档底部（距离底部<500px）时触发加载
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - CONFIG.SCROLL_OFFSET) {
        // 防重复加载锁
        state.isLoading = true;

        // 延迟执行加载处理（等待页面渲染新数据）
        setTimeout(() => {
          processPageData();  // 处理新加载的职位数据
          state.isLoading = false; // 解锁加载状态
        }, CONFIG.LOADING_DELAY); // 延时3000ms(预定义)
      }
    });

    // DOM监听器
    timerPool.observer = new MutationObserver(mutations => {
      mutations.some(mutation => mutation.addedNodes.length) && processPageData();
    });
    timerPool.observer.observe(document.querySelector(".job-list"), {
      childList: true,
      subtree: true
    });

    processPageData();
  });
})();