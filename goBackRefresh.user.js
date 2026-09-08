// ==UserScript==
// @name         返回到上个页面并刷新
// @namespace    http://tampermonkey.net/
// @version      2025.08.07
// @description  返回到上个页面并强制刷新（优先使用referrer，回退history.back）
// @author       wood
// @match        *://*.zhipin.com/job_detail*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
	"use strict";
	// 防止跳转后新页面再次触发导致循环
	if (sessionStorage.getItem("_gotoBackFlag")) {
		sessionStorage.removeItem("_gotoBackFlag");
		return;
	}

	function goBackAndRefresh() {
		let referrer = document.referrer;

		// 优先使用 referrer（来源页），可携带时间戳强制刷新
		if (referrer) {
			let separator = referrer.indexOf("?") === -1 ? "?" : "&";
			let targetUrl = referrer + separator + "_t=" + Date.now();
			sessionStorage.setItem("_gotoBackFlag", "1");
			window.location.href = targetUrl;
			return;
		}

		// 当 referrer 为空时，尝试使用浏览器历史记录返回
		if (window.history.length > 1) {
			sessionStorage.setItem("_gotoBackFlag", "1");
			window.history.back();
		} else {
			console.warn("无法返回：缺少来源页面且历史记录不足");
		}
	}

	// 延迟执行，避免干扰页面初始渲染（保留原延迟时间）
	setTimeout(goBackAndRefresh, 1500);
})();