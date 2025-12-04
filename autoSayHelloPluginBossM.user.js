// ==UserScript==
// @name         Boss直聘移动端自动打招呼脚本
// @namespace    http://tampermonkey.net/
// @version      2025.08.06
// @description  自动和boss打招呼，减少操作负担。
// @author       wood
// @match        https://www.zhipin.com/c101280100*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // 配置参数
  const CONFIG = {
    MIN_SALARY: 16, 
    MAX_SALARY: 20,
    SCROLL_OFFSET: 500,
    LOADING_DELAY: 3000,
    ITEM_HEIGHT: 0,
    LOADMORE_SELECTOR: ".loadmore.disabled"
  };

  // 岗位名称校验
  function validateJobTitle(title) {
    const blacklist = [
      "react","angular","flutter","cocos","laya","lay","白鹭","gis","geo","unity",
      "webgl","2d","3d","三维","射频","pc","游戏","MES","大数据","大模型","ai",
      "区块链","鸿蒙","harmonyos","外派","第三方","全栈","软件","英语","口语","外包",
      "劳务","派遣","驻场","后端","后台","UI","设计","初级","实习","兼职","日结","短期",
      "net","c#","c++","java","go","goLang","python","php","安卓","苹果","android","ios"
    ];

    // 校验黑名单字符
    function validateBlackstr(str) {
      return blacklist.some((word) =>
        str.toLowerCase().includes(word.toLowerCase())
      );
    }

    // 必选关键词：前端、web、h5（不区分大小写）
    const requiredKeywords = /(前端|web|h5)/i;

    // 位置约束：必选词必须出现在字符串的前半部分
    const halfLength = Math.ceil(title.length / 2);
    const positionRegex = new RegExp(
      `^.{0,${halfLength}}?([^]*?(前端|web|h5))`,
      "iu"
    );

    // 矛盾职位校验
    const conflictRoles = /(销售|市场|商务|客服|运营|主播|顾问|代理)/iu;

    // 技术岗位特征校验
    const techKeywords = /(工程师|开发|架构|技术)/iu;

    // 四重验证逻辑
    const isBlacklistValid = !validateBlackstr(title);
    const hasRequiredKeyword = requiredKeywords.test(title);
    const isPositionValid = positionRegex.test(title);
    const isRoleValid = !conflictRoles.test(title);
    const isTechValid = techKeywords.test(title);

    // console.log({
    //   isBlacklistValid,
    //   hasRequiredKeyword,
    //   isPositionValid,
    //   isRoleValid,
    //   isTechValid,
    // });

    return (isBlacklistValid && hasRequiredKeyword && isPositionValid && isRoleValid && isTechValid);
  }

  // 创建统计面板
  const counterDiv = document.createElement("div");
  counterDiv.className = 'counterDiv',
  counterDiv.textContent = '成功发送0次';
  counterDiv.style.cssText = `
    position: fixed; bottom: 20px; right: 20px;
    background: rgba(0,200,100,0.8); color: white;
    padding: 10px 15px; border-radius: 5px; z-index: 9999;
  `;
  document.body.appendChild(counterDiv);

  // 状态管理
  const state = {
    successCount: 0,
    isLoading: false,
    isProcessing: false,
    isStopped: false
  };

  // 定时器池
  const timerPool = {
    clickTimers: [],
    scrollTimer: null,
    observer: null,
    clearAll() {
      this.clickTimers.forEach(clearTimeout);
      clearTimeout(this.scrollTimer);
    }
  };

  // 检查薪资范围
  function checkSalary(salaryText) {
    if (salaryText.includes("面议")) return true;
    const match = salaryText.match(/(\d+)(?:-(\d+))?k/i); // 忽略大小写
    if (!match) return false;
    const min = parseInt(match[1], 10);
    const max = match[2] ? parseInt(match[2], 10) : min;
    return max >= CONFIG.MIN_SALARY && min <= CONFIG.MAX_SALARY; // 判断是否有交集
  }

  // 智能滚动控制器
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
    }, getRandomInterval(2000, 3000));
  }

  // 通用刷新页面方法
  function refreshPage(force = false) {
    // 方法1: 使用 location.reload() - 最可靠的方式
    if (window.location.reload) {
        if (force) {
            // 强制刷新（绕过缓存）
            window.location.reload(true);
        } else {
            // 普通刷新（可能使用缓存）
            window.location.reload();
        }
        return;
    }
    
    // 方法2: 重新设置当前URL
    window.location.href = window.location.href;
  }

  // 核心处理器
  function processPageData() {
    if (state.isStopped || state.isProcessing) return;

    const items = document.querySelectorAll(".job-list .item");
    const validButtons = Array.from(items).reduce((acc, item) => {
      const button = item.querySelector(".btn-chat");
      const title = item.querySelector(".title-text")?.textContent?.trim();
      const salary = item.querySelector(".salary")?.textContent?.trim();
      if (button?.textContent.includes("立即沟通") && title && salary && validateJobTitle(title) && checkSalary(salary)) {
        acc.push(button);
      }
      return acc;
    }, []);

    // console.log(validButtons);
    console.log(`本次匹配到${validButtons.length}家公司！`);

    processValidButtons(validButtons);
  }

  // 点击序列控制器
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
        counterDiv.textContent = `成功发送${++state.successCount}次`;
        clickNext(index + 1);
      }, getRandomInterval(1000, 3000));

      timerPool.clickTimers.push(timerId);
    };
    clickNext(0);
  }

  function getRandomInterval(min1, max2) {
    // 生成一个3000到5000毫秒之间的随机整数
    const min = min1 || 3000;
    const max = max2 || 5000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // 初始化模块
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