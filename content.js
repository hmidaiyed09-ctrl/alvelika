window.__alvelikaContentScriptReady = true;

const AGENT_OVERLAY_STORAGE_KEY = 'agentOverlayState';

const agentCursorStyle = document.createElement('style');
agentCursorStyle.textContent = `
  html[data-alvelika-agent-locked="true"],
  html[data-alvelika-agent-locked="true"] * {
    cursor: progress !important;
  }
`;
document.documentElement.appendChild(agentCursorStyle);

const agentOverlay = (() => {
  let host = null;
  let overlay = null;
  let titleEl = null;
  let detailEl = null;
  let stepEl = null;
  let active = false;

  function ensureOverlay() {
    if (host && host.isConnected) return;

    host = document.createElement('div');
    host.setAttribute('data-alvelika-agent-overlay-host', '');
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }
        .overlay {
          position: fixed;
          inset: 0;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: opacity 220ms ease, visibility 220ms ease;
          font-family: "Segoe UI", "Trebuchet MS", system-ui, sans-serif;
          color: #fff7ff;
        }
        .overlay.visible {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
        }
        .shield {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 15% 20%, rgba(244, 208, 255, 0.18), transparent 28%),
            radial-gradient(circle at 82% 18%, rgba(201, 125, 255, 0.22), transparent 24%),
            radial-gradient(circle at 70% 82%, rgba(255, 173, 235, 0.16), transparent 30%),
            linear-gradient(135deg, rgba(63, 19, 78, 0.18), rgba(150, 74, 171, 0.16), rgba(85, 37, 98, 0.22));
          backdrop-filter: blur(3px) saturate(1.1);
        }
        .grain {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 28px 28px;
          mask-image: linear-gradient(to bottom, transparent, black 12%, black 88%, transparent);
          opacity: 0.35;
        }
        .frame {
          position: absolute;
          inset: 18px;
          border-radius: 28px;
          border: 1px solid rgba(255, 225, 255, 0.28);
          box-shadow:
            0 0 0 1px rgba(118, 49, 143, 0.12) inset,
            0 0 42px rgba(194, 126, 226, 0.18);
          animation: framePulse 4.4s ease-in-out infinite;
        }
        .blob {
          position: absolute;
          border-radius: 999px;
          filter: blur(10px);
          opacity: 0.9;
          mix-blend-mode: screen;
          animation: drift 8s ease-in-out infinite;
        }
        .blob.a {
          top: 10%;
          left: 6%;
          width: 180px;
          height: 180px;
          background: radial-gradient(circle, rgba(255, 214, 249, 0.34), rgba(255, 214, 249, 0));
        }
        .blob.b {
          right: 8%;
          top: 18%;
          width: 220px;
          height: 220px;
          background: radial-gradient(circle, rgba(206, 145, 255, 0.36), rgba(206, 145, 255, 0));
          animation-delay: -2.5s;
        }
        .blob.c {
          right: 18%;
          bottom: 9%;
          width: 260px;
          height: 260px;
          background: radial-gradient(circle, rgba(255, 179, 226, 0.24), rgba(255, 179, 226, 0));
          animation-delay: -4.3s;
        }
        .scan {
          position: absolute;
          inset: -20% 0;
          background: linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.08), transparent);
          transform: translateY(-100%);
          animation: scanSweep 3.6s linear infinite;
          opacity: 0.6;
        }
        .card {
          position: absolute;
          right: 26px;
          bottom: 26px;
          width: min(360px, calc(100vw - 32px));
          padding: 18px 18px 16px;
          border-radius: 24px;
          background: linear-gradient(180deg, rgba(64, 24, 78, 0.84), rgba(86, 29, 92, 0.74));
          border: 1px solid rgba(255, 228, 255, 0.2);
          box-shadow:
            0 18px 48px rgba(34, 10, 43, 0.34),
            0 0 0 1px rgba(248, 220, 255, 0.07) inset;
          backdrop-filter: blur(12px);
        }
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 12px;
          border-radius: 999px;
          background: rgba(255, 234, 255, 0.1);
          border: 1px solid rgba(255, 222, 255, 0.16);
          color: #ffeaff;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .badge-dot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: #ffb6f2;
          box-shadow: 0 0 0 0 rgba(255, 182, 242, 0.55);
          animation: badgePulse 1.5s ease-out infinite;
        }
        .title {
          margin-top: 14px;
          font-size: 28px;
          line-height: 1.05;
          font-weight: 700;
          letter-spacing: -0.03em;
          color: #fff7ff;
        }
        .detail {
          margin-top: 10px;
          color: rgba(255, 239, 255, 0.82);
          font-size: 14px;
          line-height: 1.55;
        }
        .step {
          margin-top: 12px;
          color: #f6d5ff;
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .stop-btn {
          margin-top: 16px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border-radius: 999px;
          border: 1px solid rgba(248, 113, 113, 0.4);
          background: rgba(248, 113, 113, 0.12);
          color: #fca5a5;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.03em;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .stop-btn:hover {
          background: rgba(248, 113, 113, 0.25);
          border-color: rgba(248, 113, 113, 0.6);
          color: #fff;
          box-shadow: 0 0 18px rgba(248, 113, 113, 0.2);
        }
        .stop-btn svg {
          flex-shrink: 0;
        }
        .stop-kbd {
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: rgba(255, 239, 255, 0.6);
          font-family: monospace;
        }
        .orbit {
          position: relative;
          margin-top: 18px;
          height: 70px;
          overflow: hidden;
        }
        .ring {
          position: absolute;
          inset: 50% auto auto 50%;
          border-radius: 999px;
          border: 1px solid rgba(255, 226, 255, 0.18);
          transform: translate(-50%, -50%);
        }
        .ring.one {
          width: 70px;
          height: 70px;
          animation: orbitSpin 4.3s linear infinite;
        }
        .ring.two {
          width: 46px;
          height: 46px;
          border-color: rgba(245, 193, 255, 0.28);
          animation: orbitSpinReverse 3.2s linear infinite;
        }
        .ring::before {
          content: "";
          position: absolute;
          top: -3px;
          left: 50%;
          width: 8px;
          height: 8px;
          margin-left: -4px;
          border-radius: 999px;
          background: #ffd5fb;
          box-shadow: 0 0 14px rgba(255, 213, 251, 0.9);
        }
        .core {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, #fff5ff, #df9fff);
          box-shadow:
            0 0 24px rgba(241, 172, 255, 0.75),
            0 0 44px rgba(241, 172, 255, 0.28);
        }
        @keyframes drift {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(14px, -18px, 0) scale(1.08); }
        }
        @keyframes scanSweep {
          0% { transform: translateY(-105%); }
          100% { transform: translateY(105%); }
        }
        @keyframes framePulse {
          0%, 100% { box-shadow: 0 0 0 1px rgba(118, 49, 143, 0.12) inset, 0 0 42px rgba(194, 126, 226, 0.18); }
          50% { box-shadow: 0 0 0 1px rgba(118, 49, 143, 0.18) inset, 0 0 62px rgba(233, 175, 255, 0.2); }
        }
        @keyframes badgePulse {
          0% { box-shadow: 0 0 0 0 rgba(255, 182, 242, 0.5); }
          70% { box-shadow: 0 0 0 12px rgba(255, 182, 242, 0); }
          100% { box-shadow: 0 0 0 0 rgba(255, 182, 242, 0); }
        }
        @keyframes orbitSpin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes orbitSpinReverse {
          from { transform: translate(-50%, -50%) rotate(360deg); }
          to { transform: translate(-50%, -50%) rotate(0deg); }
        }
        @media (max-width: 680px) {
          .frame {
            inset: 12px;
            border-radius: 22px;
          }
          .card {
            right: 16px;
            left: 16px;
            bottom: 16px;
            width: auto;
            padding: 16px;
          }
          .title {
            font-size: 23px;
          }
          .blob.a,
          .blob.b,
          .blob.c {
            filter: blur(18px);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .frame,
          .blob,
          .scan,
          .badge-dot,
          .ring.one,
          .ring.two {
            animation: none !important;
          }
        }
      </style>
      <div class="overlay" tabindex="0" aria-hidden="true">
        <div class="shield"></div>
        <div class="grain"></div>
        <div class="blob a"></div>
        <div class="blob b"></div>
        <div class="blob c"></div>
        <div class="frame"></div>
        <div class="scan"></div>
        <div class="card">
          <div class="badge">
            <span class="badge-dot"></span>
            <span>Alvelika Agent</span>
          </div>
          <div class="title">Working on this page</div>
          <div class="detail">Please wait while the agent navigates. Clicks are temporarily locked.</div>
          <div class="step">Agent mode active</div>
          <button class="stop-btn" id="alvelika-stop-agent">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            Stop Agent <span class="stop-kbd">Ctrl+C</span>
          </button>
          <div class="orbit" aria-hidden="true">
            <div class="ring one"></div>
            <div class="ring two"></div>
            <div class="core"></div>
          </div>
        </div>
      </div>
    `;

    overlay = shadow.querySelector('.overlay');
    titleEl = shadow.querySelector('.title');
    detailEl = shadow.querySelector('.detail');
    stepEl = shadow.querySelector('.step');

    const swallowEvent = (event) => {
      // Allow clicks on the stop button
      if (event.target.closest && event.target.closest('.stop-btn')) return;
      event.preventDefault();
      event.stopPropagation();
    };

    ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'touchmove', 'wheel'].forEach((eventName) => {
      overlay.addEventListener(eventName, swallowEvent, { passive: false });
    });
    overlay.addEventListener('keydown', swallowEvent, true);

    // Stop Agent button click handler
    const stopBtn = shadow.querySelector('.stop-btn');
    if (stopBtn) {
      stopBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ action: 'forceStopAgent' });
      });
    }

    document.documentElement.appendChild(host);
  }

  function show(state = {}) {
    ensureOverlay();

    active = true;
    titleEl.textContent = state.title || 'Working on this page';
    detailEl.textContent = state.detail || 'Please wait while the agent navigates. Clicks are temporarily locked.';
    stepEl.textContent = state.step || 'Agent mode active';

    document.documentElement.dataset.alvelikaAgentLocked = 'true';
    host.style.pointerEvents = 'auto';
    overlay.classList.add('visible');
    requestAnimationFrame(() => overlay.focus({ preventScroll: true }));
  }

  function hide() {
    if (!host) return;
    active = false;
    delete document.documentElement.dataset.alvelikaAgentLocked;
    host.style.pointerEvents = 'none';
    overlay.classList.remove('visible');
  }

  function sync(state) {
    if (state && state.active) {
      show(state);
    } else {
      hide();
    }
  }

  function isActive() {
    return active;
  }

  return { show, hide, sync, isActive };
})();

const screenExplanationOverlay = (() => {
  let host = null;
  let root = null;
  let highlightEl = null;
  let lineEl = null;
  let cardEl = null;
  let kickerEl = null;
  let titleEl = null;
  let bodyEl = null;
  let targetEl = null;
  let activePayload = null;

  const colors = {
    concept: '#38bdf8',
    action: '#f59e0b',
    result: '#22c55e',
    caution: '#fb7185',
    default: '#9b7dff'
  };

  function ensureOverlay() {
    if (host && host.isConnected) return;

    host = document.createElement('div');
    host.setAttribute('data-alvelika-screen-explanation-host', '');
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483646';
    host.style.pointerEvents = 'none';

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }
        .root {
          position: fixed;
          inset: 0;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: opacity 180ms ease, visibility 180ms ease;
          font-family: Inter, "Segoe UI", system-ui, -apple-system, sans-serif;
          --callout-color: #9b7dff;
          --callout-soft: rgba(155, 125, 255, 0.14);
          --callout-border: rgba(155, 125, 255, 0.42);
        }
        .root.visible {
          opacity: 1;
          visibility: visible;
        }
        .highlight {
          position: fixed;
          z-index: 0;
          border: 2px solid var(--callout-color);
          border-radius: 12px;
          box-shadow:
            0 0 0 9999px rgba(10, 10, 15, 0.18),
            0 0 0 4px var(--callout-soft),
            0 0 26px rgba(155, 125, 255, 0.24);
          pointer-events: none;
          transition: left 160ms ease, top 160ms ease, width 160ms ease, height 160ms ease;
        }
        .highlight.hidden,
        .line.hidden {
          display: none;
        }
        .line {
          position: fixed;
          z-index: 1;
          height: 2px;
          width: 96px;
          transform-origin: left center;
          background: linear-gradient(90deg, var(--callout-color), transparent);
          box-shadow: 0 0 16px var(--callout-soft);
          pointer-events: none;
        }
        .card {
          position: fixed;
          z-index: 2;
          width: min(340px, calc(100vw - 28px));
          padding: 14px 15px 15px;
          border-radius: 16px;
          color: #f5f5fb;
          background:
            radial-gradient(circle at 18% 0%, var(--callout-soft), transparent 46%),
            linear-gradient(180deg, rgba(17, 17, 24, 0.94), rgba(10, 10, 15, 0.90));
          border: 1px solid var(--callout-border);
          box-shadow:
            0 18px 42px rgba(0, 0, 0, 0.36),
            0 0 0 1px rgba(255, 255, 255, 0.04) inset;
          backdrop-filter: blur(12px);
          pointer-events: auto;
        }
        .topline {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: var(--callout-color);
          box-shadow: 0 0 16px var(--callout-color);
          flex-shrink: 0;
        }
        .kicker {
          color: var(--callout-color);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .close {
          margin-left: auto;
          width: 26px;
          height: 26px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.04);
          color: rgba(245, 245, 251, 0.72);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: color 160ms ease, background 160ms ease, border-color 160ms ease;
        }
        .close:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.14);
        }
        .title {
          margin-top: 10px;
          font-size: 16px;
          line-height: 1.25;
          font-weight: 750;
          letter-spacing: 0;
          color: #ffffff;
        }
        .body {
          margin-top: 7px;
          color: rgba(232, 232, 239, 0.82);
          font-size: 13px;
          line-height: 1.55;
        }
        @media (max-width: 520px) {
          .card {
            width: calc(100vw - 24px);
          }
          .line {
            display: none;
          }
        }
      </style>
      <div class="root" aria-live="polite">
        <div class="highlight hidden"></div>
        <div class="line hidden"></div>
        <div class="card">
          <div class="topline">
            <span class="dot"></span>
            <span class="kicker">Alvelika explains</span>
            <button class="close" aria-label="Close explanation" title="Close explanation">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"></path>
                <path d="m6 6 12 12"></path>
              </svg>
            </button>
          </div>
          <div class="title"></div>
          <div class="body"></div>
        </div>
      </div>
    `;

    root = shadow.querySelector('.root');
    highlightEl = shadow.querySelector('.highlight');
    lineEl = shadow.querySelector('.line');
    cardEl = shadow.querySelector('.card');
    kickerEl = shadow.querySelector('.kicker');
    titleEl = shadow.querySelector('.title');
    bodyEl = shadow.querySelector('.body');
    shadow.querySelector('.close')?.addEventListener('click', hide);

    document.documentElement.appendChild(host);
  }

  function normalizeText(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function elementLabel(el) {
    const tag = el.tagName.toLowerCase();
    const pieces = [
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.getAttribute('placeholder'),
      el.getAttribute('alt')
    ];

    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      pieces.push(el.value);
      if (el.id) {
        pieces.push(document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent);
      }
    }

    pieces.push(el.innerText || el.textContent);
    return pieces.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().substring(0, 220);
  }

  function findTargetElement(target) {
    const targetText = typeof target === 'string' ? target : target?.text || target?.label || target?.target || '';
    const selector = typeof target === 'object' ? target?.selector : '';

    if (selector) {
      try {
        const selected = document.querySelector(selector);
        if (isVisible(selected)) return selected;
      } catch (err) {
        // Ignore invalid selectors from model output.
      }
    }

    const needle = normalizeText(targetText);
    if (!needle) return null;

    const candidates = Array.from(document.querySelectorAll([
      'button',
      'a[href]',
      'input',
      'textarea',
      'select',
      'summary',
      'label',
      '[role]',
      '[aria-label]',
      '[title]',
      '[placeholder]',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'li'
    ].join(','))).filter(isVisible);

    let best = null;
    let bestScore = 0;
    const needleWords = needle.split(' ').filter(Boolean);

    for (const el of candidates) {
      const label = normalizeText(elementLabel(el));
      if (!label) continue;

      let score = 0;
      if (label === needle) score = 100;
      else if (label.includes(needle)) score = 86;
      else if (needle.includes(label) && label.length > 3) score = 72;
      else if (needleWords.length > 1 && needleWords.every((word) => label.includes(word))) score = 62;
      else if (needleWords.some((word) => word.length > 3 && label.includes(word))) score = 40;

      const roleBoost = el.matches('button, a[href], input, textarea, select, summary, [role="button"], [role="link"]') ? 8 : 0;
      score += roleBoost;

      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }

    return bestScore >= 48 ? best : null;
  }

  function setColor(kind) {
    const key = ['concept', 'action', 'result', 'caution'].includes(kind) ? kind : 'default';
    const color = colors[key];
    root.style.setProperty('--callout-color', color);
    root.style.setProperty('--callout-soft', `${color}24`);
    root.style.setProperty('--callout-border', `${color}66`);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function positionOverlay() {
    if (!root || !activePayload) return;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const gap = 16;
    const pad = 7;
    const cardW = Math.min(340, viewportW - 28);
    const cardH = cardEl.offsetHeight || 150;

    if (!targetEl || !isVisible(targetEl)) {
      highlightEl.classList.add('hidden');
      lineEl.classList.add('hidden');
      cardEl.style.left = `${clamp(viewportW - cardW - 18, 12, viewportW - cardW - 12)}px`;
      cardEl.style.top = `${clamp(viewportH - cardH - 18, 12, viewportH - cardH - 12)}px`;
      return;
    }

    const rect = targetEl.getBoundingClientRect();
    const left = clamp(rect.left - pad, 8, viewportW - 24);
    const top = clamp(rect.top - pad, 8, viewportH - 24);
    const width = Math.min(rect.width + pad * 2, viewportW - left - 8);
    const height = Math.min(rect.height + pad * 2, viewportH - top - 8);

    highlightEl.classList.remove('hidden');
    highlightEl.style.left = `${left}px`;
    highlightEl.style.top = `${top}px`;
    highlightEl.style.width = `${width}px`;
    highlightEl.style.height = `${height}px`;

    const rightX = rect.right + gap;
    const leftX = rect.left - cardW - gap;
    const belowY = rect.bottom + gap;
    const aboveY = rect.top - cardH - gap;

    let cardLeft;
    let cardTop;
    if (rightX + cardW <= viewportW - 12) {
      cardLeft = rightX;
      cardTop = rect.top + rect.height / 2 - cardH / 2;
    } else if (leftX >= 12) {
      cardLeft = leftX;
      cardTop = rect.top + rect.height / 2 - cardH / 2;
    } else if (belowY + cardH <= viewportH - 12) {
      cardLeft = rect.left + rect.width / 2 - cardW / 2;
      cardTop = belowY;
    } else {
      cardLeft = rect.left + rect.width / 2 - cardW / 2;
      cardTop = aboveY;
    }

    cardLeft = clamp(cardLeft, 12, viewportW - cardW - 12);
    cardTop = clamp(cardTop, 12, viewportH - cardH - 12);
    cardEl.style.left = `${cardLeft}px`;
    cardEl.style.top = `${cardTop}px`;

    const targetX = rect.left + rect.width / 2;
    const targetY = rect.top + rect.height / 2;
    const cardX = cardLeft + cardW / 2;
    const cardY = cardTop + cardH / 2;
    const dx = cardX - targetX;
    const dy = cardY - targetY;
    const length = Math.min(140, Math.max(32, Math.sqrt(dx * dx + dy * dy) - 70));
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    lineEl.classList.remove('hidden');
    lineEl.style.left = `${targetX}px`;
    lineEl.style.top = `${targetY}px`;
    lineEl.style.width = `${length}px`;
    lineEl.style.transform = `rotate(${angle}deg)`;
  }

  function show(payload = {}) {
    ensureOverlay();

    activePayload = {
      target: payload.target || '',
      title: String(payload.title || 'Look here').substring(0, 90),
      body: String(payload.body || payload.explanation || 'This part is relevant to the answer.').substring(0, 420),
      kind: String(payload.kind || payload.type || 'default').toLowerCase()
    };
    targetEl = findTargetElement(activePayload.target);

    setColor(activePayload.kind);
    kickerEl.textContent = activePayload.kind === 'default'
      ? 'Alvelika explains'
      : `Alvelika ${activePayload.kind}`;
    titleEl.textContent = activePayload.title;
    bodyEl.textContent = activePayload.body;

    root.classList.add('visible');
    requestAnimationFrame(positionOverlay);
  }

  function hide() {
    activePayload = null;
    targetEl = null;
    if (root) root.classList.remove('visible');
  }

  window.addEventListener('scroll', positionOverlay, true);
  window.addEventListener('resize', positionOverlay);

  return { show, hide };
})();

