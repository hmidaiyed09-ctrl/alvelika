const chatContainer = document.getElementById('chat-container');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const clearButton = document.getElementById('clear-button');
const settingsButton = document.getElementById('settings-button');
const uploadButton = document.getElementById('upload-button');
const imageUpload = document.getElementById('image-upload');
const imagePreviewContainer = document.getElementById('image-preview-container');
const agentModeButton = document.getElementById('agent-mode-button');

let userHasScrolledUp = false;
let selectedImage = null;
let conversationHistory = [];
let agentModeActive = false;

// Agent Mode toggle (UI only — functionality coming soon)
agentModeButton.addEventListener('click', () => {
  agentModeActive = !agentModeActive;
  agentModeButton.classList.toggle('active', agentModeActive);
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

  // If agent mode is active, run the agent loop instead
  if (agentModeActive) {
    await startAgentLoop(text);
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
            text: text.substring(0, 15000) // Limit to 15k chars so the API doesn't crash
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

  await processLLMResponse(text, pageContext, thinkingEl, currentImage, screenshotUrl);
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

function createThinkingState() {
  const el = document.createElement('div');
  el.className = 'message ai thinking-state';
  el.textContent = 'thinking…';
  return el;
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

async function processLLMResponse(userMessage, contextData, thinkingEl, imageUrl, screenshotUrl) {
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

  const systemPrompt = `You are Alvelika, a sophisticated and proactive AI research assistant. 
You are "watching" the screen with the user. You receive both the page's text AND a screenshot of what they currently see.

CURRENT PAGE CONTEXT:
<page_context>
${contextData}
</page_context>

CRITICAL INSTRUCTIONS:
1. You MUST structure your response using these two tags: <thought> and <answer>.
2. Inside <thought>, analyze the user's request and the page context. Decide if you need the page to answer.
3. Inside <answer>, write your final response. 
4. PROVE YOU ARE WATCHING: In your answer, mention a specific detail from the page (like the title, a name, or a fact).
5. BE KIND & ELEGANT: Use Markdown (###, **, -) to make the answer beautiful.

Example:
<thought>The user said hi. I see they are on YouTube watching a video about fuel. I will greet them and mention the video.</thought>
<answer>### Hello! 
I see you're watching a fascinating video about **Fuel** by *Al-Dahih*. How can I help you explore this topic today?</answer>`;

  // Push user message into conversation history
  conversationHistory.push({ role: 'user', content: userContent });

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory
  ];

  try {
    const rawResult = await callLLM(apiConfig, messages);

    let thinkingText = "Analyzing context...";
    let finalAnswer = "";

    // 1. Extract Thought using Regex
    const thoughtMatch = rawResult.match(/<thought>([\s\S]*?)<\/thought>/i);
    if (thoughtMatch) {
      thinkingText = thoughtMatch[1].trim();
    }

    // 2. Extract Answer using Regex
    const answerMatch = rawResult.match(/<answer>([\s\S]*?)<\/answer>/i);
    if (answerMatch) {
      finalAnswer = answerMatch[1].trim();
    } else {
      // Fallback: If the AI forgot the tags, just clean the raw result
      finalAnswer = rawResult.replace(/<thought>[\s\S]*?<\/thought>/gi, '').replace(/<\/?answer>/gi, '').trim();
    }

    // Update thinking element
    thinkingEl.textContent = thinkingText;
    
    await new Promise((r) => setTimeout(r, 800));
    thinkingEl.classList.add('fading-out');
    await new Promise((r) => setTimeout(r, 500));
    thinkingEl.remove();

    // Create container for the beautiful formatted answer
    const answerDiv = document.createElement('div');
    answerDiv.className = 'message ai stream-text';
    chatContainer.appendChild(answerDiv);

    // Push AI response into conversation history
    conversationHistory.push({ role: 'assistant', content: rawResult });

    streamText(finalAnswer, answerDiv);

  } catch (err) {
    thinkingEl.textContent = `Error: ${err.message}`;
    console.error('LLM Request failed:', err);
  }
}

// ═══════════════════════════════════════════════════════════
//  AGENT MODE — Autonomous Web Agent Loop
// ═══════════════════════════════════════════════════════════

// Helper: post a styled status line into the chat
function appendAgentStatus(text, type = 'info') {
  const div = document.createElement('div');
  div.className = 'message ai agent-status';
  const colors = { info: '#888', action: '#8A2BE2', success: '#4CAF50', error: '#ff6b6b' };
  div.style.color = colors[type] || colors.info;
  div.style.fontStyle = 'italic';
  div.style.fontSize = '13px';
  div.textContent = text;
  chatContainer.appendChild(div);
  scrollToBottom();
  return div;
}

// Helper: send message to the content script on the active tab
async function sendToContentScript(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('No active tab');
  return await chrome.tabs.sendMessage(tab.id, message);
}

async function startAgentLoop(userGoal) {
  const apiConfig = await getApiConfig();
  if (!apiConfig) {
    appendAgentStatus('Error: Configure your AI provider in Settings first.', 'error');
    return;
  }

  appendAgentStatus(`🎯 Goal: "${userGoal}"`, 'info');
  appendAgentStatus('Agent starting…', 'info');

  let isDone = false;
  let stepCount = 0;
  const MAX_STEPS = 15;
  let consecutiveErrors = 0;

  while (!isDone && stepCount < MAX_STEPS) {
    stepCount++;
    appendAgentStatus(`── Step ${stepCount} / ${MAX_STEPS} ──`, 'info');

    try {
      // ── PHASE A: Observe ──────────────────────────────
      appendAgentStatus('Scanning page elements…', 'info');

      // 1. Draw markers and get the element map
      let elementMap = [];
      try {
        const drawResult = await sendToContentScript({ action: 'drawMarkers' });
        elementMap = drawResult?.elementMap || [];
      } catch (e) {
        appendAgentStatus('Could not scan page — injecting content script…', 'error');
        break;
      }

      appendAgentStatus(`Found ${elementMap.length} interactive elements.`, 'info');

      // 2. Wait for UI to settle
      await new Promise(r => setTimeout(r, 300));

      // 3. Capture screenshot with badges visible
      let screenshot = null;
      try {
        const res = await chrome.runtime.sendMessage({ action: 'captureScreen' });
        if (res?.screenshot) screenshot = res.screenshot;
      } catch (e) {
        console.log('Screenshot failed:', e);
      }

      // 4. Remove markers
      try { await sendToContentScript({ action: 'removeMarkers' }); } catch (e) {}

      // ── PHASE B: Strategist ───────────────────────────
      appendAgentStatus('Strategist is analyzing the page…', 'action');

      const strategistPrompt = `You are the Strategist for an Autonomous Web Agent. The user's goal is: '${userGoal}'.
Look at the provided screenshot of the webpage. Notice the numbered yellow badges on interactive elements.
You must output a highly detailed analysis answering these specific questions:
1. What is the current state of the screen?
2. Has the user's goal been reached? If yes, say "GOAL_REACHED" clearly.
3. To reach the goal, what is the exact next step we should take and why?
4. Are there alternative approaches if this fails?
Output your analysis as a clear text plan.`;

      const strategistContent = [
        { type: 'text', text: `Element Map: ${JSON.stringify(elementMap)}` }
      ];
      if (screenshot) {
        strategistContent.push({
          type: 'image_url',
          image_url: { url: screenshot, detail: 'low' }
        });
      }

      const strategyText = await callLLM(apiConfig, [
        { role: 'system', content: strategistPrompt },
        { role: 'user', content: strategistContent }
      ]);

      // Check if strategist says goal is reached
      if (strategyText.includes('GOAL_REACHED')) {
        isDone = true;
        appendAgentStatus('✅ Strategist confirms: goal has been reached!', 'success');
        const doneDiv = document.createElement('div');
        doneDiv.className = 'message ai stream-text';
        chatContainer.appendChild(doneDiv);
        streamText(strategyText, doneDiv);
        break;
      }

      // ── PHASE C: Actor ────────────────────────────────
      appendAgentStatus('Actor is deciding the next action…', 'action');

      const actorPrompt = `You are the Executor. Your goal is: '${userGoal}'.
Here is the Strategist's analysis of the current screen:
<strategy>
${strategyText}
</strategy>
Here is the map of interactive elements: ${JSON.stringify(elementMap)}.

Based on the strategy, choose the single best action.
You MUST output ONLY a raw JSON object (no markdown, no backticks) with these keys:
- "thinking": your final verification reasoning
- "action": one of CLICK(id), TYPE(id, 'text'), SCROLL_DOWN, or DONE(message)

Examples:
{"thinking":"The search box is #3, I need to type the query.","action":"TYPE(3, 'flights to Paris')"}
{"thinking":"The submit button is #7.","action":"CLICK(7)"}
{"thinking":"The goal is complete.","action":"DONE(Successfully completed the task)"}`;

      const actorRaw = await callLLM(apiConfig, [
        { role: 'system', content: actorPrompt },
        { role: 'user', content: 'Execute the next action based on the strategy.' }
      ]);

      // ── PHASE D: Parse & Execute ──────────────────────
      // Aggressively clean the actor's output
      let cleanJson = actorRaw.replace(/```json/gi, '').replace(/```/g, '').trim();
      const firstBrace = cleanJson.indexOf('{');
      const lastBrace = cleanJson.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
      }

      let parsed;
      try {
        parsed = JSON.parse(cleanJson);
      } catch (e) {
        appendAgentStatus(`Failed to parse actor response. Retrying…`, 'error');
        consecutiveErrors++;
        if (consecutiveErrors >= 3) {
          appendAgentStatus('Too many parsing errors. Agent stopped.', 'error');
          break;
        }
        continue;
      }

      consecutiveErrors = 0; // reset on success
      const actionStr = parsed.action || '';

      // DONE
      const doneMatch = actionStr.match(/^DONE\((.+)\)$/i);
      if (doneMatch) {
        isDone = true;
        appendAgentStatus(`✅ ${doneMatch[1]}`, 'success');
        break;
      }

      // CLICK
      const clickMatch = actionStr.match(/^CLICK\((\d+)\)$/i);
      if (clickMatch) {
        const id = parseInt(clickMatch[1]);
        appendAgentStatus(`🖱️ Clicking element #${id}…`, 'action');
        try {
          await sendToContentScript({ action: 'executeAction', actionType: 'CLICK', id });
        } catch (e) {
          appendAgentStatus(`Click failed: ${e.message}`, 'error');
        }
        await new Promise(r => setTimeout(r, 2500));
        continue;
      }

      // TYPE
      const typeMatch = actionStr.match(/^TYPE\((\d+),\s*'(.+?)'\)$/i) || actionStr.match(/^TYPE\((\d+),\s*"(.+?)"\)$/i);
      if (typeMatch) {
        const id = parseInt(typeMatch[1]);
        const text = typeMatch[2];
        appendAgentStatus(`⌨️ Typing "${text}" into element #${id}…`, 'action');
        try {
          await sendToContentScript({ action: 'executeAction', actionType: 'TYPE', id, textValue: text });
        } catch (e) {
          appendAgentStatus(`Type failed: ${e.message}`, 'error');
        }
        await new Promise(r => setTimeout(r, 2500));
        continue;
      }

      // SCROLL_DOWN
      if (actionStr.includes('SCROLL_DOWN')) {
        appendAgentStatus('📜 Scrolling down…', 'action');
        try {
          await chrome.scripting.executeScript({
            target: { tabId: (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id },
            func: () => window.scrollBy(0, window.innerHeight * 0.7)
          });
        } catch (e) {}
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }

      // Unknown action
      appendAgentStatus(`Unknown action: "${actionStr}". Retrying…`, 'error');
      consecutiveErrors++;
      if (consecutiveErrors >= 3) break;

    } catch (err) {
      appendAgentStatus(`Error: ${err.message}`, 'error');
      consecutiveErrors++;
      if (consecutiveErrors >= 3) {
        appendAgentStatus('Too many consecutive errors. Agent stopped.', 'error');
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (stepCount >= MAX_STEPS && !isDone) {
    appendAgentStatus(`Agent reached the ${MAX_STEPS}-step limit without completing the goal.`, 'error');
  }

  appendAgentStatus('Agent session ended.', 'info');
}

function streamText(fullText, container) {
  let i = 0;
  let currentText = "";
  const interval = setInterval(() => {
    currentText += fullText.charAt(i);
    
    // This turns the markdown into beautiful HTML with colors and bolding
    if (typeof marked !== 'undefined') {
      container.innerHTML = marked.parse(currentText);
    } else {
      container.textContent = currentText;
    }
    
    i++;
    scrollToBottom();
    if (i >= fullText.length) clearInterval(interval);
  }, 10);
}
