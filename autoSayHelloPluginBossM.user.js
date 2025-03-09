// ==UserScript==
// @name         boss直聘 移动端触发按钮 自动打招呼脚本 减少颈椎的劳损 适用于前端开发(内卷找工作)
// @namespace    http://tampermonkey.net/
// @version      2024-05-30
// @description  try to take over the world!
// @author       wood
// @match        https://www.zhipin.com/c101280100/?query=*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';
  window.onload = () => {
    // 获取所有按钮
    const buttons = document.querySelectorAll(".job-list .item .btn-chat");

    // 定义一个函数来处理点击事件和随机时间间隔
    function handleClick(index) {
      // 如果索引超出按钮数组的长度，停止递归
      if (index >= buttons.length) return;

      // 生成一个3到5秒之间的随机时间间隔
      const randomDelay = Math.random() * (5000 - 3000) + 3000; // 3000ms到5000ms

      // 使用setTimeout来延迟点击事件
      setTimeout(() => {
        // 触发当前按钮的点击事件
        buttons[index].click();
        console.log(`Button ${index + 1} clicked`);

        // 递归调用，处理下一个按钮
        handleClick(index + 1);
      }, randomDelay);
    }

    // 从第一个按钮开始处理
    handleClick(0);
  }
})();