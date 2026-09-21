// ==UserScript==
// @name         Boss直聘移动端自动打招呼脚本
// @namespace    http://tampermonkey.net/
// @version      2026.09.21.3
// @description  自动和boss打招呼，减少操作负担。支持前端/AI 多岗位画像一键切换，并拦截页面跳转与外部App唤起。
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
    ACTIVE_PROFILE: "aiAgent",

    // 薪资区间(k)：与职位薪资区间有交集即通过（例：15-25k）
    MIN_SALARY: 15,
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

  // 页面 DOM 选择器（推荐页 / 搜索页(y_4) 结构不同，按优先级逐个尝试）
  const SELECTORS = {
    // 岗位列表项容器
    ITEM: [".job-list .item", ".job-list > .item", ".job-item", ".job-list li", ".item"],
    // 岗位标题
    TITLE: [".title-text", ".job-name", ".job-title .name", ".job-title .title-text"],
    // 薪资文本
    SALARY: [".salary", ".job-salary", ".salary-text"],
    // 打招呼按钮
    BUTTON: [".btn-chat", ".chat-btn", ".btn-chat-wrap", ".job-btn"]
  };

  /* ==============================
   * 二、导航守卫（阻止页面跳转与外部 App 唤起）
   * ------------------------------------------------------------
   * 背景：Boss 直聘移动端在点击「立即沟通」后会做两件干扰脚本的事：
   *   1) 通过自定义协议（如 weixin://）唤起外部 App，浏览器随即弹出
   *      「要打开 Weixin 吗」原生弹窗，页面 JS 主线程被挂起；
   *   2) 跳转到职位详情页，脚本因 @match 不匹配而整体失效。
   * 目标：拦截一切页面级跳转，仅放行脚本自身发起的 location.reload()。
   *
   * 六层拦截（互为兜底，任一层命中即可阻断）：
   *   L1 点击捕获   —— <a> 默认跳转（站点用 a.click() 程序化触发时同样生效）
   *   L2 window.open —— 新窗口与自定义协议唤起
   *   L3 属性写入   —— 锚点被写入外部协议 URL 时改写为无副作用的占位值
   *   L4 统一属性写入 —— setAttribute 写入 a[href] / iframe[src] 外部协议
   *   L5 iframe src 属性 —— iframe.src = "weixin://" 直接赋值唤起
   *   L6 Navigation API —— location.href / assign / replace 等脚本层跳转
   * ============================== */

  // 允许出现在链接中的协议，其余协议（weixin://、bosszp:// 等）一律视为唤起外部 App
  const SAFE_PROTOCOLS = ["http", "https", "about", "blob", "data", "javascript", "file"];

  // 判定 URL 是否为外部协议（相对路径、http(s) 链接均返回 false）
  function isExternalProtocol(url) {
    if (typeof url !== "string") return false;
    const matched = url.trim().match(/^([a-z][a-z0-9+.-]*):/i);
    if (!matched) return false;
    return !SAFE_PROTOCOLS.includes(matched[1].toLowerCase());
  }

  // 判定点击锚点是否真会产生页面跳转
  // （javascript: 伪协议、纯 # 锚点属于页内行为，交还站点自身处理，避免误伤按钮）
  function isPageNavigation(href) {
    const raw = (href || "").trim();
    if (!raw || raw.startsWith("#") || /^javascript:/i.test(raw)) return false;
    try {
      const target = new URL(raw, window.location.href);
      const current = window.location;
      return !(
        target.pathname === current.pathname &&
        target.search === current.search &&
        target.hash === current.hash
      );
    } catch (error) {
      return false;
    }
  }

  const navGuard = {
    // 脚本自身发起的刷新标记：守卫据此放行
    selfReloading: false,

    // L1 点击捕获：只 preventDefault、不阻断冒泡，保证站点自身的沟通逻辑（发消息请求）照常执行
    guardClick() {
      document.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) return;
        const anchor = event.target.closest("a[href]");
        if (!anchor) return;

        const href = anchor.getAttribute("href") || "";
        const isGreetingButton = /(立即沟通|聊一聊|继续沟通|马上沟通)/.test(anchor.textContent || "");

        // 外部协议唤起：阻止浏览器弹「要打开 App 吗」确认框
        // 沟通按钮本身若是外部协议链接，只 preventDefault、保留站点业务逻辑继续执行
        if (isExternalProtocol(href)) {
          event.preventDefault();
          if (!isGreetingButton) {
            event.stopImmediatePropagation();
          }
          console.warn(`[autoSayHello] 已拦截外部 App 唤起: ${href}`);
          return;
        }

        // 页面级跳转（职位详情页等）：仅阻止默认行为，站点点击逻辑保持可用
        if (isPageNavigation(href)) {
          event.preventDefault();
          console.warn(`[autoSayHello] 已拦截页面跳转: ${href}`);
        }
      }, true);
    },

    // L2 屏蔽 window.open：杜绝新窗口与自定义协议唤起
    guardWindowOpen() {
      window.open = function () {
        console.warn(`[autoSayHello] 已拦截 window.open: ${arguments[0]}`);
        return null;
      };
    },

    // L3 属性写入防护：锚点被写入外部协议时改写为占位值
    // （站点常见做法：创建 <a>、赋值 href 后 click()）
    guardSchemeWrite() {
      const hrefDescriptor = Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, "href");
      if (hrefDescriptor?.set) {
        Object.defineProperty(HTMLAnchorElement.prototype, "href", {
          configurable: hrefDescriptor.configurable,
          enumerable: hrefDescriptor.enumerable,
          get: hrefDescriptor.get,
          set(value) {
            if (isExternalProtocol(value)) {
              console.warn(`[autoSayHello] 已拦截外部协议写入: ${value}`);
              hrefDescriptor.set.call(this, "javascript:void(0)");
              return;
            }
            hrefDescriptor.set.call(this, value);
          }
        });
      }

      // 站点也可能绕过 href 属性、直接用 setAttribute 写入
      // 注意：setAttribute 的覆写统一放在 guardAttributeWrite 中，此处不再重复
    },

    // L4 统一属性写入防护：拦截所有元素通过 setAttribute 写入外部协议
    // （覆盖 a[href]、iframe[src] 等场景）
    guardAttributeWrite() {
      const originalSetAttribute = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (name, value) {
        const attrName = String(name).toLowerCase();

        // 锚点 href 写入外部协议
        if (attrName === "href" && this instanceof HTMLAnchorElement && isExternalProtocol(value)) {
          console.warn(`[autoSayHello] 已拦截外部协议写入: ${value}`);
          return originalSetAttribute.call(this, name, "javascript:void(0)");
        }

        // iframe src 写入外部协议
        // if (attrName === "src" && this instanceof HTMLIFrameElement && isExternalProtocol(value)) {
        //   console.warn(`[autoSayHello] 已拦截 iframe 外部协议: ${value}`);
        //   return originalSetAttribute.call(this, name, "about:blank");
        // }

        return originalSetAttribute.call(this, name, value);
      };
    },

    // L5 iframe src 属性防护：拦截 iframe 被直接赋值 src
    // （站点常见做法：iframe.src = "weixin://" 唤起 App）
    guardIframeSrc() {
      const iframeSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src");
      if (iframeSrcDescriptor?.set) {
        Object.defineProperty(HTMLIFrameElement.prototype, "src", {
          configurable: iframeSrcDescriptor.configurable,
          enumerable: iframeSrcDescriptor.enumerable,
          get: iframeSrcDescriptor.get,
          set(value) {
            if (isExternalProtocol(value)) {
              console.warn(`[autoSayHello] 已拦截 iframe 外部协议: ${value}`);
              // 改写为空白页，避免浏览器弹出外部协议确认框
              iframeSrcDescriptor.set.call(this, "about:blank");
              return;
            }
            iframeSrcDescriptor.set.call(this, value);
          }
        });
      }
    },

    // L6 Navigation API 兜底：拦截 location.href / assign / replace 等脚本层跳转
    // （浏览器不支持该 API 时自动跳过，前五层仍然生效）
    guardLocationChange() {
      const navigationApi = window.navigation;
      if (typeof navigationApi?.addEventListener !== "function") return;

      navigationApi.addEventListener("navigate", (event) => {
        const destination = event.destination;
        const navigationType = destination?.navigationType || event.navigationType;

        // 放行：同文档跳转（hash/路由）、脚本自身发起的刷新、页面刷新
        if (destination?.sameDocument) return;
        if (navGuard.selfReloading || navigationType === "reload") return;

        event.preventDefault();
        console.warn(`[autoSayHello] 已拦截页面跳转: ${destination?.url || ""}`);
      });
    },

    install() {
      this.guardClick();
      this.guardWindowOpen();
      this.guardSchemeWrite();
      this.guardAttributeWrite();
      this.guardIframeSrc();
      this.guardLocationChange();
      console.log("[autoSayHello] 导航守卫已启用：拦截页面跳转与外部 App 唤起，仅放行刷新");
    }
  };

  navGuard.install();

  /* ==============================
   * 三、岗位画像注册表（扩展入口）
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
   * 四、岗位名称校验
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
  // 用 exec 取匹配位置而非切片判断，避免短标题把关键词拦腰截断（如 "AI Agent工程师" 前6字符是 "AI Agen"）
  function isKeywordInFirstHalf(title, regex) {
    const match = regex.exec(title);
    if (!match) return false;
    return match.index < Math.ceil(title.length / 2);
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
   * 五、统计面板
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
  // body 尚未就绪时（极端时序）延迟挂载，避免空指针导致整个脚本中断
  if (document.body) {
    document.body.appendChild(counterDiv);
  } else {
    document.addEventListener("DOMContentLoaded", () => document.body.appendChild(counterDiv));
  }

  /* ==============================
   * 六、状态与定时器管理
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
   * 七、薪资校验
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
   * 八、滚动加载控制器
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
        const items = collectItems();
        if (items.length) {
          observer.disconnect();
          processPageData();
        }
      }).observe(document.body, { childList: true, subtree: true });
    }, getRandomInterval(CONFIG.SCROLL_INTERVAL));
  }

  // 通用刷新页面方法
  // 刷新是导航守卫唯一放行的跳转，因此需先置位标记再执行
  function refreshPage(force = false) {
    navGuard.selfReloading = true;

    // 方法1: 使用 location.reload() - 最可靠的方式
    if (window.location.reload) {
      window.location.reload(force); // force 为 true 时强制绕过缓存
      return;
    }

    // 方法2: 重新设置当前URL（兜底，此时同样依赖上面的放行标记）
    window.location.href = window.location.href;
  }

  /* ==============================
   * 九、核心处理器
   * ============================== */

  // ---- DOM 提取工具（适配推荐页 / 搜索页不同结构）----
  // 按优先级尝试多个选择器，返回第一个匹配的元素（不存在则 null）
  function queryFirst(root, selectors) {
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  // 按优先级提取元素文本并去空白（全部选择器都没内容则返回空串）
  function extractText(root, selectors) {
    for (const selector of selectors) {
      const text = root.querySelector(selector)?.textContent?.trim();
      if (text) return text;
    }
    return "";
  }

  // 收集页面上的岗位列表项（任一列表选择器命中即返回，避免搜索页容器不同导致空列表）
  function collectItems() {
    for (const selector of SELECTORS.ITEM) {
      const items = document.querySelectorAll(selector);
      if (items.length) return Array.from(items);
    }
    return [];
  }

  // 判断元素是否为打招呼按钮（按常见文案匹配，覆盖不同版本的按钮措辞）
  function isGreetButton(el) {
    return /(立即沟通|聊一聊|继续沟通|马上沟通)/.test(el.textContent || "");
  }

  function processPageData() {
    if (state.isStopped || state.isProcessing) return;

    const items = collectItems();
    const validButtons = items.reduce((acc, item) => {
      const button = queryFirst(item, SELECTORS.BUTTON);
      const title = extractText(item, SELECTORS.TITLE);
      const salary = extractText(item, SELECTORS.SALARY);
      if (
        button &&
        isGreetButton(button) &&
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

    // 匹配为 0 时输出每条的过滤原因，方便排查页面结构 / 画像 / 薪资问题
    if (validButtons.length === 0 && items.length > 0) {
      items.slice(0, 10).forEach((item) => {
        const title = extractText(item, SELECTORS.TITLE);
        const salary = extractText(item, SELECTORS.SALARY);
        const button = queryFirst(item, SELECTORS.BUTTON);
        const reasons = [];
        if (!title) reasons.push("无标题(选择器未命中)");
        if (!salary) reasons.push("无薪资(选择器未命中)");
        if (!button || !isGreetButton(button)) reasons.push("无沟通按钮(选择器/文案未命中)");
        if (title && salary) {
          if (!validateJobTitle(title, activeProfile)) reasons.push("画像校验失败");
          if (!checkSalary(salary)) reasons.push("薪资不匹配");
        }
        console.log(
          `[autoSayHello][诊断] "${title || "-"}" | ${salary || "-"} | ${reasons.join("；") || "通过"}`
        );
      });
    }

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
        const button = buttons[index];
        button.click();
        button.textContent = "已沟通";
        counterDiv.textContent = `成功发送${++state.successCount}次 | 岗位:${activeProfile.name}`;
        clickNext(index + 1);
      }, getRandomInterval(CONFIG.GREET_INTERVAL));

      timerPool.clickTimers.push(timerId);
    };
    clickNext(0);
  }

  /* ==============================
   * 十、初始化模块
   * ============================== */

  window.addEventListener("load", () => {
    // 列表可能延迟渲染，先测高后重试，保证后续滚动距离计算正确
    const measureHeight = () => {
      const sampleItem = collectItems()[0];
      if (sampleItem) {
        const style = getComputedStyle(sampleItem);
        CONFIG.ITEM_HEIGHT = sampleItem.offsetHeight +
          parseInt(style.marginTop) +
          parseInt(style.marginBottom);
      }
    };
    measureHeight();
    setTimeout(measureHeight, 2000);

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

    // DOM监听器：观察列表容器，搜索页可能无 .job-list，回退观察整个 body
    const observeRoot = document.querySelector(".job-list") || document.body;
    timerPool.observer = new MutationObserver(mutations => {
      mutations.some(mutation => mutation.addedNodes.length) && processPageData();
    });
    timerPool.observer.observe(observeRoot, {
      childList: true,
      subtree: true
    });

    // 初次处理 + 延迟重试（等待首屏列表渲染完成，避免首跑拿到空列表）
    processPageData();
    setTimeout(processPageData, 1500);
    setTimeout(processPageData, 3000);
  });
})();