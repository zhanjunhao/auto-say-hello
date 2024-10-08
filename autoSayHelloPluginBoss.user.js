// ==UserScript==
// @name         boss直聘 自动和BOSS打招呼脚本
// @namespace    http://tampermonkey.net/
// @version      2024-05-30
// @description  自动和boss打招呼，减少操作负担。
// @author       wood
// @match        https://www.zhipin.com/web/geek/job*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  window.onload = () => init()
  function init() {
    setTimeout(() => {
      const minSalary = 14; // 最小薪资
      const maxSalary = 20; // 最大薪资

      function getRandomInterval(min1, max2) {
        // 生成一个3000到5000毫秒之间的随机整数
        const min = min1 || 3000;
        const max = max2 || 5000;
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }

      // 点击按钮触发沟通
      function triggerSay(btn) {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            let jobInfo = btn.closest('.job-info');
            if (jobInfo) {
              let salaryElement = jobInfo.querySelector('.salary');
              if (salaryElement) {
                let salaryText = salaryElement.textContent;
                let salaryRange = isSalaryRangeInRange(salaryText, minSalary, maxSalary);
                if (salaryRange) {
                  btn.click();
                  btn.textContent = "继续沟通";
                  setTimeout(() => {
                    let greetBossDialog = document.querySelector(".greet-boss-dialog");
                    if (greetBossDialog) {
                      greetBossDialog.remove();
                    }
                    resolve(true);
                  }, 1000);
                } else {
                  resolve(false);
                }
              }
            }
          }, getRandomInterval());
        });
      }

      // 判定薪资范围区间
      function isSalaryRangeInRange(salaryRangeString, min, max) {
        const regex = /(\d+)-(\d+)(?:K)?/;
        const match = salaryRangeString.match(regex);

        if (match) {
          const startSalary = parseInt(match[1]);
          const endSalary = parseInt(match[2]);

          return (startSalary >= min && startSalary <= max) || (endSalary >= min && endSalary <= max);
        } else if (salaryRangeString === '面议') {
          return false;
        } else {
          return false;
        }
      }

      // 定义黑名单列表
      const blacklist = ['react', 'angular', 'flutter', 'cocos', 'laya', 'lay', '白鹭', 'gis', 'geo', 'webgl', '2d', '3d', '三维', '区块链', '鸿蒙', 'harmonyos', '兼职', '游戏', 'MES', '日结', '大数据',
        '全栈', '软件', '英语', '口语', '外包', '劳务', '派遣', '驻场', '后端', '后台', 'UI', '设计', '初级', '实习生', 'net', 'c++', 'java', 'go', 'goLang', 'python', 'php', '安卓', '苹果', 'android', 'ios'];

      // 判断字符串是否在黑名单列表内的函数
      function isInBlacklist(str) {
        // 将字符串转换为小写
        const lowerCaseStr = str.toLowerCase();
        // 使用some()方法遍历黑名单列表，判断是否存在
        return ["前端", "h5", "web"].some(keyword => lowerCaseStr.includes(keyword.toLowerCase())) ? blacklist.some(item => lowerCaseStr.includes(item.toLowerCase())) : true;
      }

      async function clickButtons() {
        let count = 0;
        let btns = [...document.querySelectorAll(".start-chat-btn")].filter(item => !isInBlacklist(item.closest(".job-card-left").querySelector('.job-name').textContent)); // 根据title过滤掉不相干的岗位
        // console.log(btns);

        for (let btn of btns) {
          if (btn.textContent.trim() === '立即沟通') {
            const result = await triggerSay(btn);
            result ? count++ : null
          }
        }

        if (count === 0) {
          console.log(`本次未匹配到可重新沟通的公司！`);
        } else {
          console.log(`本次执行共沟通${count}家公司`);
        }

        clickNextPage()
      }

      // 点击下一页 触发翻页事件
      function clickNextPage() {
        let nextPageEle = document.querySelector('.options-pages .ui-icon-arrow-right').closest('a')
        if (!nextPageEle.className.includes('disabled')) { // 如果不是最后一页
          setTimeout(() => nextPageEle.closest('a').click(), 2000)
        } else { // 如果是最后一页了 刷新浏览器重定向到第一页
          // 剔除 page 参数
          let parsedUrl = document.createElement('a');
          parsedUrl.href = window.location.href;
          let queryParams = parsedUrl.search.substr(1).split('&');
          let updatedQueryParams = [];
          for (let i = 0; i < queryParams.length; i++) {
            let param = queryParams[i];
            if (param.indexOf('page=') !== 0) {
              updatedQueryParams.push(param);
            }
          }

          // 为 page 参数重新赋值
          updatedQueryParams.push('page=' + 1);
          // 重新构建 URL
          const newUrl = parsedUrl.origin + parsedUrl.pathname + '?' + updatedQueryParams.join('&') + parsedUrl.hash;

          setTimeout(() => {
            window.location.replace(newUrl);
          }, getRandomInterval(5000, 10000))
        }
      }

      clickButtons();

      // 获取当前 URL 中的 page 参数的值
      function getParameterByName(name, url) {
        if (!url) url = window.location.href;
        name = name.replace(/[[\]]/g, '\\$&');
        let regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
          results = regex.exec(url);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, ' '));
      }

      // 保存当前的 page 参数值
      let currentPage = getParameterByName('page');

      // 检测 page 参数的变化
      setInterval(() => {
        let newPage = getParameterByName('page');
        if (newPage !== currentPage) {
          console.log('page 参数发生变化：' + currentPage + ' -> ' + newPage);
          currentPage = newPage;
          setTimeout(() => {
            clickButtons();
          }, 2000)
        }
      }, 1000); // 每秒检测一次
    }, 2000)
  }
})();