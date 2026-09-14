// ==UserScript==
// @name         BOSS直聘移动端 · 职位详情自动跳转
// @namespace    https://github.com/zhanjunhao/auto-say-hello
// @version      1.0.0
// @description  在 m.zhipin.com 职位详情页加载完成后，随机等待 1.5~3 秒自动跳转到指定搜索列表页
// @author       zhanjunhao
// @match        https://m.zhipin.com/job_detail*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  /* ============================ 配置区（改这里就够了） ============================ */
  const CONFIG = Object.freeze({
    // 目标地址：深圳(101280100) / y_4 / 前端开发工程师
    TARGET_URL:
      'https://m.zhipin.com/c101280100/y_4/?query=' + encodeURIComponent('前端开发工程师'),

    // 随机延迟区间（毫秒）
    MIN_DELAY_MS: 1500,
    MAX_DELAY_MS: 3000,

    // load 事件兜底：页面资源长期挂起时，超过该时间也照样触发
    LOAD_TIMEOUT_MS: 8000,

    // 同一标签页会话内，两次自动跳转的最小间隔，防止 A→B→A 来回跳死循环
    REDIRECT_COOLDOWN_MS: 3000,

    // 页面 URL 二次校验（@match 之外的保险，避免误伤）
    PAGE_PATTERN: /^https:\/\/m\.zhipin\.com\/job_detail/i,

    // 调试日志开关，正式使用可置为 false
    DEBUG: true,
  });

  const STORAGE_KEY = '__boss_auto_redirect_ts__';
  const TAG = '[BossAutoRedirect]';

  /* ================================ 工具函数 ================================ */
  const logger = {
    info: (...args) => CONFIG.DEBUG && console.log(TAG, ...args),
    warn: (...args) => CONFIG.DEBUG && console.warn(TAG, ...args),
  };

  /** 生成 [min, max] 闭区间内的随机整数 */
  function randomInt(min, max) {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  }

  /** sessionStorage 在隐私模式/无痕窗口可能抛异常，统一兜底 */
  function sessionGet(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function sessionSet(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (e) {
      /* ignore */
    }
  }

  /* ================================== 状态 ================================== */
  let timerId = null;      // 延迟跳转的定时器
  let redirected = false;  // 是否已经发起过跳转

  /* ================================ 核心逻辑 ================================ */
  function isJobDetailPage() {
    return CONFIG.PAGE_PATTERN.test(window.location.href);
  }

  /** 是否处于冷却期（防止来回跳导致死循环） */
  function inCooldown() {
    const last = Number(sessionGet(STORAGE_KEY));
    return Number.isFinite(last) && last > 0 && Date.now() - last < CONFIG.REDIRECT_COOLDOWN_MS;
  }

  /** 真正执行跳转 */
  function doRedirect() {
    timerId = null;
    if (redirected) return;

    // 跳转前再校验一次：页面可能已被 SPA 路由或用户操作改变
    if (!isJobDetailPage()) {
      logger.warn('跳转前校验失败：当前已不在职位详情页，放弃跳转');
      return;
    }

    redirected = true;
    sessionSet(STORAGE_KEY, String(Date.now()));

    try {
      logger.info('正在跳转 ->', CONFIG.TARGET_URL);
      // replace：不写入历史栈，避免用户返回后又触发本脚本形成死循环
      // 若希望保留后退能力，把 replace 换成 assign 即可
      window.location.replace(CONFIG.TARGET_URL);
    } catch (err) {
      logger.warn('location.replace 失败，降级为 location.href', err);
      try {
        window.location.href = CONFIG.TARGET_URL;
      } catch (err2) {
        redirected = false; // 释放锁，允许后续重试
        logger.warn('跳转失败：', err2);
      }
    }
  }

  /** 安排一次随机延迟跳转 */
  function scheduleRedirect() {
    if (redirected || timerId !== null) return;

    if (!isJobDetailPage()) {
      logger.info('非职位详情页，跳过');
      return;
    }
    if (inCooldown()) {
      logger.info('处于跳转冷却期，跳过本次');
      return;
    }

    const delay = randomInt(CONFIG.MIN_DELAY_MS, CONFIG.MAX_DELAY_MS);
    logger.info(`页面就绪，将在 ${delay}ms 后跳转`);
    timerId = setTimeout(doRedirect, delay);
  }

  /**
   * 页面就绪判定：
   * 1) 已经 complete —— 立即执行
   * 2) load 事件 —— 正常路径
   * 3) 超时兜底 —— 广告/埋点等资源长期挂起时，load 可能永远不触发
   * 4) bfcache 恢复（pageshow.persisted）—— 不会再触发 load
   */
  function onPageReady(callback) {
    if (document.readyState === 'complete') {
      logger.info('页面就绪判定：readyState=complete');
      callback();
      return;
    }

    let done = false;
    let fallbackId = null;

    function finish(reason) {
      if (done) return;
      done = true;
      window.removeEventListener('load', onLoad);
      window.removeEventListener('pageshow', onPageShow);
      if (fallbackId !== null) clearTimeout(fallbackId);
      logger.info('页面就绪判定：' + reason);
      callback();
    }

    function onLoad() {
      finish('load');
    }
    function onPageShow(e) {
      if (e.persisted) finish('pageshow(bfcache)');
    }

    window.addEventListener('load', onLoad, { once: true });
    window.addEventListener('pageshow', onPageShow);
    fallbackId = setTimeout(() => finish('timeout'), CONFIG.LOAD_TIMEOUT_MS);
  }

  /* ================================== 启动 ================================== */
  function bootstrap() {
    if (!isJobDetailPage()) {
      logger.info('URL 不匹配，脚本退出：', window.location.href);
      return;
    }
    onPageReady(scheduleRedirect);
  }

  bootstrap();
})();