// Ctrl+C to stop the agent when overlay is active
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'c' && agentOverlay.isActive()) {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({ action: 'forceStopAgent' });
  }
}, true);

chrome.storage.local.get([AGENT_OVERLAY_STORAGE_KEY]).then((data) => {
  if (data && data[AGENT_OVERLAY_STORAGE_KEY]) {
    agentOverlay.sync(data[AGENT_OVERLAY_STORAGE_KEY]);
  }
}).catch(() => {});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[AGENT_OVERLAY_STORAGE_KEY]) {
    agentOverlay.sync(changes[AGENT_OVERLAY_STORAGE_KEY].newValue);
  }
});

// ─── Message Router ──────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageContext') {
    let contextText = '';
    const mainContent = document.querySelector('article') || document.querySelector('main');
    if (mainContent) {
      contextText = mainContent.innerText;
    } else {
      contextText = document.body.innerText;
    }
    contextText = contextText.substring(0, 50000);
    sendResponse({ context: contextText, title: document.title, url: window.location.href });
  }

  if (request.action === 'setAgentOverlay') {
    agentOverlay.sync(request.state);
    sendResponse({ ok: true });
  }

  if (request.action === 'showScreenExplanation') {
    screenExplanationOverlay.show(request.payload || {});
    sendResponse({ ok: true });
  }

  if (request.action === 'hideScreenExplanation') {
    screenExplanationOverlay.hide();
    sendResponse({ ok: true });
  }

  return true;
});

