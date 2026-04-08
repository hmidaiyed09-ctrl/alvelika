// ─── Configure marked.js for tight output (no excessive spacing) ───
if (typeof marked !== 'undefined') {
  marked.setOptions({
    breaks: false,
    gfm: true
  });
  
  const renderer = {
    code(token) {
      const text = typeof token === 'object' ? token.text : arguments[0];
      const lang = typeof token === 'object' ? token.lang : arguments[1];
      
      return `<div class="code-block-wrapper"><div class="code-block-header"><button class="copy-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy</button></div><pre><code class="language-${lang || ''}">${text}</code></pre></div>`;
    }
  };
  marked.use({ renderer });
}

// ─── Global code copy listener ───
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.copy-btn');
  if (btn) {
    const container = btn.closest('.code-block-wrapper');
    const codeBlock = container.querySelector('code');
    if (codeBlock) {
      navigator.clipboard.writeText(codeBlock.innerText);
      const originalHTML = btn.innerHTML;
      btn.innerHTML = 'Copied!';
      setTimeout(() => btn.innerHTML = originalHTML, 2000);
    }
  }
});

// ─── Configure PDF.js worker ───
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
}

const chatContainer = document.getElementById('chat-container');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const clearButton = document.getElementById('clear-button');
const settingsButton = document.getElementById('settings-button');
const uploadButton = document.getElementById('upload-button');
const imageUpload = document.getElementById('image-upload');
const imagePreviewContainer = document.getElementById('image-preview-container');
const agentModeButton = document.getElementById('agent-mode-button');
const deepThinkButton = document.getElementById('deep-think-button');
const stopAgentButton = document.getElementById('stop-agent-button');

let userHasScrolledUp = false;
let selectedImage = null;
let selectedPdfText = null;
let selectedPdfName = null;
let conversationHistory = [];
let agentModeActive = false;
let deepThinkActive = false;

// ─── Initialize Chat State ───
document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get(['conversationHistory']);
  if (data.conversationHistory && Array.isArray(data.conversationHistory) && data.conversationHistory.length > 0) {
    conversationHistory = data.conversationHistory;
    
    // Hide welcome message
    const welcome = chatContainer.querySelector('.welcome');
    if (welcome) welcome.remove();

    // Re-render history
    for (const msg of conversationHistory) {
      if (msg.role === 'user') {
        // Handle potential array format for user content (text + images)
        let textContent = '';
        let imgContent = null;
        if (Array.isArray(msg.content)) {
          for (const item of msg.content) {
            if (item.type === 'text') textContent = item.text;
            if (item.type === 'image_url') imgContent = item.image_url.url;
          }
        } else {
          textContent = msg.content;
        }
        appendUserMessage(textContent, imgContent, false); // false prevents saving again
      } else if (msg.role === 'assistant') {
        const div = document.createElement('div');
        div.className = 'message ai stream-text';
        chatContainer.appendChild(div);
        if (typeof marked !== 'undefined') {
          div.innerHTML = marked.parse(msg.content);
        } else {
          div.textContent = msg.content;
        }
      }
    }
    scrollToBottom();
  }
});

// Deep Think toggle
deepThinkButton.addEventListener('click', () => {
  deepThinkActive = !deepThinkActive;
  deepThinkButton.classList.toggle('active', deepThinkActive);
  if (deepThinkActive) {
    agentModeActive = false;
    agentModeButton.classList.remove('active');
  }
  chatInput.placeholder = deepThinkActive ? 'Deep thinking enabled 🧠…' : 'Ask anything…';
});

// Agent Mode toggle (UI only — logic not yet implemented)
agentModeButton.addEventListener('click', () => {
  agentModeActive = !agentModeActive;
  agentModeButton.classList.toggle('active', agentModeActive);
  if (agentModeActive) {
    deepThinkActive = false;
    deepThinkButton.classList.remove('active');
  }
  chatInput.placeholder = agentModeActive ? 'Agent mode — give me a task…' : 'Ask anything…';
});

// intelligent scroll flag
chatContainer.addEventListener('scroll', () => {
  const distanceFromBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
  userHasScrolledUp = distanceFromBottom > 60;
});

function scrollToBottom() {
  if (!userHasScrolledUp) {
    chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
  }
}

// Auto-expand textarea
chatInput.addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = this.scrollHeight + 'px';
  updateSendButtonColor();
});

function updateSendButtonColor() {
  const hasText = chatInput.value.trim().length > 0;
  const hasAttachment = !!selectedImage || !!selectedPdfText;
  sendButton.style.color = (hasText || hasAttachment) ? '#e8e8ef' : '#5e5e76';
}

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

// Clipboard Paste Support for Images
chatInput.addEventListener('paste', (e) => {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = (event) => {
        selectedImage = event.target.result;
        showImagePreview(selectedImage);
        updateSendButtonColor();
      };
      reader.readAsDataURL(blob);
    }
  }
});

// Settings button
settingsButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Clear Chat logic
clearButton.addEventListener('click', () => {
  chatContainer.innerHTML = '';
  conversationHistory = [];
  chrome.storage.local.remove(['conversationHistory']);
  const welcome = document.createElement('div');
  welcome.className = 'welcome';
  welcome.innerHTML = `
    <img src="logo.png" alt="" class="welcome-logo">
    <p class="welcome-text">What can I help you with?</p>
  `;
  chatContainer.appendChild(welcome);
});

// Image Upload Logic
uploadButton.addEventListener('click', () => {
  imageUpload.click();
});

imageUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const typedarray = new Uint8Array(event.target.result);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');
          fullText += `[Page ${i}]\n${pageText}\n\n`;
        }
        selectedPdfText = fullText;
        selectedPdfName = file.name;
        
        // Show a generic document icon or the plugin logo for the preview
        showImagePreview('logo.png');
        updateSendButtonColor();
      } catch (err) {
        console.error("PDF Extraction error:", err);
      }
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    selectedImage = event.target.result;
    showImagePreview(selectedImage);
    updateSendButtonColor();
  };
  reader.readAsDataURL(file);
});

