// ==UserScript==
// @name         前程无忧PC端自动投递简历脚本
// @namespace    http://tampermonkey.net/ 
// @version      2025.12.29
// @description  自动投递简历，减少操作负担。
// @author       wood
// @match        https://we.51job.com/pc/search*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  window.onload = () => init();
  function init() {
    setTimeout(() => {
      autoSend();
    }, 3000);
  }

  // 自动投递简历的异步函数
  async function autoSend() {
    bindEvent();
    let count = 0; // 投递成功的公司数量
    const jobList = document.querySelectorAll(".joblist .joblist-item"); // 获取职位列表
    for (let item of jobList) {
      const title = item.querySelector(".joblist-item-jobname .jname")?.textContent; // 获取职位名称元素
      // 如果是前端职位，则尝试投递简历
      if (validateJobTitle(title)) {
        await delay(getRandomInterval(1000, 2000)); // 随机延迟
        const btnEle = item.querySelector(".btn.apply"); // 获取申请按钮元素
        // 如果按钮不是激活状态，则点击按钮
        if (!btnEle.classList.contains('active')) {
          btnEle.click();
          count++;
          // 等待1.5秒后关闭弹出的对话框
          await delay(1500, () => {
            let popupElement = document.querySelector(".success-popup");
            const closeBtn = popupElement.querySelector(".close-button");
            isElementDisplayed(closeBtn) && closeBtn.click();
          });
        }
      }
    }
    // 根据投递结果输出日志
    if (count === 0) {
      console.log(`本次未匹配到可进行投递的公司！`);
    } else {
      console.log(`本次执行共投递${count}家公司`);
    }
    // 尝试点击下一页按钮
    clickNextPage();
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

    // console.log({
    //   isBlacklistValid,
    //   hasRequiredKeyword,
    //   isPositionValid,
    //   isRoleValid,
    //   isTechValid,
    // });

    return (isBlacklistValid && hasRequiredKeyword && isPositionValid && isRoleValid && isTechValid);
  }

  // 点击下一页按钮的函数
  function clickNextPage() {
    const activePageEle = document.querySelector('.el-pager li[class*="active"]');
    if (activePageEle) {
      if (activePageEle.nextElementSibling) { // 不是最后一页
        activePageEle.classList.remove('active');
        activePageEle.nextElementSibling.click();
      } else { // 当前是最后一页
        window.location.reload()
      }
    }
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

  // 检查元素是否显示的函数
  function isElementDisplayed(element) {
    if (!element) return false;

    // 检查元素是否在文档中
    if (!document.body.contains(element)) {
      return false;
    }

    // 检查元素的display属性是否为none
    if (window.getComputedStyle(element).display === 'none') {
      return false;
    }

    // 检查元素的visibility属性是否为hidden
    if (window.getComputedStyle(element).visibility === 'hidden') {
      return false;
    }

    // 检查元素的opacity是否为0
    if (window.getComputedStyle(element).opacity === '0') {
      return false;
    }

    // 检查元素是否被设置为0的宽度或高度
    const style = window.getComputedStyle(element);
    if (style.width === '0px' || style.height === '0px') {
      return false;
    }
    
    // 如果以上检查都通过了，那么元素应该是显示的
    return true;
  }

  // 为分页按钮添加点击事件，翻页后延迟执行自动投递
  function bindEvent () {
    const pageButton = document.querySelectorAll(".el-pager li");
    for (const btn of pageButton) {
      btn.addEventListener("click", () => {
        if (!btn.classList.contains('active')) {
          setTimeout(autoSend, getRandomInterval(2000, 3000));
        }
      });
    }
  }

  // 生成随机数间隔的函数
  function getRandomInterval(min1, max2) {
    const min = min1 || 3000;
    const max = max2 || 5000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
})();