// ==UserScript==
// @name         Boss直聘PC端自动打招呼脚本
// @namespace    http://tampermonkey.net/
// @version      2025.12.29
// @description  自动和boss打招呼，减少操作负担。
// @author       wood
// @match        https://www.zhipin.com/web/geek/jobs*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // 配置参数
  const CONFIG = {
    MIN_SALARY: 16, 
    MAX_SALARY: 30
  }
  
  // 初始化模块
  window.onload = init;
  async function init () {
    const jobItems = [...document.querySelectorAll(".rec-job-list .card-area .job-card-box")].filter(item => !(item.className.includes('is-seen')));
    for (let jobItem of jobItems) {
      jobItem.click();
      await waitForElement('.job-detail-box', getRandomInterval(1000, 3000));
      const jobName = document.querySelector(".job-detail-box .job-name")?.textContent?.trim();
      const jobSalary = document.querySelector(".job-detail-box .job-salary")?.textContent?.trim();
      const opBtnChat = document.querySelector(".job-detail-box .op-btn-chat");
      if (opBtnChat?.textContent.includes("立即沟通") && validateJobTitle(jobName) && checkSalary(jobSalary)) {
        opBtnChat.click();
        opBtnChat.textContent = '继续沟通';
      }
      await delay(getRandomInterval(3000, 5000));
    }
  }

  async function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        if (Date.now() - start > timeout) return resolve(null);
        requestAnimationFrame(check);
      };
      check();
    });
  }

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

    return (isBlacklistValid && hasRequiredKeyword && isPositionValid && isRoleValid && isTechValid);
  }

  // 检查薪资范围
  function checkSalary(salaryText) {
    return true;
    // if (salaryText.includes("面议")) return true;
    // const match = salaryText.match(/(\d+)(?:-(\d+))?k/i); // 忽略大小写
    // if (!match) return false;
    // const min = parseInt(match[1], 10);
    // const max = match[2] ? parseInt(match[2], 10) : min;
    // return max >= CONFIG.MIN_SALARY && min <= CONFIG.MAX_SALARY; // 判断是否有交集
  }

  // 延迟执行的函数，接受延迟时间和回调函数
  function delay(timer, callBack) {
    return new Promise(resolve => {
      setTimeout(() => {
        typeof callBack === 'function' && callBack();
        resolve();
      }, timer);
    });
  }

  // 生成随机数间隔的函数
  function getRandomInterval(min1, max2) {
    const min = min1 || 3000;
    const max = max2 || 5000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
})();