function showImagePreview(src) {
  imagePreviewContainer.innerHTML = '';
  imagePreviewContainer.classList.remove('hidden');

  const item = document.createElement('div');
  item.className = 'preview-item';
  item.innerHTML = `
    <img src="${src}" alt="Preview">
    <button class="remove-preview">&times;</button>
  `;

  item.querySelector('.remove-preview').addEventListener('click', () => {
    selectedImage = null;
    selectedPdfText = null;
    selectedPdfName = null;
    imagePreviewContainer.innerHTML = '';
    imagePreviewContainer.classList.add('hidden');
    imageUpload.value = '';
    updateSendButtonColor();
  });

  imagePreviewContainer.appendChild(item);
}

sendButton.addEventListener('click', () => handleSend());

async function handleSend() {
  const text = chatInput.value.trim();
  if (!text && !selectedImage && !selectedPdfText) return;

  // Hide welcome if present
  const welcome = chatContainer.querySelector('.welcome');
  if (welcome) welcome.remove();

  const currentImage = selectedImage;
  const currentPdfText = selectedPdfText;
  const currentPdfName = selectedPdfName;
  
  // Provide UX feedback for PDF upload in chat
  const messageText = currentPdfText && !text ? `Uploaded PDF: ${currentPdfName}` : text;
  appendUserMessage(messageText, currentImage);

  // Clear input and previews
  chatInput.value = '';
  chatInput.style.height = 'auto';
  selectedImage = null;
  selectedPdfText = null;
  selectedPdfName = null;
  imagePreviewContainer.innerHTML = '';
  imagePreviewContainer.classList.add('hidden');
  imageUpload.value = '';
  updateSendButtonColor();

  // If agent mode is active, run agent flow instead
  if (agentModeActive) {
    await handleAgentSend(text);
    return;
  }

  // Extract page context (ON-DEMAND SCRAPER)
  let pageContext = 'No context available.';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Check if it's a restricted Chrome page
    if (tab && tab.id && tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
      pageContext = "The user is on a restricted browser page (like a New Tab). You cannot see this page.";
    }
    // If it's a normal website, aggressively scrape it
    else if (tab && tab.id) {
      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          let text = '';
          const article = document.querySelector('article');
          const main = document.querySelector('main') || document.querySelector('[role="main"]');

          // Smart Cascading Fallback
          if (article) { text = article.innerText; }
          else if (main) { text = main.innerText; }
          else { text = document.body.innerText; }

          return {
            title: document.title,
            text: text.substring(0, 15000)
          };
        }
      });

      if (injectionResults && injectionResults[0] && injectionResults[0].result) {
        const result = injectionResults[0].result;
        pageContext = `[Context of active page: ${result.title}]\n\n${result.text}`;
      }
    }
  } catch (err) {
    console.log('Could not extract context:', err);
    pageContext = "Error extracting context. Assume general conversation.";
  }

  // Capture screenshot of the active tab
  let screenshotUrl = null;
  try {
    const res = await chrome.runtime.sendMessage({ action: 'captureScreen' });
    if (res && res.screenshot) screenshotUrl = res.screenshot;
  } catch (err) {
    console.log('Could not capture screenshot:', err);
  }

  // Show thinking
  const thinkingEl = createThinkingState();
  chatContainer.appendChild(thinkingEl);
  scrollToBottom();

  let finalMessageToAI = messageText;
  if (currentPdfText) {
    finalMessageToAI += `\n\n[Attached Document: ${currentPdfName}]\n<pdf_content>\n${currentPdfText}\n</pdf_content>`;
  }

  await processLLMResponse(finalMessageToAI, pageContext, thinkingEl, currentImage, screenshotUrl, deepThinkActive);
}

function appendUserMessage(text, imageUrl, saveToHistory = true) {
  const div = document.createElement('div');
  div.className = 'message user';

  if (text) {
    const p = document.createElement('p');
    p.textContent = text;
    div.appendChild(p);
  }

  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.className = 'message-image';
    div.appendChild(img);
  }

  chatContainer.appendChild(div);
  scrollToBottom();
}

function createThinkingState(initialText = 'thinking…') {
  const el = document.createElement('div');
  el.className = 'message ai thinking-state';
  el.textContent = initialText;
  return el;
}

