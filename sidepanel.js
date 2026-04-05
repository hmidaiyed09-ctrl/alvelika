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
let conversationHistory = [];
let agentModeActive = false;
let deepThinkActive = false;

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
  const hasImage = !!selectedImage;
  sendButton.style.color = (hasText || hasImage) ? '#EAEAEA' : '#A0A0A0';
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
  if (!text && !selectedImage) return;

  // Hide welcome if present
  const welcome = chatContainer.querySelector('.welcome');
  if (welcome) welcome.remove();

  const currentImage = selectedImage;
  appendUserMessage(text, currentImage);

  // Clear input and previews
  chatInput.value = '';
  chatInput.style.height = 'auto';
  selectedImage = null;
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

  await processLLMResponse(text, pageContext, thinkingEl, currentImage, screenshotUrl, deepThinkActive);
}

function appendUserMessage(text, imageUrl) {
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
async function callLLM(apiConfig, messages) {
  const response = await fetch(apiConfig.baseUrl, {
    method: 'POST',
    headers: apiConfig.headers,
    body: JSON.stringify({ model: apiConfig.model, messages, stream: false })
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
5. BE KIND & ELEGANT: Use Markdown (###, **, -) to make the answer beautiful.`
    : `You are Alvelika, a sophisticated and proactive AI research assistant. 
You are "watching" the screen with the user. You receive both the page's text AND a screenshot of what they currently see.

CURRENT PAGE CONTEXT:
<page_context>
${contextData}
</page_context>

CRITICAL INSTRUCTIONS:
1. Respond directly to the user. Do NOT use any XML tags like <thought> or <answer>. Just write the response.
2. PROVE YOU ARE WATCHING: Mention a specific detail from the page (like the title, a name, or a fact) if relevant.
3. BE KIND & ELEGANT: Use Markdown (###, **, -) to make the answer beautiful.`;

  // Push user message into conversation history
  conversationHistory.push({ role: 'user', content: userContent });

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory
  ];

  try {
    const rawResult = await callLLM(apiConfig, messages);

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
      streamText(finalAnswer, answerDiv);

    } else {
      await fadeOutAndRemove(thinkingEl, 400);

      const answerDiv = document.createElement('div');
      answerDiv.className = 'message ai stream-text';
      chatContainer.appendChild(answerDiv);
      conversationHistory.push({ role: 'assistant', content: rawResult });
      streamText(rawResult, answerDiv);
    }

  } catch (err) {
    thinkingEl.textContent = `Error: ${err.message}`;
    console.error('LLM Request failed:', err);
  }
}

// ═══════════════════════════════════════════════════════════
//  AGENT MODE — Autonomous JSON Agent
// ═══════════════════════════════════════════════════════════

function buildAgentSystemPrompt(userGoal, previousValidateOption) {
  const historyBlock = previousValidateOption
    ? `\n\nPREVIOUS STEPS LOG:\n${previousValidateOption}`
    : '\n\nThis is the FIRST step. No previous commands have been executed.';

  return `You are Alvelika Agent, an autonomous AI that can see and interact with web pages.

You receive 3 inputs every step:

1. THE DOM (HTML): You use this to read the page structure, find text content, locate CSS selectors for buttons/inputs/links, and understand what options are available. This is your main tool for choosing selectors in your commands.

2. THE SCREENSHOT: You use this to see what the user actually sees — especially buttons that have NO text and only a logo/icon. The DOM might show an empty <button> but the screenshot shows you it's a search icon or a menu icon. This is your eyes.

3. THE USER GOAL: This is what the user wants to achieve. Every decision you make — every click, every navigation — must move closer to this goal. Never lose track of it.

USER GOAL: "${userGoal}"
${historyBlock}

YOUR RESPONSE MUST BE PURE JSON — nothing else. No markdown, no explanation, no text outside the JSON.

The JSON must contain exactly 3 objects:

{
  "thinking": {
    "q1_did_it_work": "(your answer)",
    "q2_icon_buttons": "(your answer)",
    "q3_page_relevance": "(your answer)",
    "q4_two_options": "(your answer)"
  },
  "instruct": {
    "type": "navigate | click | type | scroll | wait | done",
    "selector": "CSS selector of the target element (if applicable)",
    "url": "URL to navigate to (only for navigate)",
    "value": "text to type (only for type), or 'up'/'down' (only for scroll)",
    "description": "short human-readable description of this action"
  },
  "validateOption": "The full history of all steps so far INCLUDING this new step."
}

THINKING QUESTIONS — answer ALL 4 in order:

q1_did_it_work: "Did the latest command work? Let me see what it told me and how to know that it worked."

q2_icon_buttons: "Is there a button that doesn't have text and only has a logo, and from that logo what could it mean and what does it do on this page?"

q3_page_relevance: "Why is this page correct and how does it help us reach the goal?"

q4_two_options: "What are the first 2 options that come to my mind to reach the goal and why? Which one do I choose?"

INSTRUCT RULES:
- One action per step. Pick the single best next step.
- "navigate": Go to a URL. Requires "url".
- "click": Click an element. Requires "selector".
- "type": Type text into an input/textarea. Requires "selector" and "value".
- "scroll": Scroll the page. Requires "value": "down" or "up".
- "wait": Wait for page to update.
- "done": The goal is complete. Put the final answer in "description".

VALIDATE OPTION RULES:
- Carry forward ALL previous steps and append the current one.
- Each step: explain WHAT you did and WHY.
- Mark completed steps with ✓ or ✗.

CRITICAL RULES:
1. You can ONLY see the current page. You CANNOT browse other sites or search the web.
2. Respond with PURE JSON only. No wrapping, no code fences, no extra text.
3. When the goal is fully achieved, set instruct.type to "done".`;
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

  // NAVIGATE — go to a URL (with 15s timeout)
  if (type === 'navigate') {
    try {
      await chrome.tabs.update(tab.id, { url: instruct.url });
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 15000);
        function listener(tabId, changeInfo) {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        }
        chrome.tabs.onUpdated.addListener(listener);
      });
      await delay(1000);
      return { success: true, description: `Navigated to ${instruct.url}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // CLICK — click an element by CSS selector
  if (type === 'click') {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (selector) => {
          const el = document.querySelector(selector);
          if (!el) return { success: false, error: `Element not found: ${selector}` };
          el.click();
          return { success: true, description: `Clicked: ${selector}` };
        },
        args: [instruct.selector]
      });
      await delay(1000);
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
const AGENT_MAX_STEPS = 15;

function showAgentRunningUI() {
  sendButton.classList.add('hidden');
  stopAgentButton.classList.remove('hidden');
}

function hideAgentRunningUI() {
  stopAgentButton.classList.add('hidden');
  sendButton.classList.remove('hidden');
}

stopAgentButton.addEventListener('click', () => {
  agentRunning = false;
  hideAgentRunningUI();
  appendAIMessage('Agent stopped by user.', { className: 'message ai' });
});

async function handleAgentSend(userGoal) {
  const apiConfig = await getApiConfig();
  if (!apiConfig) {
    appendAIMessage('Error: Configure your AI provider in Settings first.', { className: 'message ai' });
    return;
  }

  agentRunning = true;
  showAgentRunningUI();
  let previousValidateOption = null;
  let stepCount = 0;

  while (agentRunning && stepCount < AGENT_MAX_STEPS) {
    stepCount++;

    // ── Show thinking state ──
    const thinkingEl = createThinkingState(`Step ${stepCount} — Analyzing the page…`);
    chatContainer.appendChild(thinkingEl);
    scrollToBottom();

    // ── 1. Scrape the DOM ──
    let domContent = 'No DOM available.';
    let pageUrl = '';
    let pageTitle = '';
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://') && !tab.url.startsWith('about:')) {
        pageUrl = tab.url;
        pageTitle = tab.title || '';
        const injectionResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({
            title: document.title,
            url: window.location.href,
            dom: document.documentElement.outerHTML.substring(0, 50000)
          })
        });
        if (injectionResults && injectionResults[0] && injectionResults[0].result) {
          const r = injectionResults[0].result;
          pageTitle = r.title;
          pageUrl = r.url;
          domContent = r.dom;
        }
      } else {
        domContent = 'The user is on a restricted browser page (like a New Tab). No DOM available.';
      }
    } catch (err) {
      console.log('Could not scrape DOM:', err);
    }

    // ── 2. Capture screenshot ──
    let screenshotUrl = null;
    try {
      const res = await chrome.runtime.sendMessage({ action: 'captureScreen' });
      if (res && res.screenshot) screenshotUrl = res.screenshot;
    } catch (err) {
      console.log('Could not capture screenshot:', err);
    }

    // ── 3. Build messages ──
    const systemPrompt = buildAgentSystemPrompt(userGoal, previousValidateOption);
    const userContent = [
      { type: 'text', text: `Current page title: ${pageTitle}\nCurrent page URL: ${pageUrl}\n\nFull DOM:\n${domContent}` }
    ];
    if (screenshotUrl) {
      userContent.push({ type: 'image_url', image_url: { url: screenshotUrl, detail: 'low' } });
    }

    // ── 4. Call LLM ──
    let parsed;
    try {
      const rawResult = await callLLM(apiConfig, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ]);

      // Strip code fences if AI wraps in ```json
      const cleaned = rawResult.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (err) {
      await fadeOutAndRemove(thinkingEl, 400);
      appendAIMessage(`Agent error at step ${stepCount}: ${err.message}`, { className: 'message ai' });
      agentRunning = false;
      break;
    }

    // ── 5. Show thinking (collapsible) ──
    updateThinkingState(thinkingEl, `Step ${stepCount} — Thinking…`);
    await delay(400);
    await fadeOutAndRemove(thinkingEl, 300);

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
        `**Q1 — Did it work?**\n${thinking.q1_did_it_work}`,
        `**Q2 — Icon buttons?**\n${thinking.q2_icon_buttons}`,
        `**Q3 — Page relevance?**\n${thinking.q3_page_relevance}`,
        `**Q4 — Two options?**\n${thinking.q4_two_options}`
      ].join('\n\n---\n\n');

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
      appendAIMessage(instruct.description || 'Goal completed.', { stream: true });
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
    appendAIMessage(`Agent reached the maximum of ${AGENT_MAX_STEPS} steps. Stopping.`, { className: 'message ai' });
  }

  agentRunning = false;
  hideAgentRunningUI();
}

function streamText(fullText, container) {
  return new Promise((resolve) => {
    if (!fullText) {
      container.textContent = '';
      resolve();
      return;
    }

    let i = 0;
    let currentText = '';

    const interval = setInterval(() => {
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
