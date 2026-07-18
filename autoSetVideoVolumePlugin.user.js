// ==UserScript==
// @name         语雀文档视频音量智能控制
// @namespace    https://www.yuque.com/sohucw/gzhcmg
// @version      3.0
// @description  自动设置语雀视频音量为50%，尊重用户手动操作，高性能监听动态加载
// @author       wood
// @match        https://www.yuque.com/sohucw/gzhcmg*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // 配置
  const TARGET_VOLUME = 0.5;          // 目标音量 50%
  const TARGET_HEIGHT = '50%';        // 音量轨道高度
  const DEBOUNCE_DELAY = 350;         // 防抖延迟（毫秒）

  // 状态标记
  const ATTR_PROCESSED = 'data-yb-vol-set';
  const ATTR_USER_MANUAL = 'data-yb-user-adjusted';

  // 缓存已处理的video（避免重复查询DOM）
  const processedVideos = new WeakSet();

  // 防抖计时器
  let debounceTimer = null;

  // ---------- 核心功能 ----------

  /**
   * 设置单个video的音量和对应滑块高度
   */
  function applyVolume(video) {
    if (!video || video.hasAttribute(ATTR_USER_MANUAL)) return;
    if (processedVideos.has(video)) return;

    // 设置音量
    video.volume = TARGET_VOLUME;

    // 设置音量轨道高度
    const controls = video.closest('[data-testid="controls"]');
    if (controls) {
      const track = controls.querySelector('.ant-slider-vertical .ant-slider-track');
      if (track) {
        track.style.height = TARGET_HEIGHT;
        track.style.bottom = 'auto';
      }
    }

    // 标记已处理
    video.setAttribute(ATTR_PROCESSED, 'true');
    processedVideos.add(video);
  }

  /**
   * 扫描并处理所有未被用户标记的video
   */
  function scanAndApply() {
    const videos = document.querySelectorAll(
      `video:not([${ATTR_USER_MANUAL}]):not([${ATTR_PROCESSED}])`
    );
    videos.forEach(applyVolume);
  }

  /**
   * 防抖包装的扫描函数
   */
  function debouncedScan() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scanAndApply, DEBOUNCE_DELAY);
  }

  // ---------- 事件监听 ----------

  // 1. 监听用户手动调整音量（全局捕获）
  document.addEventListener(
    'volumechange',
    (e) => {
      const video = e.target;
      if (video.tagName !== 'VIDEO') return;
      // 只有当音量明显偏离目标值时视为手动操作
      if (Math.abs(video.volume - TARGET_VOLUME) > 0.02) {
        video.removeAttribute(ATTR_PROCESSED);
        video.setAttribute(ATTR_USER_MANUAL, 'true');
        // 同步更新滑块UI
        const controls = video.closest('[data-testid="controls"]');
        if (controls) {
          const track = controls.querySelector('.ant-slider-vertical .ant-slider-track');
          if (track) track.style.height = `${video.volume * 100}%`;
        }
      }
    },
    true
  );

  // 2. 监听滑块拖拽（防止拖拽过程中被脚本重置）
  document.addEventListener(
    'pointerdown',
    (e) => {
      const handle = e.target.closest('.ant-slider-handle');
      if (!handle) return;
      // 找到所属的垂直滑块容器
      const verticalSlider = handle.closest('.ant-slider-vertical');
      if (!verticalSlider) return;
      // 标记该滑块对应的video为用户手动
      const controls = verticalSlider.closest('[data-testid="controls"]');
      if (controls) {
        const video = controls.querySelector('video');
        if (video && !video.hasAttribute(ATTR_USER_MANUAL)) {
          video.removeAttribute(ATTR_PROCESSED);
          video.setAttribute(ATTR_USER_MANUAL, 'true');
        }
      }
    },
    true
  );

  // ---------- MutationObserver 动态监听 ----------

  function initObserver() {
    const observer = new MutationObserver((mutations) => {
      let needsScan = false;
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          // 直接新增video或包含video的容器
          if (
            node.tagName === 'VIDEO' ||
            (node.querySelector && node.querySelector('video'))
          ) {
            needsScan = true;
            break;
          }
        }
        if (needsScan) break;
      }
      if (needsScan) {
        debouncedScan();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
    });
  }

  // ---------- 启动 ----------

  function start() {
    // 首次扫描
    scanAndApply();
    // 启动MutationObserver
    initObserver();
    // 窗口完全加载后再次扫描（确保懒加载内容）
    window.addEventListener('load', () => {
      setTimeout(scanAndApply, 400);
    });
  }

  // 确保DOM已就绪
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();