function updateThinkingState(el, text) {
  if (!el) return;

  const cleanText = (text || 'thinking…')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  el.textContent = cleanText || 'thinking…';
  scrollToBottom();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fadeOutAndRemove(el, duration = 400) {
  if (!el || !el.isConnected) return;
  el.classList.add('fading-out');
  await delay(duration);
  if (el.isConnected) el.remove();
}

function appendAIMessage(text, { stream = false, className = 'message ai stream-text' } = {}) {
  const div = document.createElement('div');
  div.className = className;
  chatContainer.appendChild(div);
  scrollToBottom();

  if (stream) {
    streamText(text, div);
  } else if (typeof marked !== 'undefined') {
    div.innerHTML = marked.parse(text);
  } else {
    div.textContent = text;
  }

  return div;
}

// ─── Shared: Build API config from saved settings ────────
async function getApiConfig() {
  const config = await new Promise((resolve) => {
    chrome.storage.local.get(['provider', 'apiKey', 'customUrl', 'modelId'], resolve);
  });

  if (!config.provider || (!config.apiKey && config.provider !== 'pollinations')) {
    return null;
  }

  let baseUrl = '';
  let headers = { 'Content-Type': 'application/json' };

  switch (config.provider) {
    case 'pollinations':
      baseUrl = 'https://gen.pollinations.ai/v1/chat/completions';
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
      break;
    case 'cerebras':
      baseUrl = 'https://api.cerebras.ai/v1/chat/completions';
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      break;
    case 'openrouter':
      baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      headers['HTTP-Referer'] = 'https://alvelika.ai';
      headers['X-Title'] = 'Alvelika';
      break;
    case 'mistral':
      baseUrl = 'https://api.mistral.ai/v1/chat/completions';
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      break;
    case 'custom':
      baseUrl = config.customUrl.endsWith('/') ? `${config.customUrl}chat/completions` : `${config.customUrl}/chat/completions`;
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
      break;
  }

  const model = config.modelId || (config.provider === 'pollinations' ? 'openai' : 'gpt-4o-mini');
  return { baseUrl, headers, model };
}

// ─── Shared: Make an LLM API call ────────────────────────
async function callLLM(apiConfig, messages, signal) {
  const response = await fetch(apiConfig.baseUrl, {
    method: 'POST',
    headers: apiConfig.headers,
    body: JSON.stringify({ model: apiConfig.model, messages, stream: false }),
    signal
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API Error: ${response.status}`);
  }
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function processLLMResponse(userMessage, contextData, thinkingEl, imageUrl, screenshotUrl, isDeepThink) {
  const apiConfig = await getApiConfig();
  if (!apiConfig) {
    thinkingEl.textContent = 'Error: Please configure AI provider and API key in settings.';
    return;
  }

  // Prepare user content (text and potentially image)
  const userContent = [];
  if (userMessage) {
    userContent.push({ type: 'text', text: userMessage });
  }
  if (imageUrl) {
    userContent.push({
      type: 'image_url',
      image_url: { url: imageUrl }
    });
  }
  if (screenshotUrl) {
    userContent.push({
      type: 'image_url',
      image_url: { url: screenshotUrl, detail: 'low' }
    });
  }

  const systemPrompt = deepThinkActive
    ? `You are Alvelika, a sophisticated and proactive AI research assistant. 
You are "watching" the screen with the user. You receive both the page's text AND a screenshot of what they currently see.

CURRENT PAGE CONTEXT:
<page_context>
${contextData}
</page_context>

CRITICAL INSTRUCTIONS:
1. You MUST structure your response using these two tags: <thought> and <answer>.
2. Inside <thought>, you MUST answer ALL 12 questions below IN ORDER before writing ANYTHING in <answer>. Use the exact question text as a heading before each answer. Write full, detailed answers. Do NOT skip any.

=== 12 MANDATORY THINKING QUESTIONS ===

1. SUCCESS METRIC: "What does a 10/10 perfect response look like for this specific request?"
(Define the quality standard before you start writing the answer.)

2. HIDDEN CONSTRAINTS: "What are the explicit constraints (rules given) and the implicit constraints (rules that are implied but not stated)?"
(Example: If the user asks for a "professional email," the implicit constraint is that it should be polite and concise, even if the user didn't say "be polite.")

3. AUDIENCE PERSONA: "Who is the target audience for the final output, and what is their level of expertise in this subject?"
(Prevent being too technical for a beginner or too simple for an expert.)

4. AMBIGUITY CHECK: "Which parts of the user's instruction are vague or open to interpretation, and what is the most logical assumption to make for each?"
(Be intentional about assumptions instead of guessing randomly.)

5. PITFALL: "What are the most common mistakes an AI usually makes when answering a prompt like this, and how will I avoid them?"
(Trigger self-correction and prevent generic or robotic AI tropes.)

6. KNOWLEDGE GAP: "Do I have all the necessary information to answer this fully, or am I missing a key piece of context that would make the answer significantly better?"
(Determine if you need to ask a follow-up question instead of hallucinating.)

7. REASONING PATH: "What step-by-step logical framework should I use to solve this problem before I write the final text?"
(Build a logical argument, don't just predict the next word.)

8. TONE AND VOICE: "Beyond just format, what is the specific emotional resonance or voice required (e.g., authoritative, empathetic, skeptical, encouraging)?"
(Make the output feel more human and aligned with the goal.)

9. VALUE-ADD: "Beyond answering the prompt directly, what additional insight, proactive suggestion, or bonus value can I provide that the user hasn't asked for but would find useful?"
(Turn a standard answer into a high-value consultation.)

10. VERIFICATION: "Once I generate the answer, what specific criteria will I use to double-check that I actually followed all the user's instructions?"
(Create a mental checklist for the final review.)

11. USER INTENT: "What is the true intent of the user — what do they actually want to achieve beyond the literal words they used?"
(Understand the deeper motivation behind the request.)

12. PAGE RELEVANCE: "How does the current page context relate to the user's request, and should I use it in my answer?"
(Decide if the page context is relevant or if this is a general question.)

=== END OF QUESTIONS ===

3. Inside <answer>, write your final response informed by all 12 answers above.
4. PROVE YOU ARE WATCHING: If the page is relevant, mention a specific detail from the page (like the title, a name, or a fact).
5. BE KIND & ELEGANT: Use Markdown (###, **, -) to make the answer beautiful. NO EMOJIS ALLOWED.`
    : `You are Alvelika, a dedicated educational AI assistant designed to help students deeply understand documents and web pages.
You are "watching" the screen with the student. You receive both the page's text AND a screenshot of what they currently see.
You are part of a persistent chat session. The user may switch between normal chat and "Agent mode" (where you autonomously perform browser actions). The conversation history below contains ALL messages — including agent task requests, agent results, and agent interruptions. Use this history to understand what has happened so far.

CURRENT PAGE / DOCUMENT CONTEXT:
<page_context>
${contextData}
</page_context>

CRITICAL INSTRUCTIONS:
1. EDUCATIONAL FOCUS: Your primary goal is to help students learn. When analyzing documents or pages, proactively explain difficult terminology, break down complex concepts into student-friendly language, and help them understand the broader context of why this page/document is useful to them.
2. Respond directly to the user. Do NOT use any XML tags like <thought> or <answer>. Just write the response.
3. PROVE YOU ARE WATCHING: When relevant, explicitly mention specific details, terms, or phrases from the page context to anchor your explanations in what the student is actively looking at.
4. BE KIND, ENCOURAGING & ELEGANT: Use a supportive, teacher-like tone. Use Markdown (###, **, -) to make the answer beautiful and easy to read. YOU MUST NOT USE ANY EMOJIS (NO SMILEYS, NO ICONS) UNDER ANY CIRCUMSTANCES.
5. If the conversation history contains agent results, you are aware of what happened and can reference those results naturally.`;

  // Push user message into conversation history
  conversationHistory.push({ role: 'user', content: userContent });
  chrome.storage.local.set({ conversationHistory });

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory
  ];

  currentAbortController = new AbortController();
  showAgentRunningUI();

  try {
    const rawResult = await callLLM(apiConfig, messages, currentAbortController.signal);

    if (isDeepThink) {
      let thinkingText = '';
      let finalAnswer = '';

      const thoughtMatch = rawResult.match(/<thought>([\s\S]*?)<\/thought>/i);
      if (thoughtMatch) {
        thinkingText = thoughtMatch[1].trim();
      }

      const answerMatch = rawResult.match(/<answer>([\s\S]*?)<\/answer>/i);
      if (answerMatch) {
        finalAnswer = answerMatch[1].trim();
      } else {
        finalAnswer = rawResult.replace(/<thought>[\s\S]*?<\/thought>/gi, '').replace(/<\/?answer>/gi, '').trim();
      }

      updateThinkingState(thinkingEl, 'Deep thinking…');
      await delay(600);
      await fadeOutAndRemove(thinkingEl, 400);

      if (thinkingText) {
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'message ai agent-thinking';
        const thinkingHeader = document.createElement('div');
        thinkingHeader.className = 'agent-thinking-header';
        thinkingHeader.innerHTML = `<span class="agent-thinking-icon">🧠</span> <span>Deep Thinking</span> <span class="agent-thinking-toggle">▼</span>`;
        thinkingDiv.appendChild(thinkingHeader);

        const thinkingBody = document.createElement('div');
        thinkingBody.className = 'agent-thinking-body';
        if (typeof marked !== 'undefined') {
          thinkingBody.innerHTML = marked.parse(thinkingText);
        } else {
          thinkingBody.textContent = thinkingText;
        }
        thinkingDiv.appendChild(thinkingBody);

        thinkingHeader.addEventListener('click', () => {
          thinkingBody.classList.toggle('collapsed');
          thinkingHeader.querySelector('.agent-thinking-toggle').textContent =
            thinkingBody.classList.contains('collapsed') ? '▶' : '▼';
        });

        chatContainer.appendChild(thinkingDiv);
        scrollToBottom();
      }

      const answerDiv = document.createElement('div');
      answerDiv.className = 'message ai stream-text';
      chatContainer.appendChild(answerDiv);
      conversationHistory.push({ role: 'assistant', content: rawResult });
      chrome.storage.local.set({ conversationHistory });
      await streamText(finalAnswer, answerDiv, currentAbortController.signal);

    } else {
      await fadeOutAndRemove(thinkingEl, 400);

      const answerDiv = document.createElement('div');
      answerDiv.className = 'message ai stream-text';
      chatContainer.appendChild(answerDiv);
      conversationHistory.push({ role: 'assistant', content: rawResult });
      chrome.storage.local.set({ conversationHistory });
      await streamText(rawResult, answerDiv, currentAbortController.signal);
    }

  } catch (err) {
    if (err.name === 'AbortError' || err.message.includes('aborted')) {
      thinkingEl.textContent = 'Request stopped by user.';
    } else {
      thinkingEl.textContent = `Error: ${err.message}`;
      console.error('LLM Request failed:', err);
    }
  } finally {
    hideAgentRunningUI();
    currentAbortController = null;
  }
}

// ═══════════════════════════════════════════════════════════
//  AGENT MODE — Autonomous JSON Agent
// ═══════════════════════════════════════════════════════════

// ─── Page Scraper — extracts interactive elements + page text ───
async function scrapePageForAgent() {
  const result = { pageTitle: '', pageUrl: '', pageText: '', elements: '', screenshot: null };

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return result;

    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
      result.pageTitle = tab.title || '';
      result.pageUrl = tab.url;
      result.pageText = 'Restricted browser page. No content available.';
      return result;
    }

    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // ── Selector Generator ──
        function getSelector(el, index) {
          const tag = el.tagName.toLowerCase();

          // For links, always use href contains-match (most reliable)
          if (tag === 'a' && el.getAttribute('href')) {
            let rawHref = el.getAttribute('href');
            rawHref = rawHref.split('&pp=')[0].split('&feature=')[0].split('&si=')[0].split('&list=')[0];
            if (rawHref.length > 70) rawHref = rawHref.substring(0, 70);
            const sel = `a[href*="${rawHref}"]`;
            if (document.querySelectorAll(sel).length === 1) return sel;
            // Not unique — use nth-of-type among matching hrefs
            const all = Array.from(document.querySelectorAll(sel));
            const nthIndex = all.indexOf(el) + 1;
            return `a[href*="${rawHref}"]:nth-of-type(${nthIndex})`;
          }

          // Unique ID
          if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
            return `#${CSS.escape(el.id)}`;
          }

          // Non-unique ID — use nth match
          if (el.id) {
            const all = Array.from(document.querySelectorAll(`[id="${el.id}"]`));
            const nthIndex = all.indexOf(el) + 1;
            if (nthIndex === 1) return `#${CSS.escape(el.id)}`;
            return `[id="${el.id}"]:nth-of-type(${nthIndex})`;
          }

          if (el.name) return `${tag}[name="${el.name}"]`;
          if (el.getAttribute('aria-label')) {
            const sel = `${tag}[aria-label="${el.getAttribute('aria-label')}"]`;
            if (document.querySelectorAll(sel).length === 1) return sel;
          }
          if (el.placeholder) return `${tag}[placeholder="${el.placeholder}"]`;
          if (el.title) return `${tag}[title="${el.title}"]`;

          if (el.className && typeof el.className === 'string' && el.className.trim()) {
            const classes = el.className.trim().split(/\s+/).slice(0, 3).map(c => `.${CSS.escape(c)}`).join('');
            const sel = `${tag}${classes}`;
            if (document.querySelectorAll(sel).length === 1) return sel;
          }

          const parent = el.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
            if (siblings.length > 1) {
              const idx = siblings.indexOf(el) + 1;
              const parentSel = parent.id ? `#${CSS.escape(parent.id)}` : parent.tagName.toLowerCase();
              return `${parentSel} > ${tag}:nth-of-type(${idx})`;
            }
          }
          return `${tag}:nth-of-type(${index + 1})`;
        }

        // ── Ad Detection ──
        const adSelectors = [
          'ytd-ad-slot-renderer', 'ytd-promoted-sparkles-web-renderer',
          'ytd-promoted-video-renderer', 'ytd-display-ad-renderer',
          'ytd-banner-promo-renderer', 'ytd-statement-banner-renderer',
          '.ad-container', '.ad-slot', '.ad-banner', '.ad-wrapper',
          '[data-ad]', '[data-ad-slot]', '[data-google-query-id]',
          '[id^="google_ads"]', '[id^="div-gpt-ad"]',
          'ins.adsbygoogle', '[aria-label*="advertisement"]',
          '.sponsored', '[data-sponsored]',
          'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]',
          'iframe[src*="ads"]'
        ];
        const adContainers = new Set();
        adSelectors.forEach(sel => {
          try {
            document.querySelectorAll(sel).forEach(ad => adContainers.add(ad));
          } catch(e) {}
        });
        // Also detect by text content "Sponsored" or "Ad" badges
        document.querySelectorAll('[class*="badge"], [class*="label"], span, div').forEach(el => {
          const txt = (el.textContent || '').trim().toLowerCase();
          if ((txt === 'ad' || txt === 'ads' || txt === 'sponsored' || txt === 'advertisement') && el.offsetHeight > 0) {
            // Mark the closest major parent as ad
            const adParent = el.closest('ytd-video-renderer, ytd-reel-shelf-renderer, [class*="renderer"], article, section, li, div[class]');
            if (adParent) adContainers.add(adParent);
          }
        });

        function isInsideAd(el) {
          for (const ad of adContainers) {
            if (ad.contains(el)) return true;
          }
          return false;
        }

        // ── Collect & categorize ──
        const inputs = [];
        const buttons = [];
        const links = [];

        const interactiveQuery = 'input:not([type="hidden"]), textarea, select, button, [role="button"], a[href], [role="link"], [role="tab"], [contenteditable="true"]';
        const allElements = document.querySelectorAll(interactiveQuery);
        let globalIndex = 0;

        allElements.forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;
          // Skip elements inside ad containers
          if (isInsideAd(el)) return;

          const tag = el.tagName.toLowerCase();
          const text = (el.textContent || '').trim().substring(0, 80);
          const selector = getSelector(el, globalIndex);
          globalIndex++;

          let attrs = [];
          if (el.id) attrs.push(`id="${el.id}"`);
          if (el.name) attrs.push(`name="${el.name}"`);
          if (el.type) attrs.push(`type="${el.type}"`);
          if (el.placeholder) attrs.push(`placeholder="${el.placeholder}"`);
          if (el.value) attrs.push(`value="${el.value.substring(0, 40)}"`);
          if (tag === 'a' && el.getAttribute('href')) {
            let rawHref = el.getAttribute('href');
            rawHref = rawHref.split('&pp=')[0].split('&feature=')[0].split('&si=')[0];
            if (rawHref.length > 80) rawHref = rawHref.substring(0, 80);
            attrs.push(`href="${rawHref}"`);
          }
          if (el.getAttribute('aria-label')) attrs.push(`aria-label="${el.getAttribute('aria-label')}"`);
          if (el.title) attrs.push(`title="${el.title}"`);

          const line = `<${tag} ${attrs.join(' ')}> ${text ? `"${text}"` : '(no text)'}\n     ✅ SELECTOR: ${selector}`;

          if (tag === 'input' || tag === 'textarea' || tag === 'select') {
            inputs.push(line);
          } else if (tag === 'button' || el.getAttribute('role') === 'button') {
            if (buttons.length < 25) buttons.push(line);
          } else if (tag === 'a') {
            if (links.length < 40) links.push(line);
          } else {
            if (buttons.length < 25) buttons.push(line);
          }
        });

        // ── Build categorized output ──
        let output = '';
        if (inputs.length > 0) {
          output += '── INPUTS & FIELDS ──\n';
          inputs.forEach((line, i) => { output += `[I${i + 1}] ${line}\n`; });
        }
        if (buttons.length > 0) {
          output += '\n── BUTTONS ──\n';
          buttons.forEach((line, i) => { output += `[B${i + 1}] ${line}\n`; });
        }
        if (links.length > 0) {
          output += '\n── LINKS ──\n';
          links.forEach((line, i) => { output += `[L${i + 1}] ${line}\n`; });
        }

        const mainContent = document.querySelector('main') || document.querySelector('article') || document.body;
        const pageText = (mainContent.innerText || '').substring(0, 5000);

        return {
          title: document.title,
          url: window.location.href,
          pageText,
          elements: output
        };
      }
    });

    if (injectionResults && injectionResults[0] && injectionResults[0].result) {
      const r = injectionResults[0].result;
      result.pageTitle = r.title;
      result.pageUrl = r.url;
      result.pageText = r.pageText;
      result.elements = r.elements;
    }
  } catch (err) {
    console.log('Could not scrape page:', err);
  }

  try {
    const res = await chrome.runtime.sendMessage({ action: 'captureScreen' });
    if (res && res.screenshot) result.screenshot = res.screenshot;
  } catch (err) {
    console.log('Could not capture screenshot:', err);
  }

  return result;
}