// ─── Inline Translation Feature ──────────────────────────
(function () {
  let bubble = null;
  let tooltip = null;

  // Inject styles once
  const style = document.createElement('style');
  style.textContent = `
    .alvelika-bubble {
      position: absolute;
      z-index: 2147483647;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      cursor: pointer;
      background: #1A1A1A;
      border: 1px solid rgba(138, 43, 226, 0.4);
      box-shadow: 0 2px 12px rgba(138, 43, 226, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      animation: alvelika-pop 0.2s ease;
    }
    .alvelika-bubble:hover {
      transform: scale(1.15);
      box-shadow: 0 4px 20px rgba(138, 43, 226, 0.5);
    }
    .alvelika-bubble img {
      width: 18px;
      height: 18px;
      object-fit: contain;
      pointer-events: none;
    }
    @keyframes alvelika-pop {
      from { transform: scale(0); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .alvelika-tooltip {
      position: absolute;
      z-index: 2147483647;
      max-width: 360px;
      min-width: 180px;
      background: #1A1A1A;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 14px 16px;
      color: #EAEAEA;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
      animation: alvelika-fade 0.25s ease;
      word-wrap: break-word;
    }
    .alvelika-tooltip.loading {
      color: #888;
      font-style: italic;
    }
    .alvelika-tooltip.error {
      color: #ff6b6b;
    }
    @keyframes alvelika-fade {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.documentElement.appendChild(style);

  function removeBubble() {
    if (bubble) { bubble.remove(); bubble = null; }
  }

  function removeTooltip() {
    if (tooltip) { tooltip.remove(); tooltip = null; }
  }

  function cleanup() {
    removeBubble();
    removeTooltip();
  }

  // Get the logo URL from the extension
  const logoUrl = chrome.runtime.getURL('logo.png');

  document.addEventListener('mouseup', (e) => {
    // Ignore clicks on our own elements
    if (e.target.closest('.alvelika-bubble') || e.target.closest('.alvelika-tooltip')) return;

    // Small delay so the selection is finalized
    setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();

      removeBubble();

      if (!selectedText || selectedText.length < 2 || selectedText.length > 5000) return;

      // Get the very last rect of the selection (= end of highlighted text)
      const range = selection.getRangeAt(0);
      const rects = range.getClientRects();
      const lastRect = rects[rects.length - 1];
      if (!lastRect) return;

      bubble = document.createElement('div');
      bubble.className = 'alvelika-bubble';
      bubble.innerHTML = `<img src="${logoUrl}" alt="Translate">`;

      // Position right after the last character of the selection
      bubble.style.left = (window.scrollX + lastRect.right + 6) + 'px';
      bubble.style.top = (window.scrollY + lastRect.top + (lastRect.height / 2) - 14) + 'px';

      bubble.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
      });

      bubble.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const bubbleLeft = parseInt(bubble.style.left);
        const bubbleTop = parseInt(bubble.style.top);
        removeBubble();
        showTranslation(selectedText, bubbleLeft, bubbleTop + 36);
      });

      document.body.appendChild(bubble);
    }, 10);
  });

  // Click anywhere else to dismiss — but not on our elements
  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('.alvelika-bubble') || e.target.closest('.alvelika-tooltip')) return;
    removeTooltip();
    // Don't remove bubble here — mouseup will handle it after selection changes
  });

  async function showTranslation(text, posX, posY) {
    removeTooltip();

    tooltip = document.createElement('div');
    tooltip.className = 'alvelika-tooltip loading';
    tooltip.textContent = 'Translating…';

    // Position below where the bubble was
    tooltip.style.left = posX + 'px';
    tooltip.style.top = posY + 'px';
    document.body.appendChild(tooltip);

    // Get target language from settings
    const config = await chrome.storage.local.get(['translateLang']);
    const targetLang = config.translateLang || 'en';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'translate',
        text: text,
        targetLang: targetLang
      });

      if (!tooltip) return; // user dismissed

      if (response && response.translation) {
        tooltip.classList.remove('loading');
        tooltip.textContent = response.translation;
      } else {
        tooltip.classList.remove('loading');
        tooltip.classList.add('error');
        tooltip.textContent = response?.error || 'Translation failed.';
      }
    } catch (err) {
      if (!tooltip) return;
      tooltip.classList.remove('loading');
      tooltip.classList.add('error');
      tooltip.textContent = 'Could not connect to AI.';
    }
  }
})();
