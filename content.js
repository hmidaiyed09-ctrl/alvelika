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
    const targetLang = config.translateLang || 'ar';

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
