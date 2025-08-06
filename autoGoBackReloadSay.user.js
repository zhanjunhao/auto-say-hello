// ==UserScript==
// @name         自动回退到上一个页面重新沟通
// @namespace    http://tampermonkey.net/
// @version      2025.04.23
// @description  自动回退到上一个页面重新沟通
// @author       wood
// @match        https://www.zhipin.com/job_detail/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';
    window.onload = () => setTimeout(navigateBack, 1500);
    // 返回上一个页面
    function navigateBack() {
        try {
            // 检查 history 状态
            if (window.history.length > 1) {
                window.history.back();
            }
        } catch (err) {
            console.error('Navigation failed:', err);
        }
    }
})();