// Step 0 — Analyze the user's raw prompt and produce a clear goal
function buildGoalAnalysisPrompt() {
  return `You are Alvelika Agent. The user just gave you a task.
You receive the DOM and screenshot of the current page.
You may also receive the user's PREVIOUS MESSAGES (conversation history) for context.

Your job is to ANALYZE the user's request and produce a clear, precise goal.
Use the conversation history to understand references like "do that again", "now search for the other one", "continue", etc.

YOUR RESPONSE MUST BE PURE JSON:

{
  "thinking": {
    "what_user_said": "What did the user literally ask for?",
    "what_user_wants": "What is the user truly trying to achieve? What information or outcome do they want?",
    "key_details": "What specific details did the user mention that I must follow exactly? (e.g., specific website, specific query, specific action)",
    "history_context": "What relevant context from previous messages helps clarify this request? (write 'N/A' if no history or not relevant)"
  },
  "user_goal": "A clear, precise, step-by-step rewrite of the user's goal. Be specific. Include every constraint the user mentioned. Resolve any references to previous messages."
}

RULES:
1. If the user mentioned a specific website (e.g., Google), that is a hard constraint — do NOT use a different website.
2. Rewrite the goal so it cannot be misunderstood.
3. If the user's request references previous messages (e.g., "do it again", "the same thing"), use the conversation history to resolve what they mean.
4. Respond with PURE JSON only. No wrapping, no code fences, no extra text.`;
}

