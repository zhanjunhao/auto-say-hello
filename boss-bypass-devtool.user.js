// ==UserScript==
// @name                BOSS直聘 反反调试 - 阻止跳转空白页
// @namespace           https://github.com/your-namespace/boss-bypass-devtool
// @version             1.0.0
// @description         覆盖 BOSS直聘(www/m)的 disable-devtool 反调试跳转行为，用于授权调试
// @author              your-name
// @match               *://www.zhipin.com/*
// @match               *://m.zhipin.com/*
// @match               *://*.zhipin.com/*
// @run-at              document-start
// @grant               none
// @license             MIT
// ==/UserScript==

(function () {
  'use strict';

  const win = window;
  const noop = function () {};

  // ---------- 1. 干掉 disable-devtool 全局对象 ----------
  try {
    Object.defineProperty(win, 'DisableDevtool', {
      configurable: true,
      get() { return noop; },
      set() {}
    });
  } catch (e) {}

  // ---------- 2. 拦截 window.open / window.close ----------
  // disable-devtool 的经典跳转：window.open("about:blank", "_self")
  try {
    const rawOpen = win.open;
    win.open = function (url, target, features) {
      const u = String(url || '');
      if (u === '' || u === 'about:blank') {
        if (target === '_self') return null; // 吞掉自跳转
      }
      if (u.includes('disable-devtool')) return null;
      return rawOpen ? rawOpen.call(this, url, target, features) : null;
    };
  } catch (e) {}

  try { win.close = noop; } catch (e) {}
  try { if (win.history) win.history.back = noop; } catch (e) {}

  // ---------- 3. 锁死 location 跳转 ----------
  try {
    const proto = win.Location.prototype;
    ['href', 'assign', 'replace'].forEach(k => {
      try {
        Object.defineProperty(proto, k, {
          configurable: false,
          set(v) {
            const s = String(v || '');
            if (s.includes('about:blank') || s === '') return; // 丢弃空白页跳转
          },
          get() { return ''; }
        });
      } catch (e) {}
    });
  } catch (e) {}

  // 兜底：直接覆盖 window.location 的赋值行为
  try {
    let _href = win.location.href;
    Object.defineProperty(win, 'location', {
      configurable: true,
      get() {
        return new Proxy(win.location, {
          set(target, prop, value) {
            if (prop === 'href' && String(value).includes('about:blank')) {
              return true; // 吞掉
            }
            target[prop] = value;
            return true;
          }
        });
      }
    });
  } catch (e) {}

  // ---------- 4. 伪造外宽/外高，绕过尺寸差检测 ----------
  // disable-devtool 的 Size detector 比对 outerWidth/innerWidth
  try {
    Object.defineProperty(win, 'outerWidth', {
      configurable: true,
      get() { return win.innerWidth; }
    });
    Object.defineProperty(win, 'outerHeight', {
      configurable: true,
      get() { return win.innerHeight; }
    });
  } catch (e) {}

  // ---------- 5. Hook Function 构造函数，废掉动态 debugger ----------
  try {
    const _ctor = Function.prototype.constructor;
    Function.prototype.constructor = function (...args) {
      if (args[0] && args[0].includes('debugger')) {
        return function () {};
      }
      return _ctor.apply(this, args);
    };
  } catch (e) {}

  // ---------- 6. 屏蔽 console 时间差检测 ----------
  ['log', 'table', 'clear', 'info', 'warn', 'error', 'debug'].forEach(k => {
    try { win.console[k] = noop; } catch (e) {}
  });

  // ---------- 7. 拦截 setInterval/setTimeout 里的反调试轮询 ----------
  // 不全量干掉定时器，只丢 disable-devtool 的特征回调[2](@ref)
  try {
    const rawSetInterval = win.setInterval;
    win.setInterval = function (handler, timeout, ...args) {
      const text = String(handler);
      const isDevtoolLoop =
        text.includes('isSuspend') ||
        text.includes('ondevtoolclose') ||
        text.includes('clearIntervalWhenDevOpenTrigger') ||
        text.includes('DetectorType') ||
        text.includes('isDevToolOpened') ||
        text.includes('onDevToolOpen') ||
        text.includes('ondevtoolopen') ||
        text.includes('disable-devtool') ||
        (text.includes('.detect') && text.includes('clearLog'));
      if (isDevtoolLoop) return 0; // 静默丢弃
      return rawSetInterval.call(this, handler, timeout, ...args);
    };
  } catch (e) {}

  try {
    const rawSetTimeout = win.setTimeout;
    win.setTimeout = function (handler, timeout, ...args) {
      const text = String(handler);
      if (
        text.includes('disable-devtool') ||
        text.includes('ondevtoolopen') ||
        text.includes('isDevToolOpened')
      ) {
        return 0;
      }
      return rawSetTimeout.call(this, handler, timeout, ...args);
    };
  } catch (e) {}

  // ---------- 8. 屏蔽 DevTools 快捷键 + 右键 ----------
  // 捕获阶段拦截，避免事件传到页面监听器
  win.addEventListener('keydown', function (e) {
    const key = String(e.key || '').toUpperCase();
    const code = e.keyCode || e.which;
    const isDevtoolsKey =
      code === 123 || // F12
      (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(key)) ||
      (e.ctrlKey && key === 'U');
    if (isDevtoolsKey) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);

  // 右键菜单：BOSS 会 disable-menu，这里反向保活
  win.addEventListener('contextmenu', function (e) {
    e.stopImmediatePropagation();
  }, true);

  // ---------- 9. 覆盖 Bm/jf 等关键函数（BOSS 特有的关闭页面函数）----------
  // 参考 BOSS main.js 逆向分析：Bm() 负责关闭网页，jf 为空函数占位[13](@ref)
  try { win.Bm = function () { return false; }; } catch (e) {}
  try { win.jf = function () {}; } catch (e) {}

  // ---------- 10. 干掉 beforeunload / unload 跳转 ----------
  win.addEventListener('beforeunload', function (e) {
    // 不阻止真正的用户关闭，只吞掉脚本触发的离开
    e.stopImmediatePropagation();
  }, true);

})();