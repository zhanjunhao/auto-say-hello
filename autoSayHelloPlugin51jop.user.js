// ==UserScript==
// @name         前程无忧 自动投递简历脚本
// @namespace    http://tampermonkey.net/ 
// @version      2024-08-27
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
      const jName = item.querySelector(".joblist-item-top .jname"); // 获取职位名称元素
      // 如果职位名称包含“前端”，则尝试投递简历
      if (jName.innerText.indexOf("前端") > -1) {
        await delay(getRandomInterval(1000, 2000)); // 随机延迟
        const btnEle = item.querySelector(".btn.apply"); // 获取申请按钮元素
        // 如果按钮不是激活状态，则点击按钮
        if (!btnEle.classList.contains('active')) {
          btnEle.click();
          count++;
          // 等待1.5秒后关闭弹出的对话框
          await delay(1500, () => {
            let closeEle = document.querySelector(".van-icon-cross");
            isElementDisplayed(closeEle) && closeEle.click();
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