function buildAgentSystemPrompt(userGoal, previousValidateOption) {
  const historyBlock = previousValidateOption
    ? `\n\nPREVIOUS STEPS LOG:\n${previousValidateOption}`
    : '\n\nThis is the FIRST step. No previous commands have been executed.';

  return `You are Alvelika Agent — an autonomous AI that ACTS on web pages. Your job is to COMPLETE the user's goal efficiently, not to explain or analyze endlessly.

You receive these inputs every step:
- SCREENSHOT: The source of truth. What you SEE is what exists. If the target is visible, act on it.
- INTERACTIVE ELEMENTS: A categorized list of clickable/typeable elements with ready-to-use selectors (marked with ✅ SELECTOR). Use these selectors.
- PAGE TEXT: The visible text content of the page.

USER GOAL: "${userGoal}"
${historyBlock}

═══ DECISION POLICY (follow strictly) ═══

1. IF the target is clearly visible in the screenshot AND a matching selector exists in the elements list → CLICK IT NOW. Do not scroll, do not re-analyze.
2. IF the target is visible but no perfect selector exists → use the CLOSEST matching selector. Prefer: parent container selectors, href-contains selectors, or aria-label selectors.
3. IF there are ads/sponsored items → SKIP them. Click the first REAL result.
4. NEVER scroll more than 2 times for the same sub-goal. After 2 scrolls, you MUST attempt a click with the best available selector.
5. The "type" command auto-focuses the element. Do NOT click an input before typing — just use "type" directly.
6. Act IMMEDIATELY when confidence is high and risk is low. Analysis is support, not the goal.

═══ FIRST QUESTION (answer BEFORE deciding any action) ═══

Before choosing an action, you MUST answer:
  "goal_check": Is the user's goal ALREADY achieved right now based on the current page URL, title, screenshot, and page text?
  - Compare the current state against the goal. If the goal was "click the first video" and you are now ON a video page → the goal IS achieved.
  - If YES → immediately respond with instruct type "done". Do NOT repeat previous actions.
  - If NO → explain briefly what is still missing, then decide the next action.

═══ RESPONSE FORMAT (pure JSON, nothing else) ═══

{
  "thinking": {
    "goal_check": "Is the goal already achieved? YES or NO, and why?",
    "state": "Brief: what page am I on, did the last command work?",
    "target": "Brief: what element do I need to interact with next? (skip if goal achieved)",
    "action_reason": "Brief: why this action, and why not an alternative? (skip if goal achieved)"
  },
  "instruct": {
    "type": "navigate | click | type | scroll | wait | done",
    "selector": "CSS selector from the ✅ SELECTOR list",
    "url": "URL (only for navigate)",
    "value": "text to type (only for type), or up/down (only for scroll)",
    "description": "short description of this action"
  },
  "validateOption": "Full history of all steps including this one. Mark each ✓ or ✗."
}

═══ SELECTOR RULES ═══

- COPY selectors exactly from the ✅ SELECTOR lines in the elements list.
- If the exact element isn't listed, use a RELATIVE selector strategy:
  Example: the first video result on YouTube → use the first thumbnail link or title link from the LINKS section.
- For links, prefer href-contains selectors: a[href*="/watch?v=..."]
- NEVER invent selectors from memory. The elements list is the truth.

═══ COMMANDS ═══

- "navigate": Go to a URL. Requires "url".
- "click": Click an element. Requires "selector".
- "type": Type into input/textarea. Requires "selector" and "value".
- "scroll": Scroll page. Requires "value": "down" or "up".
- "wait": Wait for page update (use sparingly).
- "done": Goal complete. Put final answer in "description".

═══ CRITICAL ═══

- Your primary job is to COMPLETE the goal, not to maximize explanation.
- Keep "thinking" SHORT (1-2 sentences each). Long analysis = wasted time.
- If the target is visible and the action is obvious, just do it.
- Respond with PURE JSON only. No markdown, no code fences, no extra text.`;
}

