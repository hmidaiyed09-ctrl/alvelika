// ─── Page Context Listener ───────────────────────────────
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

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    cleanup();

    if (!selectedText || selectedText.length < 2 || selectedText.length > 5000) return;

    // Get position from the selection range
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    bubble = document.createElement('div');
    bubble.className = 'alvelika-bubble';
    bubble.innerHTML = `<img src="${logoUrl}" alt="Translate">`;

    // Position the bubble at top-right of selection
    bubble.style.left = (window.scrollX + rect.right + 6) + 'px';
    bubble.style.top = (window.scrollY + rect.top - 8) + 'px';

    bubble.addEventListener('click', (ev) => {
      ev.stopPropagation();
      removeBubble();
      showTranslation(selectedText, rect);
    });

    document.body.appendChild(bubble);
  });

  // Click anywhere else to dismiss
  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('.alvelika-bubble') || e.target.closest('.alvelika-tooltip')) return;
    cleanup();
  });

  async function showTranslation(text, rect) {
    removeTooltip();

    tooltip = document.createElement('div');
    tooltip.className = 'alvelika-tooltip loading';
    tooltip.textContent = 'Translating…';

    // Position below the selection
    tooltip.style.left = (window.scrollX + rect.left) + 'px';
    tooltip.style.top = (window.scrollY + rect.bottom + 8) + 'px';
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