// ─── Command Executor — takes instruct JSON, executes on page ───
async function executeAgentCommand(instruct) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return { success: false, error: 'No active tab found.' };

  const type = instruct.type;

  // DONE — goal complete, nothing to execute
  if (type === 'done') {
    return { success: true, done: true, description: instruct.description };
  }

  // WAIT — pause for page to update
  if (type === 'wait') {
    await delay(2000);
    return { success: true, description: 'Waited for page to update.' };
  }

  // NAVIGATE — go to a URL (wait 2s, extend to 8s if not loaded)
  if (type === 'navigate') {
    try {
      await chrome.tabs.update(tab.id, { url: instruct.url });
      let loaded = false;
      const loadPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 8000);
        function listener(tabId, changeInfo) {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            loaded = true;
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        }
        chrome.tabs.onUpdated.addListener(listener);
      });
      // Wait 2s first — if already loaded, proceed immediately
      await delay(2000);
      if (!loaded) {
        await loadPromise; // wait up to remaining time (total 8s max)
      }
      return { success: true, description: `Navigated to ${instruct.url}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // CLICK — click an element by CSS selector (with href fallback)
  if (type === 'click') {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (selector) => {
          let el = document.querySelector(selector);

          // Fallback 1: if selector has exact href=, try contains match
          if (!el && selector.includes('href="') && !selector.includes('href*=')) {
            const hrefMatch = selector.match(/href="([^"]+)"/);
            if (hrefMatch) {
              const href = hrefMatch[1].split('&pp=')[0].split('&feature=')[0].split('&si=')[0];
              el = document.querySelector(`a[href*="${href}"]`);
            }
          }

          // Fallback 2: if selector has href*=, try shorter match
          if (!el && selector.includes('href*=')) {
            const hrefMatch = selector.match(/href\*="([^"]+)"/);
            if (hrefMatch) {
              const parts = hrefMatch[1].split('?');
              if (parts.length > 1) {
                const pathAndKey = parts[0] + '?' + parts[1].split('&')[0];
                el = document.querySelector(`a[href*="${pathAndKey}"]`);
              }
            }
          }

          if (!el) return { success: false, error: `Element not found: ${selector}` };
          el.click();
          return { success: true, description: `Clicked: ${selector}` };
        },
        args: [instruct.selector]
      });
      await delay(2000);
      return results[0].result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // TYPE — type text into an input/textarea
  if (type === 'type') {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (selector, value) => {
          const el = document.querySelector(selector);
          if (!el) return { success: false, error: `Element not found: ${selector}` };
          el.focus();
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, description: `Typed "${value}" into ${selector}` };
        },
        args: [instruct.selector, instruct.value]
      });
      await delay(500);
      return results[0].result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // SCROLL — scroll the page up or down
  if (type === 'scroll') {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (direction) => {
          const amount = direction === 'up' ? -500 : 500;
          window.scrollBy({ top: amount, behavior: 'smooth' });
          return { success: true, description: `Scrolled ${direction}` };
        },
        args: [instruct.value]
      });
      await delay(500);
      return results[0].result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return { success: false, error: `Unknown command type: ${type}` };
}

let agentRunning = false;
let currentAbortController = null;
const AGENT_MAX_STEPS = 15;

function showAgentRunningUI() {
  sendButton.classList.add('hidden');
  stopAgentButton.classList.remove('hidden');
}

function hideAgentRunningUI() {
  stopAgentButton.classList.add('hidden');
  sendButton.classList.remove('hidden');
}

let activeAgentThinkingEl = null;

stopAgentButton.addEventListener('click', () => {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  
  agentRunning = false;
  hideAgentRunningUI();
  
  // Remove any active thinking indicator
  if (activeAgentThinkingEl && activeAgentThinkingEl.isConnected) {
    activeAgentThinkingEl.remove();
    activeAgentThinkingEl = null;
  }
  appendAIMessage('Request stopped by user.', { className: 'message ai' });
  // Record the stop event in conversation history so the AI remembers
  conversationHistory.push({ role: 'assistant', content: '[Request stopped by user.]' });
  chrome.storage.local.set({ conversationHistory });
});

async function handleAgentSend(userGoal) {
  const apiConfig = await getApiConfig();
  if (!apiConfig) {
    appendAIMessage('Error: Configure your AI provider in Settings first.', { className: 'message ai' });
    return;
  }

  agentRunning = true;
  currentAbortController = new AbortController();
  showAgentRunningUI();

  // Push user message into shared conversation history so normal chat remembers it
  conversationHistory.push({ role: 'user', content: userGoal });
  chrome.storage.local.set({ conversationHistory });

  // ═══ STEP 0 — Analyze the user's raw prompt ═══
  const goalThinkingEl = createThinkingState('Understanding your goal…');
  activeAgentThinkingEl = goalThinkingEl;
  chatContainer.appendChild(goalThinkingEl);
  scrollToBottom();

  let refinedGoal = userGoal;
  try {
    const goalPage = await scrapePageForAgent();

    // Build full conversation history (user + AI messages) for context
    const historyEntries = conversationHistory.map(msg => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      const text = typeof msg.content === 'string' ? msg.content : (Array.isArray(msg.content) ? msg.content.filter(c => c.type === 'text').map(c => c.text).join(' ') : '');
      return `[${role}]: ${text.substring(0, 500)}`;
    });
    const historyBlock = historyEntries.length > 0
      ? `\n\nConversation history (oldest first):\n${historyEntries.join('\n')}`
      : '';

    const goalUserContent = [
      { type: 'text', text: `User's raw request: "${userGoal}"${historyBlock}\n\nCurrent page title: ${goalPage.pageTitle}\nCurrent page URL: ${goalPage.pageUrl}\n\nPage text:\n${goalPage.pageText}` }
    ];
    if (goalPage.screenshot) {
      goalUserContent.push({ type: 'image_url', image_url: { url: goalPage.screenshot, detail: 'low' } });
    }

    const goalRaw = await callLLM(apiConfig, [
      { role: 'system', content: buildGoalAnalysisPrompt() },
      { role: 'user', content: goalUserContent }
    ]);

    const goalCleaned = goalRaw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    const goalParsed = JSON.parse(goalCleaned);

    if (goalParsed.user_goal) {
      refinedGoal = goalParsed.user_goal;
    }

    // Show Step 0 result
    updateThinkingState(goalThinkingEl, 'Goal understood.');
    await delay(400);
    await fadeOutAndRemove(goalThinkingEl, 300);
    activeAgentThinkingEl = null;

    const goalDiv = document.createElement('div');
    goalDiv.className = 'message ai agent-command';
    goalDiv.innerHTML = `<span class="agent-cmd-icon">🎯</span> <strong>Goal:</strong> ${refinedGoal}`;
    chatContainer.appendChild(goalDiv);
    scrollToBottom();

  } catch (err) {
    await fadeOutAndRemove(goalThinkingEl, 300);
    activeAgentThinkingEl = null;
    console.log('Goal analysis failed, using raw prompt:', err);
  }

  if (!agentRunning) { hideAgentRunningUI(); return; }

  // ═══ AGENT LOOP ═══
  let previousValidateOption = null;
  let stepCount = 0;

  while (agentRunning && stepCount < AGENT_MAX_STEPS) {
    stepCount++;

    // ── Show thinking state ──
    const thinkingEl = createThinkingState(`Step ${stepCount} — Analyzing the page…`);
    activeAgentThinkingEl = thinkingEl;
    chatContainer.appendChild(thinkingEl);
    scrollToBottom();

    // ── 1. Scrape the page ──
    const page = await scrapePageForAgent();

    // ── 2. Build messages ──
    const systemPrompt = buildAgentSystemPrompt(refinedGoal, previousValidateOption);
    const userContent = [
      { type: 'text', text: `Current page title: ${page.pageTitle}\nCurrent page URL: ${page.pageUrl}\n\nINTERACTIVE ELEMENTS:\n${page.elements}\n\nPAGE TEXT:\n${page.pageText}` }
    ];
    if (page.screenshot) {
      userContent.push({ type: 'image_url', image_url: { url: page.screenshot, detail: 'low' } });
    }

    // ── 4. Call LLM ──
    let parsed;
    try {
      const rawResult = await callLLM(apiConfig, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ], currentAbortController.signal);

      // Strip code fences if AI wraps in ```json
      const cleaned = rawResult.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (err) {
      if (err.name === 'AbortError' || err.message.includes('aborted')) break;
      await fadeOutAndRemove(thinkingEl, 400);
      appendAIMessage(`Agent error at step ${stepCount}: ${err.message}`, { className: 'message ai' });
      agentRunning = false;
      break;
    }

    // ── 5. Show thinking (collapsible) ──
    updateThinkingState(thinkingEl, `Step ${stepCount} — Thinking…`);
    await delay(400);
    await fadeOutAndRemove(thinkingEl, 300);
    activeAgentThinkingEl = null;

    const thinking = parsed.thinking;
    if (thinking) {
      const thinkingDiv = document.createElement('div');
      thinkingDiv.className = 'message ai agent-thinking';

      const thinkingHeader = document.createElement('div');
      thinkingHeader.className = 'agent-thinking-header';
      thinkingHeader.innerHTML = `<span class="agent-thinking-icon">🧠</span> <span>Step ${stepCount} — Thinking</span> <span class="agent-thinking-toggle">▶</span>`;
      thinkingDiv.appendChild(thinkingHeader);

      const thinkingBody = document.createElement('div');
      thinkingBody.className = 'agent-thinking-body collapsed';
      const thinkingMd = [
        `**Goal Check:** ${thinking.goal_check || '—'}`,
        `**State:** ${thinking.state || '—'}`,
        `**Target:** ${thinking.target || '—'}`,
        `**Reason:** ${thinking.action_reason || '—'}`
      ].join('\n\n');

      if (typeof marked !== 'undefined') {
        thinkingBody.innerHTML = marked.parse(thinkingMd);
      } else {
        thinkingBody.textContent = thinkingMd;
      }
      thinkingDiv.appendChild(thinkingBody);

      thinkingHeader.addEventListener('click', () => {
        thinkingBody.classList.toggle('collapsed');
        thinkingHeader.querySelector('.agent-thinking-toggle').textContent =
          thinkingBody.classList.contains('collapsed') ? '▶' : '▼';
      });

      chatContainer.appendChild(thinkingDiv);
      scrollToBottom();
    }

    // ── 6. Show the command being executed ──
    const instruct = parsed.instruct;
    if (!instruct || !instruct.type) {
      appendAIMessage('Agent returned invalid command. Stopping.', { className: 'message ai' });
      agentRunning = false;
      break;
    }

    const cmdDiv = document.createElement('div');
    cmdDiv.className = 'message ai agent-command';
    cmdDiv.innerHTML = `<span class="agent-cmd-icon">⚡</span> <strong>Step ${stepCount}:</strong> ${instruct.description || instruct.type}`;
    chatContainer.appendChild(cmdDiv);
    scrollToBottom();

    // ── 7. Update validateOption for next loop ──
    previousValidateOption = parsed.validateOption || previousValidateOption;

    // ── 8. Check if done ──
    if (instruct.type === 'done') {
      const doneText = instruct.description || 'Goal completed.';
      appendAIMessage(doneText, { stream: true });
      // Feed agent result back into shared conversation history so normal chat remembers it
      conversationHistory.push({ role: 'assistant', content: `[Agent completed] Goal: ${refinedGoal}\nResult: ${doneText}` });
      chrome.storage.local.set({ conversationHistory });
      agentRunning = false;
      break;
    }

    // ── 9. Execute the command ──
    const result = await executeAgentCommand(instruct);

    if (!result.success) {
      cmdDiv.innerHTML += ` <span style="color:#ff6b6b;">✗ ${result.error}</span>`;
    } else {
      cmdDiv.innerHTML += ` <span style="color:#4ade80;">✓</span>`;
    }
    scrollToBottom();
  }

  if (stepCount >= AGENT_MAX_STEPS) {
    const maxMsg = `Agent reached the maximum of ${AGENT_MAX_STEPS} steps. Stopping.`;
    appendAIMessage(maxMsg, { className: 'message ai' });
    conversationHistory.push({ role: 'assistant', content: `[Agent stopped - max steps] Goal: ${refinedGoal}\nStopped after ${stepCount} steps.` });
    chrome.storage.local.set({ conversationHistory });
  }

  activeAgentThinkingEl = null;
  agentRunning = false;
  hideAgentRunningUI();
}

function streamText(fullText, container, signal) {
  return new Promise((resolve) => {
    if (!fullText) {
      container.textContent = '';
      resolve();
      return;
    }

    let i = 0;
    let currentText = '';

    const interval = setInterval(() => {
      if (signal && signal.aborted) {
        clearInterval(interval);
        resolve();
        return;
      }

      currentText += fullText.charAt(i);

      if (typeof marked !== 'undefined') {
        container.innerHTML = marked.parse(currentText);
      } else {
        container.textContent = currentText;
      }

      i++;
      scrollToBottom();

      if (i >= fullText.length) {
        clearInterval(interval);
        resolve();
      }
    }, 10);
  });
}
