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
let selectedImages = [];
let selectedDocuments = []; // Array of { name, content }
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
  const hasAttachment = selectedImages.length > 0 || selectedDocuments.length > 0;
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
        selectedImages.push(event.target.result);
        addImagePreview(event.target.result, selectedImages.length - 1);
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
  const files = Array.from(e.target.files);
  if (!files.length) return;

  for (const file of files) {
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
          addDocument(file.name, fullText);
        } catch (err) {
          console.error("PDF Extraction error:", err);
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        selectedImages.push(event.target.result);
        addImagePreview(event.target.result, selectedImages.length - 1);
        updateSendButtonColor();
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        addDocument(file.name, event.target.result);
      };
      reader.readAsText(file);
    }
  }
});

function addImagePreview(src, index) {
  imagePreviewContainer.classList.remove('hidden');

  const item = document.createElement('div');
  item.className = 'preview-item';
  item.dataset.index = index;
  item.innerHTML = `
    <img src="${src}" alt="Preview">
    <button class="remove-preview">&times;</button>
  `;

  item.querySelector('.remove-preview').addEventListener('click', () => {
    selectedImages[index] = null;
    item.remove();
    // Hide container if no previews left
    if (!imagePreviewContainer.querySelector('.preview-item')) {
      imagePreviewContainer.classList.add('hidden');
    }
    imageUpload.value = '';
    updateSendButtonColor();
  });

  imagePreviewContainer.appendChild(item);
}

function addDocument(name, content) {
  const docIndex = selectedDocuments.length;
  selectedDocuments.push({ name, content });
  showDocumentPreview(name, docIndex);
  updateSendButtonColor();
}

function showDocumentPreview(name, index) {
  imagePreviewContainer.classList.remove('hidden');

  const item = document.createElement('div');
  item.className = 'preview-item pdf-preview';
  item.dataset.docIndex = index;
  
  const extMatch = name.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toUpperCase() : 'TXT';
  
  item.innerHTML = `
    <div class="pdf-preview-label" title="${name}">${ext.length > 4 ? ext.substring(0, 4) : ext}</div>
    <button class="remove-preview">&times;</button>
  `;

  item.querySelector('.remove-preview').addEventListener('click', () => {
    selectedDocuments[index] = null;
    item.remove();
    if (!imagePreviewContainer.querySelector('.preview-item')) {
      imagePreviewContainer.classList.add('hidden');
    }
    imageUpload.value = '';
    updateSendButtonColor();
  });

  imagePreviewContainer.appendChild(item);
}

sendButton.addEventListener('click', () => handleSend());

async function handleSend() {
  const text = chatInput.value.trim();
  const currentDocs = selectedDocuments.filter(doc => doc !== null);
  const hasImages = selectedImages.some(img => img !== null);
  if (!text && !hasImages && currentDocs.length === 0) return;

  // Hide welcome if present
  const welcome = chatContainer.querySelector('.welcome');
  if (welcome) welcome.remove();

  const currentImages = selectedImages.filter(img => img !== null);
  
  // Provide UX feedback for document upload in chat
  let uiMessageText = text;
  if (currentDocs.length > 0) {
    const docNames = currentDocs.map(d => d.name).join(', ');
    if (uiMessageText) {
      uiMessageText += `\n\n*(Attached: ${docNames})*`;
    } else {
      uiMessageText = `Uploaded Documents: ${docNames}`;
    }
  }
  appendUserMessage(uiMessageText, currentImages.length > 0 ? currentImages[0] : null);

  // Clear input and previews
  chatInput.value = '';
  chatInput.style.height = 'auto';
  selectedImages = [];
  selectedDocuments = [];
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
          const root = article || main || document.body;

          // Smart Cascading Fallback
          text = root.innerText;

          // Extract sections by headings
          const sections = [];
          const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
          headings.forEach((h, i) => {
            let content = '';
            let sibling = h.nextElementSibling;
            while (sibling && !sibling.matches('h1, h2, h3, h4, h5, h6')) {
              content += sibling.innerText + '\n';
              sibling = sibling.nextElementSibling;
            }
            if (content.trim()) {
              sections.push({
                id: i + 1,
                title: h.innerText.trim().substring(0, 120),
                content: content.trim().substring(0, 800)
              });
            }
          });

          // If no headings, chunk by paragraphs
          if (sections.length === 0) {
            const paragraphs = root.querySelectorAll('p');
            let chunk = '';
            let chunkIndex = 1;
            paragraphs.forEach((p) => {
              chunk += p.innerText + '\n';
              if (chunk.length > 300) {
                sections.push({
                  id: chunkIndex,
                  title: chunk.substring(0, 60).trim() + '…',
                  content: chunk.trim().substring(0, 800)
                });
                chunk = '';
                chunkIndex++;
              }
            });
            if (chunk.trim()) {
              sections.push({
                id: chunkIndex,
                title: chunk.substring(0, 60).trim() + '…',
                content: chunk.trim().substring(0, 800)
              });
            }
          }

          return {
            title: document.title,
            text: text.substring(0, 15000),
            sections: sections.slice(0, 30)
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

  // Capture screenshot of the active tab (skip when PDF is attached — not relevant)
  let screenshotUrl = null;
  if (currentDocs.length === 0) {
    try {
      const res = await chrome.runtime.sendMessage({ action: 'captureScreen' });
      if (res && res.screenshot) {
        screenshotUrl = res.screenshot;
      }
    } catch (err) {
      console.log('Could not capture screenshot:', err);
    }
  }

  // Show thinking
  const thinkingEl = createThinkingState();
  chatContainer.appendChild(thinkingEl);
  scrollToBottom();

  let finalMessageToAI = uiMessageText;
  if (currentDocs.length > 0) {
    for (const doc of currentDocs) {
      finalMessageToAI += `\n\n<document_content name="${doc.name}">\n${doc.content}\n</document_content>`;
    }
  }

  await processLLMResponse(finalMessageToAI, pageContext, thinkingEl, currentImages, screenshotUrl, deepThinkActive);
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

async function processLLMResponse(userMessage, contextData, thinkingEl, images, screenshotUrl, isDeepThink) {
  const apiConfig = await getApiConfig();
  if (!apiConfig) {
    thinkingEl.textContent = 'Error: Please configure AI provider and API key in settings.';
    return;
  }

  // Prepare user content (text and potentially images)
  const userContent = [];
  if (userMessage) {
    userContent.push({ type: 'text', text: userMessage });
  }
  if (Array.isArray(images)) {
    for (const imgUrl of images) {
      if (imgUrl) {
        userContent.push({
          type: 'image_url',
          image_url: { url: imgUrl }
        });
      }
    }
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

      if (thinkingText && thinkingText.length > 0) {
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'message ai agent-thinking';
        const thinkingHeader = document.createElement('div');
        thinkingHeader.className = 'agent-thinking-header';
        thinkingHeader.innerHTML = `<span class="agent-thinking-icon">🧠</span> <span>Deep Thinking</span> <span class="agent-thinking-toggle">▶</span>`;
        thinkingDiv.appendChild(thinkingHeader);

        const thinkingBody = document.createElement('div');
        thinkingBody.className = 'agent-thinking-body collapsed';
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

      // If no answer was parsed, use the full raw result (model didn't use tags)
      if (!finalAnswer) {
        finalAnswer = rawResult;
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

// ─── Page Scraper — builds Accessibility Tree + page text ───
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
          try { document.querySelectorAll(sel).forEach(ad => adContainers.add(ad)); } catch(e) {}
        });
        document.querySelectorAll('[class*="badge"], [class*="label"], span, div').forEach(el => {
          const txt = (el.textContent || '').trim().toLowerCase();
          if ((txt === 'ad' || txt === 'ads' || txt === 'sponsored' || txt === 'advertisement') && el.offsetHeight > 0) {
            const adParent = el.closest('ytd-video-renderer, ytd-reel-shelf-renderer, [class*="renderer"], article, section, li, div[class]');
            if (adParent) adContainers.add(adParent);
          }
        });
        function isInsideAd(el) {
          for (const ad of adContainers) { if (ad.contains(el)) return true; }
          return false;
        }

        // ── Selector Generator ──
        function getSelector(el) {
          const tag = el.tagName.toLowerCase();
          if (tag === 'a' && el.getAttribute('href')) {
            let rawHref = el.getAttribute('href');
            rawHref = rawHref.split('&pp=')[0].split('&feature=')[0].split('&si=')[0].split('&list=')[0];
            if (rawHref.length > 70) rawHref = rawHref.substring(0, 70);
            const sel = `a[href*="${rawHref}"]`;
            if (document.querySelectorAll(sel).length === 1) return sel;
            const all = Array.from(document.querySelectorAll(sel));
            const nthIndex = all.indexOf(el) + 1;
            return `a[href*="${rawHref}"]:nth-of-type(${nthIndex})`;
          }
          if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
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
          return tag;
        }

        // ── Compute accessible role ──
        function getRole(el) {
          try { if (el.computedRole) return el.computedRole; } catch(e) {}
          const explicit = el.getAttribute('role');
          if (explicit) return explicit;
          const tag = el.tagName.toLowerCase();
          const roleMap = {
            a: 'link', button: 'button', input: 'textbox', textarea: 'textbox',
            select: 'combobox', img: 'img', nav: 'navigation', main: 'main',
            header: 'banner', footer: 'contentinfo', aside: 'complementary',
            form: 'form', dialog: 'dialog', table: 'table', ul: 'list',
            ol: 'list', li: 'listitem', h1: 'heading', h2: 'heading',
            h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
            section: 'region', details: 'group', summary: 'button',
          };
          if (tag === 'input') {
            const t = (el.type || 'text').toLowerCase();
            if (t === 'checkbox') return 'checkbox';
            if (t === 'radio') return 'radio';
            if (t === 'submit' || t === 'button' || t === 'reset') return 'button';
            if (t === 'search') return 'searchbox';
            return 'textbox';
          }
          return roleMap[tag] || null;
        }

        // ── Compute accessible name ──
        function getName(el) {
          try { if (el.computedName) return el.computedName; } catch(e) {}
          const ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel) return ariaLabel;
          const labelledBy = el.getAttribute('aria-labelledby');
          if (labelledBy) {
            const parts = labelledBy.split(/\s+/).map(id => {
              const ref = document.getElementById(id);
              return ref ? ref.textContent.trim() : '';
            }).filter(Boolean);
            if (parts.length) return parts.join(' ');
          }
          const tag = el.tagName.toLowerCase();
          if (tag === 'input' || tag === 'textarea' || tag === 'select') {
            if (el.id) {
              const label = document.querySelector(`label[for="${el.id}"]`);
              if (label) return label.textContent.trim();
            }
            if (el.placeholder) return el.placeholder;
            if (el.title) return el.title;
          }
          if (tag === 'img') return el.alt || el.title || '';
          if (tag === 'a' || tag === 'button') {
            return (el.textContent || '').trim().substring(0, 80);
          }
          return '';
        }

        // ── Detect modal/dialog focus traps ──
        let focusContext = '';
        const openModal = document.querySelector(
          'dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"], ' +
          '[class*="modal"][style*="display: block"], [class*="modal"][style*="visibility: visible"], ' +
          '[class*="modal"]:not([style*="display: none"]):not([style*="visibility: hidden"]):not(.hidden)'
        );
        if (openModal) {
          const modalName = openModal.getAttribute('aria-label') ||
            openModal.querySelector('h1, h2, h3, [class*="title"]')?.textContent?.trim() || 'Unnamed';
          focusContext = `[FOCUS TRAP: Modal "${modalName.substring(0, 60)}" is open. Interactive elements below are scoped to this modal.]\n\n`;
        }

        // ── Collect elements recursively (pierces open Shadow DOMs) ──
        const interactiveQuery = 'input:not([type="hidden"]), textarea, select, button, [role="button"], ' +
          'a[href], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], ' +
          '[role="checkbox"], [role="radio"], [contenteditable="true"]';

        function collectInteractive(root, collected) {
          root.querySelectorAll(interactiveQuery).forEach(el => collected.add(el));
          root.querySelectorAll('*').forEach(el => {
            if (el.shadowRoot) collectInteractive(el.shadowRoot, collected);
          });
        }

        // ── Detect fake interactive elements (div soup) ──
        const semanticInteractive = new Set(['a','button','input','textarea','select','summary','details']);
        function collectFakeInteractive(root, collected, seen) {
          root.querySelectorAll('div, span, li, td, label, section').forEach(el => {
            if (seen.has(el)) return;
            const tag = el.tagName.toLowerCase();
            if (semanticInteractive.has(tag)) return;
            if (el.getAttribute('role')) return; // already has ARIA role, caught by main query
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return;
            const hasPointer = getComputedStyle(el).cursor === 'pointer';
            const hasOnclick = el.hasAttribute('onclick');
            const hasTabindex = el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1';
            if (hasPointer || hasOnclick || hasTabindex) {
              // Skip if a semantic interactive child exists (it's just a wrapper)
              if (el.querySelector('a, button, input, textarea, select, [role="button"], [role="link"]')) return;
              collected.add(el);
            }
          });
          root.querySelectorAll('*').forEach(el => {
            if (el.shadowRoot) collectFakeInteractive(el.shadowRoot, collected, seen);
          });
        }

        // ── Build A11y Tree ──
        const searchRoot = openModal || document;
        const interactiveSet = new Set();
        collectInteractive(searchRoot, interactiveSet);

        const fakeSet = new Set();
        collectFakeInteractive(searchRoot, fakeSet, interactiveSet);

        const tree = [];
        let nodeId = 1;

        function processElement(el, isFake) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;
          if (isInsideAd(el)) return;

          let role = getRole(el);
          if (!role && isFake) role = 'clickable';
          if (!role) return;

          const name = getName(el) || (isFake ? (el.textContent || '').trim().substring(0, 80) : '');
          const selector = getSelector(el);
          const tag = el.tagName.toLowerCase();

          const states = [];
          if (el.disabled) states.push('disabled');
          if (el.checked) states.push('checked');
          if (el.getAttribute('aria-expanded') === 'true') states.push('expanded');
          if (el.getAttribute('aria-expanded') === 'false') states.push('collapsed');
          if (el.getAttribute('aria-selected') === 'true') states.push('selected');
          if (el.getAttribute('aria-pressed') === 'true') states.push('pressed');
          if (el.required) states.push('required');
          if (document.activeElement === el) states.push('focused');
          if (isFake) states.push('implicit');

          let value = '';
          if (tag === 'input' || tag === 'textarea' || tag === 'select') {
            value = (el.value || '').substring(0, 40);
          }

          let line = `[${nodeId}] ${role}`;
          if (name) line += ` "${name.substring(0, 80)}"`;
          if (value) line += ` value="${value}"`;
          if (states.length) line += ` (${states.join(', ')})`;
          line += `  ← ${selector}`;

          tree.push(line);
          nodeId++;
        }

        interactiveSet.forEach(el => processElement(el, false));
        fakeSet.forEach(el => processElement(el, true));

        // ── Landmarks for structural context ──
        const landmarks = [];
        const landmarkEls = document.querySelectorAll('main, nav, [role="main"], [role="navigation"], [role="search"], [role="banner"], [role="contentinfo"], [role="complementary"], [role="region"][aria-label]');
        landmarkEls.forEach(el => {
          const role = getRole(el) || el.tagName.toLowerCase();
          const name = el.getAttribute('aria-label') || '';
          landmarks.push(name ? `${role} "${name}"` : role);
        });

        // ── Visual Black Boxes (canvas, svg, video) ──
        const blackBoxes = [];
        document.querySelectorAll('canvas, svg, video, embed, object').forEach((el, i) => {
          const rect = el.getBoundingClientRect();
          if (rect.width < 20 || rect.height < 20) return; // skip tiny/icon-sized
          if (isInsideAd(el)) return;
          const tag = el.tagName.toLowerCase();
          const label = el.getAttribute('aria-label') || el.getAttribute('title') || '';
          blackBoxes.push(
            `[V${i + 1}] ${tag}${label ? ` "${label}"` : ''} bounds=[${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)}x${Math.round(rect.height)}]`
          );
        });

        // ── Walled Gardens (iframes) ──
        const iframes = [];
        document.querySelectorAll('iframe').forEach((el, i) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;
          if (isInsideAd(el)) return;
          const src = (el.src || '').substring(0, 120);
          const label = el.getAttribute('aria-label') || el.getAttribute('title') || '';
          iframes.push(
            `[F${i + 1}] iframe${label ? ` "${label}"` : ''}${src ? ` src="${src}"` : ''} bounds=[${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)}x${Math.round(rect.height)}]`
          );
        });

        const mainContent = document.querySelector('main') || document.querySelector('article') || document.body;
        const pageText = (mainContent.innerText || '').substring(0, 5000);

        let output = '';
        if (focusContext) output += focusContext;
        if (landmarks.length > 0) {
          output += '── PAGE LANDMARKS ──\n' + landmarks.join(', ') + '\n\n';
        }
        output += '── ACCESSIBILITY TREE (interactive elements) ──\n';
        output += tree.length > 0 ? tree.join('\n') : '(no interactive elements found)';
        if (blackBoxes.length > 0) {
          output += '\n\n── VISUAL BLACK BOXES (no DOM inside — use screenshot to interpret) ──\n';
          output += blackBoxes.join('\n');
        }
        if (iframes.length > 0) {
          output += '\n\n── WALLED GARDENS (iframes — content may be inaccessible) ──\n';
          output += iframes.join('\n');
        }

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

// ─── Agent v2 — clear any leftover SoM badges from the page ───
async function clearAgentBadges() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) return;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const badge = document.getElementById('__alvelika_badge_overlay__');
        if (badge) badge.remove();
        if (window.__alvelika && window.__alvelika.idMap) {
          window.__alvelika.idMap.clear();
        }
      }
    });
  } catch (err) {
    console.log('Could not clear badges:', err);
  }
}

// ─── Agent v2 — Set-of-Mark screenshot (numbered badges on visible interactive elements) ───
async function captureAgentScreenshot() {
  const result = { pageTitle: '', pageUrl: '', screenshot: null, idCount: 0 };

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return result;

    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
      result.pageTitle = tab.title || '';
      result.pageUrl = tab.url;
      return result;
    }

    // 1. Hide Alvelika overlay + draw numbered badges on visible interactive elements
    const labelResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Hide Alvelika activity overlay so it doesn't bleed into the screenshot
        const overlayHost = document.querySelector('[data-alvelika-agent-overlay-host]');
        if (overlayHost) overlayHost.style.display = 'none';

        // Cleanup any leftover badge overlay
        const oldBadgeOverlay = document.getElementById('__alvelika_badge_overlay__');
        if (oldBadgeOverlay) oldBadgeOverlay.remove();

        // ── Ad detection (skip ad widgets) ──
        const adSelectors = [
          'ytd-ad-slot-renderer', 'ytd-promoted-sparkles-web-renderer',
          'ytd-promoted-video-renderer', 'ytd-display-ad-renderer',
          '.ad-container', '.ad-slot', '.ad-banner',
          '[data-ad]', '[data-ad-slot]', '[id^="google_ads"]',
          '[id^="div-gpt-ad"]', 'ins.adsbygoogle', '[aria-label*="advertisement"]',
          'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]'
        ];
        const adContainers = new Set();
        adSelectors.forEach(sel => {
          try { document.querySelectorAll(sel).forEach(ad => adContainers.add(ad)); } catch (e) {}
        });
        const isInsideAd = (el) => {
          for (const ad of adContainers) { if (ad.contains(el)) return true; }
          return false;
        };

        // ── Collect interactive elements (semantic + fake/div-soup) ──
        const interactiveQuery =
          'input:not([type="hidden"]), textarea, select, button, [role="button"], ' +
          'a[href], [role="link"], [role="tab"], [role="menuitem"], [role="option"], ' +
          '[role="switch"], [role="checkbox"], [role="radio"], [contenteditable="true"], ' +
          '[role="combobox"], [role="searchbox"], [role="textbox"]';

        const interactiveSet = new Set();
        function collectInteractive(root) {
          root.querySelectorAll(interactiveQuery).forEach(el => interactiveSet.add(el));
          root.querySelectorAll('*').forEach(el => {
            if (el.shadowRoot) collectInteractive(el.shadowRoot);
          });
        }
        collectInteractive(document);

        const semanticInteractive = new Set(['a', 'button', 'input', 'textarea', 'select', 'summary', 'details']);
        document.querySelectorAll('div, span, li, td, label, section').forEach(el => {
          if (interactiveSet.has(el)) return;
          if (semanticInteractive.has(el.tagName.toLowerCase())) return;
          if (el.getAttribute('role')) return;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;
          const cs = getComputedStyle(el);
          const hasPointer = cs.cursor === 'pointer';
          const hasOnclick = el.hasAttribute('onclick');
          const hasTabindex = el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1';
          if (hasPointer || hasOnclick || hasTabindex) {
            if (el.querySelector('a, button, input, textarea, select, [role="button"], [role="link"]')) return;
            interactiveSet.add(el);
          }
        });

        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Filter to viewport-visible & not hidden & not disabled
        let visible = [];
        interactiveSet.forEach(el => {
          if (isInsideAd(el)) return;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          // Skip elements too small to read a badge on
          if (rect.width < 12 || rect.height < 12) return;
          if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) return;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return;
          if (el.disabled) return;
          visible.push({ el, rect });
        });

        // ── DEDUP 1: skip ancestor wrappers when a descendant is also interactive ──
        // (e.g., <a><button>...</button></a> — keep only the leaf button)
        const visibleSet = new Set(visible.map(v => v.el));
        visible = visible.filter(v => {
          for (const other of visibleSet) {
            if (other === v.el) continue;
            if (v.el.contains(other) && other !== v.el) return false; // I am an ancestor of another interactive → drop me
          }
          return true;
        });

        // ── DEDUP 2: collapse near-identical bounding rects (keep smallest area) ──
        const RECT_TOL = 4;
        function rectsClose(a, b) {
          return Math.abs(a.left - b.left) <= RECT_TOL &&
                 Math.abs(a.top - b.top) <= RECT_TOL &&
                 Math.abs(a.right - b.right) <= RECT_TOL &&
                 Math.abs(a.bottom - b.bottom) <= RECT_TOL;
        }
        const dedupedByRect = [];
        for (const v of visible) {
          const dup = dedupedByRect.find(d => rectsClose(d.rect, v.rect));
          if (dup) {
            // Keep the one with smaller area (more specific)
            const aArea = dup.rect.width * dup.rect.height;
            const bArea = v.rect.width * v.rect.height;
            if (bArea < aArea) {
              const idx = dedupedByRect.indexOf(dup);
              dedupedByRect[idx] = v;
            }
          } else {
            dedupedByRect.push(v);
          }
        }
        visible = dedupedByRect;

        // Sort reading order (top-to-bottom, left-to-right with row tolerance)
        visible.sort((a, b) => {
          const ay = Math.round(a.rect.top / 20);
          const by = Math.round(b.rect.top / 20);
          if (ay !== by) return ay - by;
          return a.rect.left - b.rect.left;
        });

        const capped = visible.slice(0, 150);

        // Build id map (lives on window in extension's isolated world; persists across executeScript calls)
        if (!window.__alvelika) window.__alvelika = {};
        window.__alvelika.idMap = new Map();

        // Build overlay
        const overlay = document.createElement('div');
        overlay.id = '__alvelika_badge_overlay__';
        overlay.style.cssText =
          'position:fixed;top:0;left:0;width:100%;height:100%;' +
          'pointer-events:none;z-index:2147483646;';

        const BADGE_SIZE = 16;
        const COLLISION_DIST = 20;
        const placed = []; // {x, y} centers

        function isFree(cx, cy) {
          for (const p of placed) {
            const dx = p.x - cx, dy = p.y - cy;
            if (dx * dx + dy * dy < COLLISION_DIST * COLLISION_DIST) return false;
          }
          return true;
        }
        function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

        capped.forEach((item, idx) => {
          const id = idx + 1;
          window.__alvelika.idMap.set(id, item.el);

          const r = item.rect;
          const half = BADGE_SIZE / 2;
          const ecx = (r.left + r.right) / 2;
          const ecy = (r.top + r.bottom) / 2;

          // 4 candidate centers, INSIDE the element (so the badge fully sits on top of the element)
          const corners = (r.width >= BADGE_SIZE && r.height >= BADGE_SIZE)
            ? [
                { x: r.left + half + 1,  y: r.top + half + 1 },     // inside top-left
                { x: r.right - half - 1, y: r.top + half + 1 },     // inside top-right
                { x: r.left + half + 1,  y: r.bottom - half - 1 },  // inside bottom-left
                { x: r.right - half - 1, y: r.bottom - half - 1 },  // inside bottom-right
                { x: ecx, y: ecy }                                  // center (fallback)
              ]
            : [
                // Element too small to fit badge inside → center it on the element
                { x: ecx, y: ecy }
              ];

          let placedAt = null;
          for (const c of corners) {
            const cx = clamp(c.x, half, vw - half);
            const cy = clamp(c.y, half, vh - half);
            if (isFree(cx, cy)) { placedAt = { x: cx, y: cy, leader: false }; break; }
          }

          // Last resort: just put it at element center (no leader line — keep visuals clean)
          if (!placedAt) {
            placedAt = {
              x: clamp(ecx, half, vw - half),
              y: clamp(ecy, half, vh - half),
              leader: false
            };
          }
          placed.push({ x: placedAt.x, y: placedAt.y });

          const badge = document.createElement('div');
          badge.textContent = String(id);
          badge.style.cssText =
            'position:absolute;' +
            'left:' + (placedAt.x - BADGE_SIZE / 2) + 'px;' +
            'top:' + (placedAt.y - BADGE_SIZE / 2) + 'px;' +
            'width:' + BADGE_SIZE + 'px;height:' + BADGE_SIZE + 'px;' +
            'border-radius:50%;background:#ff2d55;color:#fff;' +
            'font:700 10px/' + (BADGE_SIZE - 2) + 'px "Segoe UI",system-ui,sans-serif;' +
            'text-align:center;border:1px solid #fff;' +
            'box-shadow:0 0 3px rgba(0,0,0,0.6);box-sizing:border-box;';
          overlay.appendChild(badge);
        });

        document.documentElement.appendChild(overlay);

        return {
          title: document.title,
          url: window.location.href,
          idCount: capped.length
        };
      }
    });

    if (labelResults && labelResults[0] && labelResults[0].result) {
      result.pageTitle = labelResults[0].result.title;
      result.pageUrl = labelResults[0].result.url;
      result.idCount = labelResults[0].result.idCount;
    }

    // 2. Wait for paint
    await delay(180);

    // 3. Capture screenshot (badges visible, Alvelika overlay hidden)
    try {
      const res = await chrome.runtime.sendMessage({ action: 'captureScreen' });
      if (res && res.screenshot) result.screenshot = res.screenshot;
    } catch (err) {
      console.log('Could not capture screenshot:', err);
    }

    // 4. Restore Alvelika overlay — KEEP badges visible for debugging.
    //    They'll be cleared automatically at the start of the next captureAgentScreenshot call.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const overlayHost = document.querySelector('[data-alvelika-agent-overlay-host]');
          if (overlayHost) overlayHost.style.display = '';
        }
      });
    } catch (err) {
      console.log('Could not restore Alvelika overlay:', err);
    }

  } catch (err) {
    console.log('Could not capture labeled screenshot:', err);
  }

  return result;
}

// Step 0 — Analyze the user's raw prompt and produce a clear goal
function buildGoalAnalysisPrompt() {
  return `You are Alvelika Agent. The user just gave you a task.
You receive the accessibility tree and screenshot of the current page.
You may also receive the user's PREVIOUS MESSAGES (conversation history) for context.
If the screenshot contains an Alvelika mauve activity overlay, glowing frame, or status card, ignore it. That overlay belongs to the extension, not the website.

Your job is to ANALYZE the user's request, ASSESS its feasibility, and produce a clear, precise goal.
Use the conversation history to understand references like "do that again", "now search for the other one", "continue", etc.

YOUR RESPONSE MUST BE PURE JSON:

{
  "thinking": {
    "what_user_said": "What did the user literally ask for?",
    "what_user_wants": "What is the user truly trying to achieve? What information or outcome do they want?",
    "key_details": "What specific details did the user mention that I must follow exactly? (e.g., specific website, specific query, specific action)",
    "history_context": "What relevant context from previous messages helps clarify this request? (write 'N/A' if no history or not relevant)",
    "feasibility": "Is this task actually achievable using a browser? Consider: Does this website/app support this action? Is there a known limitation? For example: downloading source code from a hosting platform that doesn't expose source files, accessing admin features without credentials, or performing actions that require desktop software. Rate: FEASIBLE, UNCERTAIN, or INFEASIBLE.",
    "alternative_if_infeasible": "If INFEASIBLE or UNCERTAIN, what is the closest achievable alternative the user might accept? If FEASIBLE, write 'N/A'."
  },
  "feasibility": "FEASIBLE | UNCERTAIN | INFEASIBLE",
  "infeasible_reason": "Only if INFEASIBLE: a clear, honest explanation of WHY this cannot be done and what the user should do instead. Otherwise null.",
  "user_goal": "A clear, precise, step-by-step rewrite of the user's goal. Be specific. Include every constraint the user mentioned. Resolve any references to previous messages. If INFEASIBLE, rewrite the goal as the closest achievable alternative OR leave empty."
}

RULES:
1. If the user mentioned a specific website (e.g., Google), that is a hard constraint — do NOT use a different website.
2. Rewrite the goal so it cannot be misunderstood.
3. If the user's request references previous messages (e.g., "do it again", "the same thing"), use the conversation history to resolve what they mean.
4. FEASIBILITY IS CRITICAL. Do NOT attempt tasks that are impossible. Examples of INFEASIBLE tasks:
   - Downloading source files from a platform that only serves built/deployed output (e.g., Netlify manual deploys, Vercel static deploys)
   - Accessing private data without authentication
   - Performing actions that require native OS capabilities (file system access, installing software)
   - Interacting with pages behind login walls when not logged in
5. If a task is INFEASIBLE, it is better to tell the user honestly than to waste steps clicking around aimlessly.
6. Respond with PURE JSON only. No wrapping, no code fences, no extra text.`;
}

function buildAgentSystemPrompt(userGoal, executionHistoryLog, executionFeedbackBlock) {
  const historyBlock = executionHistoryLog
    ? `\n\nREAL STEP HISTORY:\n${executionHistoryLog}`
    : '\n\nREAL STEP HISTORY:\nThis is the FIRST step. No previous commands have been executed.';
  const feedbackBlock = executionFeedbackBlock ? `\n\n${executionFeedbackBlock}` : '';

  return `You are Alvelika Agent — an autonomous AI that ACTS on web pages. Your job is to COMPLETE the user's goal efficiently, not to explain or analyze endlessly.

You receive these inputs every step:
- SCREENSHOT: The source of truth. What you SEE is what exists. If the target is visible, act on it.
- ACCESSIBILITY TREE: A structured list of interactive elements on the page. Each node shows: [id] role "name" (states) ← CSS_SELECTOR. Use the CSS selector after the ← arrow for actions. Elements marked "(implicit)" are non-semantic elements (divs/spans) that behave as buttons — they are clickable.
- PAGE LANDMARKS: Structural regions of the page (navigation, main, search, etc.) for orientation.
- FOCUS TRAP: If a modal/dialog is open, elements are scoped to that modal. The tree only shows what is currently actionable.
- VISUAL BLACK BOXES: Elements like <canvas>, <svg>, <video> that have no internal DOM. You cannot click inside them with selectors — use the screenshot to understand their content. If the target is inside a black box, describe what you see and use coordinates from the bounding box info.
- WALLED GARDENS: Iframes detected on the page. Their internal content may be inaccessible. If your target is inside an iframe, note it in your thinking.
- PAGE TEXT: The visible text content of the page.
- If you see an Alvelika mauve overlay, glowing frame, or status card in the screenshot, ignore it. It is the agent's own activity layer, not part of the page.

USER GOAL: "${userGoal}"
${historyBlock}${feedbackBlock}

═══ DECISION POLICY (follow strictly) ═══

1. IF the target is clearly visible in the screenshot AND a matching node exists in the A11y tree → CLICK IT NOW. Do not scroll, do not re-analyze.
2. IF the target is visible but no perfect match exists → use the CLOSEST matching node. Match by role and name (e.g., find a link whose name matches the text you see).
3. IF there are ads/sponsored items → SKIP them. Click the first REAL result.
4. NEVER scroll more than 2 times for the same sub-goal. After 2 scrolls, you MUST attempt a click with the best available selector.
5. The "type" command auto-focuses the element. Do NOT click an input before typing — just use "type" directly.
6. READ the real browser feedback carefully before choosing the next action. Use exact errors to self-correct.
7. Act IMMEDIATELY when confidence is high and risk is low. Analysis is support, not the goal.
8. Use element STATES to understand the page: if a checkbox is "checked", a menu is "expanded", or a button is "disabled", factor that into your decision.
9. IMPLICIT ELEMENTS: Nodes marked "(implicit)" are non-standard clickable elements (e.g., a <div> styled as a button). They work with normal "click" commands — treat them like regular buttons.
10. BLACK BOXES: If your target is inside a canvas/svg/video (listed in VISUAL BLACK BOXES), you cannot click sub-elements. Look at the screenshot to understand the content. Describe what you see in your thinking.
11. IFRAMES: If your target appears to be inside an iframe (listed in WALLED GARDENS), note it. You can still try clicking elements visible in the main DOM near the iframe boundary.

═══ SELF-CORRECTION / RETRY RULES ═══

- The REAL EXECUTION FEEDBACK block contains the browser's exact result from the last action. Treat it as ground truth.
- If the last action failed because of invalid selector syntax, write a NEW valid selector. Common causes are missing closing quotes or a missing closing ] in an attribute selector.
- NEVER repeat the exact same selector after an invalid selector failure.
- After 3 failed attempts for the same exact action, that action is blocked.
- If an action is listed in BLOCKED ACTIONS, do not repeat it. You MUST choose a different selector or a different action.
- After repeated failures, prefer a different selector strategy: pick another node from the A11y tree with a similar role/name, use a broader parent container, or a different command.

═══ LOOP DETECTION & IMPOSSIBILITY RULES ═══

- You receive a VISITED URLS section showing every URL you have been on and how many times.
- If you see the SAME URL appearing 2+ times, you are LOOPING. You MUST either:
  a) Try a completely different approach (different navigation path, different element), OR
  b) Conclude the task is IMPOSSIBLE and use "done" with type "impossible" to explain why.
- If you have spent 3+ steps without making meaningful progress toward the goal, STOP and honestly tell the user the task cannot be completed, explaining WHY.
- NEVER keep clicking around hoping to find something that doesn't exist. If a feature/button/link is not in the accessibility tree and not visible in the screenshot, it DOES NOT EXIST on this page.
- It is FAR BETTER to say "This task is not possible because [reason]" than to waste the user's time looping.

═══ FIRST QUESTION (answer BEFORE deciding any action) ═══

Before choosing an action, you MUST answer:
  "goal_check": Is the user's goal ALREADY achieved right now based on the current page URL, title, screenshot, and page text?
  - Compare the current state against the goal. If the goal was "click the first video" and you are now ON a video page → the goal IS achieved.
  - If YES → immediately respond with instruct type "done". Do NOT repeat previous actions.
  - If NO → explain briefly what is still missing, then decide the next action.
  "loop_check": Am I going in circles? Have I visited this URL before? Am I repeating actions that already failed?
  - If YES → you MUST change strategy or declare the task impossible.
  "feasibility_check": Based on everything I can see on this page, is the remaining goal actually achievable?
  - If the UI simply does not offer the feature/button/action the user needs, the answer is NO.
  - If NO → use "done" with a clear explanation of why it cannot be done and what the user should do instead.

═══ RESPONSE FORMAT (pure JSON, nothing else) ═══

{
  "thinking": {
    "goal_check": "Is the goal already achieved? YES or NO, and why?",
    "loop_check": "Am I looping or stuck? Have I been on this URL before? YES or NO.",
    "feasibility_check": "Is the remaining goal achievable from this page? YES, UNCERTAIN, or NO — and why?",
    "state": "Brief: what page am I on, did the last command work?",
    "target": "Brief: what element do I need to interact with next? (skip if goal achieved or impossible)",
    "action_reason": "Brief: why this action, and why not an alternative? (skip if goal achieved or impossible)"
  },
  "instruct": {
    "type": "navigate | click | type | pressKey | copy | paste | scroll | wait | done",
    "selector": "CSS selector from the ← column in the A11y tree",
    "url": "URL (only for navigate)",
    "value": "text to type (only for type), key name (only for pressKey: Enter, Escape, Tab, ArrowDown, ArrowUp, Backspace, Space), or up/down (only for scroll)",
    "description": "short description of this action"
  },
  "validateOption": "Full history of all steps including this one. Mark each ✓ or ✗."
}

═══ SELECTOR RULES ═══

- COPY selectors exactly from the ← column in the accessibility tree nodes.
- Match elements by their ROLE and NAME. Example: to click a search button, find a node like [5] button "Search" ← #search-btn and use #search-btn.
- For links, the selector will typically be href-contains: a[href*="/watch?v=..."]
- NEVER invent selectors from memory. The accessibility tree is the truth.

═══ COMMANDS ═══

- "navigate": Go to a URL. Requires "url".
- "click": Click an element. Requires "selector".
- "type": Type into input/textarea. Requires "selector" and "value". Does NOT press Enter — use "pressKey" after if needed.
- "pressKey": Press a keyboard key. Requires "value" (key name: Enter, Escape, Tab, ArrowDown, ArrowUp, Backspace, Space). Optional "selector" to target a specific element (otherwise uses the currently focused element). Use this after "type" to submit forms, or to press Escape to close modals.
- "copy": Select and copy specific text from the page. Requires "value" (the exact word or phrase to find and select). Optional "selector" to limit the search to a specific element. The text is precisely selected word-by-word and copied to clipboard. Returns the copied text.
- "paste": Paste text into the currently focused or specified element. Requires "selector" and "value" (text to paste). Uses insertText for compatibility with rich editors (Google Docs, etc.).
- "scroll": Scroll page. Requires "value": "down" or "up".
- "wait": Wait for page update (use sparingly).
- "done": Goal complete OR goal impossible. Put final answer/explanation in "description". If the goal was impossible, start description with "IMPOSSIBLE:" followed by a clear, honest explanation.

═══ CRITICAL ═══

- Your primary job is to COMPLETE the goal, not to maximize explanation.
- Keep "thinking" SHORT (1-2 sentences each). Long analysis = wasted time.
- If the target is visible and the action is obvious, just do it.
- If the goal is IMPOSSIBLE, say so immediately. Do NOT loop.
- Respond with PURE JSON only. No markdown, no code fences, no extra text.`;
}

// ─── Agent v2 — system prompt (Set-of-Mark, three-object response) ───
function buildAgentSystemPromptV2(userGoal, whyHistory, lastFeedback, blockedActions) {
  const historyBlock = whyHistory && whyHistory.length
    ? '\n\nDECISION HISTORY (your past justifications, oldest first):\n' +
      whyHistory.map((w, i) => `Step ${i + 1}: ${w}`).join('\n')
    : '\n\nDECISION HISTORY:\nThis is the first step. No previous decisions.';

  const feedbackBlock = lastFeedback
    ? '\n\nLAST EXECUTION FEEDBACK (from the browser, ground truth):\n' + lastFeedback
    : '\n\nLAST EXECUTION FEEDBACK:\nNo command has been executed yet.';

  const blockedBlock = blockedActions && blockedActions.length
    ? '\n\nBLOCKED ACTIONS (do not repeat — pick a different id or action):\n' +
      blockedActions.map((b, i) => `${i + 1}. ${b}`).join('\n')
    : '';

  return `You are Alvelika Agent — an autonomous AI that ACTS on web pages.

You receive ONLY:
- A SCREENSHOT of the current viewport. Every clickable / typeable element has a SMALL RED CIRCULAR BADGE drawn directly ON the element, showing an integer id. The badge always sits on top of the element it labels — never floating in empty space.
- The USER GOAL.
- Your previous DECISION HISTORY.
- The LAST EXECUTION FEEDBACK from the browser.

You do NOT receive HTML, CSS selectors, accessibility text, or page text. The screenshot IS the source of truth.

USER GOAL: "${userGoal}"
${historyBlock}${feedbackBlock}${blockedBlock}

═══ HOW IT WORKS ═══

To act on an element, return its badge id. The program owns a map { id → element } and will execute the action on the element bound to that id. You never write a CSS selector.

═══ RESPONSE FORMAT (PURE JSON, three top-level keys, in this exact order) ═══

{
  "thinking": {
    "goal_achieved":     "Is the user's goal already fully achieved? YES or NO, and why.",
    "previous_action":   "Did the previous action succeed (produce the effect I expected)? YES or NO, and why. Say N/A on the first step.",
    "screen_is_on_path": "Is this current screen the one that leads me to the goal? YES or NO, and why.",
    "target_choice":     "Given the user's goal, which badge id should I pick and why?",
    "action_choice":     "What is the best action type for that target and why?"
  },
  "direct_response": {
    "action": "click | type | pressKey | scroll | navigate | wait | done",
    "id":     <integer badge id from the screenshot — required for click / type; optional for pressKey; omit for scroll / navigate / wait / done>,
    "value":  "<text to type | key name (Enter, Escape, Tab, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Backspace, Space, Delete) | 'up' or 'down' for scroll | URL for navigate | final answer or 'IMPOSSIBLE: <reason>' for done>"
  },
  "why_this_choice": "Free-form one-paragraph explanation of WHY you picked this exact id+action over the alternatives. This is saved and shown back to you next step, so be precise — write it for your future self."
}

═══ COMMANDS ═══

- "click":     Click the element bound to "id".
- "type":      Type "value" into the input bound to "id". Auto-focuses. Does NOT press Enter, does NOT submit.
- "pressKey":  Press a key. "value" = key name. Optional "id" to focus before pressing.
- "scroll":    "value" = "up" or "down". No id.
- "navigate":  "value" = URL. No id.
- "wait":      Pause for the page to settle. Use sparingly.
- "done":      Goal complete OR impossible. Put final answer / explanation in "value". Prefix with "IMPOSSIBLE: " if impossible.

═══ RULES ═══

1. NEVER invent an id that is not visible as a red badge on the screenshot.
2. If two badges are too close to read clearly, scroll or pick the one whose badge you can clearly identify.
3. If the goal is achieved, immediately respond with action "done".
4. After 2 scrolls without progress, MUST attempt a click on the best available badge.
5. If the LAST EXECUTION FEEDBACK shows the previous action failed, pick a DIFFERENT id — do NOT repeat the same id.
6. Reply with PURE JSON only — no markdown fences, no extra text before or after the JSON.

═══ TYPING & SEARCH (CRITICAL — read this twice) ═══

7. The "type" command ONLY puts text into the input. It does NOT submit the form, does NOT trigger the search, does NOT navigate.
8. After ANY "type" into a search box / form input, your VERY NEXT step MUST be:
     { "action": "pressKey", "value": "Enter", "id": <same id you typed into> }
   Do NOT click a magnifier icon, do NOT click "Search", do NOT click anything else first. Pressing Enter is the only reliable submit.
9. If you previously typed a query but the page still shows the home/recommended content (not a results list), it means you forgot Enter. Press Enter NOW with the same input id — do NOT re-type, do NOT re-click the search box.
10. Only click a video / link AFTER the page clearly shows a search-results list for your query. If the page still looks like a home page with mixed recommendations, the search has NOT been performed yet.`;
}

// ─── Agent v2 — execute by badge id (uses window.__alvelika.idMap on the page) ───
async function executeAgentCommandById(instruct) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return { success: false, error: 'No active tab found.' };

  const action = String(instruct.action || '').toLowerCase();

  if (action === 'done') return { success: true, done: true, description: instruct.value || 'Done.' };

  if (action === 'wait') {
    await delay(2000);
    return { success: true, description: 'Waited for page to update.' };
  }

  if (action === 'navigate') {
    const url = instruct.url || instruct.value;
    if (!url) return { success: false, error: 'navigate requires a URL in "value".' };
    try {
      await chrome.tabs.update(tab.id, { url });
      let loaded = false;
      const loadPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 8000);
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
      await delay(2000);
      if (!loaded) await loadPromise;
      return { success: true, description: `Navigated to ${url}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  if (action === 'scroll') {
    const direction = String(instruct.value || 'down').toLowerCase();
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (dir) => {
          window.scrollBy({ top: dir === 'up' ? -500 : 500, behavior: 'smooth' });
        },
        args: [direction]
      });
      await delay(600);
      return { success: true, description: `Scrolled ${direction}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  if (action === 'click') {
    const id = Number(instruct.id);
    if (!Number.isInteger(id) || id < 1) return { success: false, error: `Invalid id: ${instruct.id}` };
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (badgeId) => {
          const map = (window.__alvelika && window.__alvelika.idMap) || null;
          if (!map) return { success: false, errorType: 'no_id_map', error: 'Badge map missing — page may have reloaded.' };
          const el = map.get(badgeId);
          if (!el) return { success: false, errorType: 'id_not_found', error: `No element bound to id ${badgeId}.` };
          if (!el.isConnected) return { success: false, errorType: 'stale_element', error: `Element for id ${badgeId} is detached.` };
          try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch (e) {}
          el.focus();
          el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
          el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
          el.click();
          return { success: true, description: `Clicked id ${badgeId}` };
        },
        args: [id]
      });
      await delay(2000);
      return results[0].result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  if (action === 'type') {
    const id = Number(instruct.id);
    if (!Number.isInteger(id) || id < 1) return { success: false, error: `Invalid id: ${instruct.id}` };
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (badgeId, value) => {
          const map = (window.__alvelika && window.__alvelika.idMap) || null;
          if (!map) return { success: false, errorType: 'no_id_map', error: 'Badge map missing.' };
          const el = map.get(badgeId);
          if (!el) return { success: false, errorType: 'id_not_found', error: `No element bound to id ${badgeId}.` };
          if (!el.isConnected) return { success: false, errorType: 'stale_element', error: `Element for id ${badgeId} is detached.` };
          el.focus();
          if ('value' in el && el.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (el.isContentEditable) {
            const inserted = document.execCommand('insertText', false, value);
            if (!inserted) el.textContent = value;
          } else {
            return { success: false, error: `Element id ${badgeId} is not a text input.` };
          }
          return { success: true, description: `Typed "${value}" into id ${badgeId}` };
        },
        args: [id, String(instruct.value || '')]
      });
      await delay(500);
      return results[0].result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  if (action === 'presskey') {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (badgeId, keyName) => {
          const keyMap = {
            'Enter': { key: 'Enter', code: 'Enter', keyCode: 13 },
            'Escape': { key: 'Escape', code: 'Escape', keyCode: 27 },
            'Tab': { key: 'Tab', code: 'Tab', keyCode: 9 },
            'ArrowDown': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
            'ArrowUp': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
            'ArrowLeft': { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
            'ArrowRight': { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
            'Backspace': { key: 'Backspace', code: 'Backspace', keyCode: 8 },
            'Space': { key: ' ', code: 'Space', keyCode: 32 },
            'Delete': { key: 'Delete', code: 'Delete', keyCode: 46 }
          };
          const keyInfo = keyMap[keyName];
          if (!keyInfo) return { success: false, error: `Unknown key: ${keyName}` };

          let target = document.activeElement || document.body;
          if (badgeId !== null && badgeId !== undefined) {
            const map = (window.__alvelika && window.__alvelika.idMap) || null;
            if (map) {
              const el = map.get(badgeId);
              if (el && el.isConnected) { el.focus(); target = el; }
            }
          }

          const eventInit = {
            key: keyInfo.key, code: keyInfo.code, keyCode: keyInfo.keyCode,
            which: keyInfo.keyCode, bubbles: true, cancelable: true
          };
          target.dispatchEvent(new KeyboardEvent('keydown', eventInit));
          target.dispatchEvent(new KeyboardEvent('keypress', eventInit));
          target.dispatchEvent(new KeyboardEvent('keyup', eventInit));

          if (keyName === 'Enter' && target.tagName && target.tagName.toLowerCase() === 'input') {
            const form = target.closest('form');
            if (form) {
              const submitBtn = form.querySelector('[type="submit"], button:not([type="button"])');
              if (submitBtn) submitBtn.click();
              else if (form.requestSubmit) form.requestSubmit();
              else form.submit();
            }
          }
          return { success: true, description: `Pressed ${keyName}${badgeId ? ` on id ${badgeId}` : ''}` };
        },
        args: [instruct.id != null ? Number(instruct.id) : null, instruct.value]
      });
      await delay(1500);
      return results[0].result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return { success: false, error: `Unknown action: ${action}` };
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
          const safeQuery = (candidate) => {
            try {
              return { element: document.querySelector(candidate), error: null };
            } catch (err) {
              return {
                element: null,
                error: err instanceof Error ? err.message : String(err)
              };
            }
          };

          let query = safeQuery(selector);
          if (query.error) {
            return {
              success: false,
              errorType: 'invalid_selector_syntax',
              error: query.error
            };
          }

          let el = query.element;

          // Fallback 1: if selector has exact href=, try contains match
          if (!el && selector.includes('href="') && !selector.includes('href*=')) {
            const hrefMatch = selector.match(/href="([^"]+)"/);
            if (hrefMatch) {
              const href = hrefMatch[1].split('&pp=')[0].split('&feature=')[0].split('&si=')[0];
              query = safeQuery(`a[href*="${href}"]`);
              if (query.error) {
                return {
                  success: false,
                  errorType: 'invalid_selector_syntax',
                  error: query.error
                };
              }
              el = query.element;
            }
          }

          // Fallback 2: if selector has href*=, try shorter match
          if (!el && selector.includes('href*=')) {
            const hrefMatch = selector.match(/href\*="([^"]+)"/);
            if (hrefMatch) {
              const parts = hrefMatch[1].split('?');
              if (parts.length > 1) {
                const pathAndKey = parts[0] + '?' + parts[1].split('&')[0];
                query = safeQuery(`a[href*="${pathAndKey}"]`);
                if (query.error) {
                  return {
                    success: false,
                    errorType: 'invalid_selector_syntax',
                    error: query.error
                  };
                }
                el = query.element;
              }
            }
          }

          if (!el) return { success: false, errorType: 'element_not_found', error: `Element not found: ${selector}` };
          try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch (e) {}
          el.focus();
          el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
          el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
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
          let el = null;
          try {
            el = document.querySelector(selector);
          } catch (err) {
            return {
              success: false,
              errorType: 'invalid_selector_syntax',
              error: err instanceof Error ? err.message : String(err)
            };
          }
          if (!el) return { success: false, errorType: 'element_not_found', error: `Element not found: ${selector}` };
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

  // COPY — precisely select and copy specific text from the page
  if (type === 'copy') {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (selector, textToFind) => {
          if (!textToFind) return { success: false, error: 'No text specified to copy.' };

          const root = selector ? document.querySelector(selector) : document.body;
          if (!root) return { success: false, errorType: 'element_not_found', error: `Element not found: ${selector}` };

          // Walk all text nodes to find the exact phrase
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
          const needle = textToFind;
          let found = false;

          // Strategy 1: single text node contains the phrase
          const node = walker.currentNode;
          let current;
          while ((current = walker.nextNode())) {
            const idx = current.textContent.indexOf(needle);
            if (idx !== -1) {
              const range = document.createRange();
              range.setStart(current, idx);
              range.setEnd(current, idx + needle.length);
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
              found = true;
              break;
            }
          }

          // Strategy 2: phrase spans multiple adjacent text nodes
          if (!found) {
            const walker2 = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
            const nodes = [];
            let n;
            while ((n = walker2.nextNode())) nodes.push(n);

            // Build concatenated text with node boundaries
            let concat = '';
            const map = []; // { node, localOffset, globalStart }
            for (const tn of nodes) {
              const start = concat.length;
              concat += tn.textContent;
              map.push({ node: tn, localOffset: 0, globalStart: start });
            }

            const gIdx = concat.indexOf(needle);
            if (gIdx !== -1) {
              const gEnd = gIdx + needle.length;
              // Find start node
              let startNode, startOffset, endNode, endOffset;
              for (const m of map) {
                const mEnd = m.globalStart + m.node.textContent.length;
                if (!startNode && gIdx >= m.globalStart && gIdx < mEnd) {
                  startNode = m.node;
                  startOffset = gIdx - m.globalStart;
                }
                if (gEnd > m.globalStart && gEnd <= mEnd) {
                  endNode = m.node;
                  endOffset = gEnd - m.globalStart;
                  break;
                }
              }
              if (startNode && endNode) {
                const range = document.createRange();
                range.setStart(startNode, startOffset);
                range.setEnd(endNode, endOffset);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                found = true;
              }
            }
          }

          if (!found) return { success: false, error: `Text not found on page: "${needle}"` };

          // Copy the selection to clipboard
          const selectedText = window.getSelection().toString();
          document.execCommand('copy');
          return { success: true, description: `Copied: "${selectedText}"`, copiedText: selectedText };
        },
        args: [instruct.selector || null, instruct.value]
      });
      await delay(500);
      return results[0].result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // PASTE — paste text into an element (works with rich editors)
  if (type === 'paste') {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (selector, value) => {
          let el = null;
          try {
            el = document.querySelector(selector);
          } catch (err) {
            return { success: false, errorType: 'invalid_selector_syntax', error: err instanceof Error ? err.message : String(err) };
          }
          if (!el) return { success: false, errorType: 'element_not_found', error: `Element not found: ${selector}` };

          el.focus();

          // Try insertText first (works with contenteditable and rich editors)
          const inserted = document.execCommand('insertText', false, value);
          if (inserted) return { success: true, description: `Pasted "${value}" into ${selector}` };

          // Fallback: set value directly (standard inputs/textareas)
          if ('value' in el) {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, description: `Pasted "${value}" into ${selector}` };
          }

          return { success: false, error: 'Could not paste into element.' };
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

  // PRESSKEY — press a keyboard key (Enter, Escape, Tab, etc.)
  if (type === 'pressKey') {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (selector, keyName) => {
          // Map common key names to KeyboardEvent properties
          const keyMap = {
            'Enter': { key: 'Enter', code: 'Enter', keyCode: 13 },
            'Escape': { key: 'Escape', code: 'Escape', keyCode: 27 },
            'Tab': { key: 'Tab', code: 'Tab', keyCode: 9 },
            'ArrowDown': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
            'ArrowUp': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
            'ArrowLeft': { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
            'ArrowRight': { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
            'Backspace': { key: 'Backspace', code: 'Backspace', keyCode: 8 },
            'Space': { key: ' ', code: 'Space', keyCode: 32 },
            'Delete': { key: 'Delete', code: 'Delete', keyCode: 46 }
          };

          const keyInfo = keyMap[keyName];
          if (!keyInfo) return { success: false, error: `Unknown key: ${keyName}. Supported: ${Object.keys(keyMap).join(', ')}` };

          let target = document.activeElement || document.body;
          if (selector) {
            try {
              const el = document.querySelector(selector);
              if (el) {
                el.focus();
                target = el;
              }
            } catch (err) {
              return { success: false, errorType: 'invalid_selector_syntax', error: err.message };
            }
          }

          const eventInit = {
            key: keyInfo.key,
            code: keyInfo.code,
            keyCode: keyInfo.keyCode,
            which: keyInfo.keyCode,
            bubbles: true,
            cancelable: true
          };

          target.dispatchEvent(new KeyboardEvent('keydown', eventInit));
          target.dispatchEvent(new KeyboardEvent('keypress', eventInit));
          target.dispatchEvent(new KeyboardEvent('keyup', eventInit));

          // Special handling: if Enter is pressed on an input inside a form, submit the form
          if (keyName === 'Enter' && target.tagName && target.tagName.toLowerCase() === 'input') {
            const form = target.closest('form');
            if (form) {
              // Try native submit
              const submitBtn = form.querySelector('[type="submit"], button:not([type="button"])');
              if (submitBtn) {
                submitBtn.click();
              } else {
                form.requestSubmit ? form.requestSubmit() : form.submit();
              }
            }
          }

          return { success: true, description: `Pressed ${keyName}${selector ? ` on ${selector}` : ''}` };
        },
        args: [instruct.selector || null, instruct.value]
      });
      await delay(1500);
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
const AGENT_MAX_ACTION_RETRIES = 3;
const AGENT_OVERLAY_STORAGE_KEY = 'agentOverlayState';

function normalizeAgentValue(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function formatAgentCommand(instruct = {}) {
  const parts = [`type=${instruct.type || 'unknown'}`];
  if (instruct.selector) parts.push(`selector=${instruct.selector}`);
  if (instruct.url) parts.push(`url=${instruct.url}`);
  if (typeof instruct.value !== 'undefined' && instruct.value !== '') parts.push(`value=${instruct.value}`);
  return parts.join(' | ');
}

function getAgentActionSignature(instruct = {}) {
  const type = normalizeAgentValue(instruct.type).toLowerCase();
  if (!type) return 'unknown';

  if (type === 'click' || type === 'type' || type === 'paste') {
    return `${type}:${normalizeAgentValue(instruct.selector)}`;
  }
  if (type === 'copy') {
    return `${type}:${normalizeAgentValue(instruct.value)}`;
  }
  if (type === 'navigate') {
    return `${type}:${normalizeAgentValue(instruct.url)}`;
  }
  if (type === 'scroll') {
    return `${type}:${normalizeAgentValue(instruct.value).toLowerCase()}`;
  }
  if (type === 'wait') return 'wait';
  if (type === 'done') return `done:${normalizeAgentValue(instruct.description)}`;
  return `${type}:${normalizeAgentValue(JSON.stringify(instruct))}`;
}

function isRetryTrackedAgentAction(instruct = {}) {
  return ['click', 'type', 'navigate', 'scroll', 'copy', 'paste', 'pressKey'].includes(normalizeAgentValue(instruct.type).toLowerCase());
}

function detectSelectorRepairHint(selector = '') {
  const hints = [];
  const singleQuotes = (selector.match(/'/g) || []).length;
  const doubleQuotes = (selector.match(/"/g) || []).length;
  const openBrackets = (selector.match(/\[/g) || []).length;
  const closeBrackets = (selector.match(/\]/g) || []).length;

  if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
    hints.push('The selector likely has an unmatched quote.');
  }
  if (openBrackets !== closeBrackets) {
    hints.push('The selector likely has a missing closing bracket.');
  }

  return hints.join(' ');
}

function buildExecutionFeedbackBlock(lastExecutionFeedback, blockedActions) {
  const blockedBlock = blockedActions.length
    ? blockedActions.map((entry, index) => `${index + 1}. ${entry}`).join('\n')
    : 'None.';

  return [
    'REAL EXECUTION FEEDBACK (from the browser, not from you):',
    lastExecutionFeedback || 'No previous command has been executed yet.',
    '',
    'BLOCKED ACTIONS:',
    blockedBlock
  ].join('\n');
}

function buildExecutionLogEntry(stepCount, instruct, result, meta = {}) {
  const lines = [
    `Step ${stepCount}: ${formatAgentCommand(instruct)}`,
    `${result.success ? '✓ SUCCESS' : '✗ FAILURE'}: ${result.description || result.error || 'No details provided.'}`
  ];

  if (meta.failureCount) {
    lines.push(`Failure count for this exact action: ${meta.failureCount}/${AGENT_MAX_ACTION_RETRIES}`);
  }
  if (!result.success && result.error) {
    lines.push(`Exact browser error: ${result.error}`);
  }
  if (!result.success && result.errorType === 'invalid_selector_syntax') {
    const hint = detectSelectorRepairHint(instruct.selector);
    if (hint) {
      lines.push(`Selector repair hint: ${hint}`);
    }
    lines.push('Self-correction: The last selector was invalid CSS. Write a NEW valid selector instead of repeating it.');
  }
  if (meta.blockedReason) {
    lines.push(`Retry guard: ${meta.blockedReason}`);
  }

  return lines.join('\n');
}

async function updateAgentPageOverlay(state = {}) {
  const overlayState = {
    active: Boolean(state.active),
    title: state.title || 'Working on this page',
    detail: state.detail || 'Please wait while the agent works. Clicks are temporarily locked.',
    step: state.step || 'Agent mode active',
    updatedAt: Date.now()
  };

  // Also update the side panel's agent running view
  if (agentRunningDetail && state.detail) agentRunningDetail.textContent = state.detail;
  if (agentRunningStep && state.step) agentRunningStep.textContent = state.step;

  try {
    await chrome.storage.local.set({ [AGENT_OVERLAY_STORAGE_KEY]: overlayState });
  } catch (err) {
    console.log('Could not persist agent overlay state:', err);
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
      return;
    }
    await chrome.tabs.sendMessage(tab.id, {
      action: 'setAgentOverlay',
      state: overlayState
    });
  } catch (err) {
    console.log('Could not sync agent overlay to page:', err);
  }
}

function showAgentRunningUI() {
  sendButton.classList.add('hidden');
  stopAgentButton.classList.remove('hidden');
}

function hideAgentRunningUI() {
  stopAgentButton.classList.add('hidden');
  sendButton.classList.remove('hidden');
}

const agentRunningView = document.getElementById('agent-running-view');
const agentRunningDetail = document.getElementById('agent-running-detail');
const agentRunningStep = document.getElementById('agent-running-step');
const agentRunningStopBtn = document.getElementById('agent-running-stop');

function showAgentRunningView() {
  document.querySelector('.header').classList.add('hidden');
  chatContainer.classList.add('hidden');
  document.querySelector('.input-bar').classList.add('hidden');
  agentRunningView.classList.remove('hidden');
}

function hideAgentRunningView() {
  agentRunningView.classList.add('hidden');
  document.querySelector('.header').classList.remove('hidden');
  chatContainer.classList.remove('hidden');
  document.querySelector('.input-bar').classList.remove('hidden');
}

// Stop button inside the agent running view
agentRunningStopBtn.addEventListener('click', async () => {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  agentRunning = false;
  hideAgentRunningUI();
  await updateAgentPageOverlay({ active: false });
  hideAgentRunningView();

  if (activeAgentThinkingEl && activeAgentThinkingEl.isConnected) {
    activeAgentThinkingEl.remove();
    activeAgentThinkingEl = null;
  }
  appendAIMessage('Request stopped by user.', { className: 'message ai' });
  conversationHistory.push({ role: 'assistant', content: '[Request stopped by user.]' });
  chrome.storage.local.set({ conversationHistory });
});

let activeAgentThinkingEl = null;

stopAgentButton.addEventListener('click', async () => {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  
  agentRunning = false;
  hideAgentRunningUI();
  hideAgentRunningView();
  await updateAgentPageOverlay({ active: false });
  
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

// Listen for force-stop signal from the overlay stop button (via content script → background)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.agentForceStop && changes.agentForceStop.newValue === true) {
    // Clear the flag immediately
    chrome.storage.local.remove('agentForceStop');
    
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    agentRunning = false;
    hideAgentRunningUI();
    hideAgentRunningView();
    
    if (activeAgentThinkingEl && activeAgentThinkingEl.isConnected) {
      activeAgentThinkingEl.remove();
      activeAgentThinkingEl = null;
    }
    appendAIMessage('Request stopped by user.', { className: 'message ai' });
    conversationHistory.push({ role: 'assistant', content: '[Request stopped by user.]' });
    chrome.storage.local.set({ conversationHistory });
  }
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
  await updateAgentPageOverlay({
    active: true,
    title: 'Alvelika Agent is working',
    detail: 'Understanding your goal and locking the page so nothing gets interrupted.',
    step: 'Preparing'
  });

  // Switch to minimal agent-running view
  showAgentRunningView();

  try {
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

    if (!agentRunning) return;

    // ═══ AGENT LOOP v2 (Set-of-Mark — screenshot only, no JS content) ═══
    const whyHistory = []; // array of "why_this_choice" strings, one per step
    let lastFeedback = null;
    const actionFailureCounts = new Map();
    const blockedActions = new Map();
    const visitedUrls = new Map();
    let stepsWithoutProgress = 0;
    let lastPageUrl = '';
    let stepCount = 0;

    while (agentRunning && stepCount < AGENT_MAX_STEPS) {
      stepCount++;
      await updateAgentPageOverlay({
        active: true,
        title: 'Alvelika Agent is working',
        detail: `Step ${stepCount}: labeling the page and planning the next move.`,
        step: `Step ${stepCount} • labeling`
      });

      // ── Show thinking state ──
      const thinkingEl = createThinkingState(`Step ${stepCount} — Labeling buttons & analyzing…`);
      activeAgentThinkingEl = thinkingEl;
      chatContainer.appendChild(thinkingEl);
      scrollToBottom();

      // ── 1. Capture labeled screenshot (badges drawn on page) ──
      const page = await captureAgentScreenshot();

      // ── 1.5 Loop detection ──
      const currentUrl = page.pageUrl || '';
      const normalizedUrl = currentUrl.split('?')[0].split('#')[0];
      visitedUrls.set(normalizedUrl, (visitedUrls.get(normalizedUrl) || 0) + 1);
      if (normalizedUrl === lastPageUrl) stepsWithoutProgress++;
      else { stepsWithoutProgress = 0; lastPageUrl = normalizedUrl; }

      let loopWarning = '';
      const visitsForCurrentUrl = visitedUrls.get(normalizedUrl) || 0;
      if (visitsForCurrentUrl >= 3) {
        loopWarning = `\n\n⚠️ SEVERE LOOP DETECTED: You have visited ${normalizedUrl} ${visitsForCurrentUrl} times. Either try a completely different approach or declare the task IMPOSSIBLE.`;
      } else if (stepsWithoutProgress >= 4) {
        loopWarning = `\n\n⚠️ STAGNATION DETECTED: ${stepsWithoutProgress} consecutive steps on the same page without progress. Take a decisive new action or declare IMPOSSIBLE.`;
      }

      // ── 2. Build prompt (screenshot only — no DOM/HTML/text) ──
      const systemPrompt = buildAgentSystemPromptV2(
        refinedGoal,
        whyHistory,
        lastFeedback,
        Array.from(blockedActions.values())
      );

      const userContent = [
        {
          type: 'text',
          text:
            `Current page title: ${page.pageTitle}\n` +
            `Current page URL: ${page.pageUrl}\n` +
            `Number of badges drawn on the screenshot: ${page.idCount} (ids 1..${page.idCount})${loopWarning}\n\n` +
            `Look at the screenshot. Each red circular badge marks an interactive element. Pick the badge id of your target.`
        }
      ];
      if (page.screenshot) {
        userContent.push({ type: 'image_url', image_url: { url: page.screenshot, detail: 'high' } });
      }

      // ── 3. Call LLM ──
      let parsed;
      try {
        const rawResult = await callLLM(apiConfig, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ], currentAbortController.signal);

        const cleaned = rawResult.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
        parsed = JSON.parse(cleaned);
      } catch (err) {
        if (err.name === 'AbortError' || err.message.includes('aborted')) break;
        await fadeOutAndRemove(thinkingEl, 400);
        appendAIMessage(`Agent error at step ${stepCount}: ${err.message}`, { className: 'message ai' });
        agentRunning = false;
        break;
      }

      // ── 4. Render thinking ──
      updateThinkingState(thinkingEl, `Step ${stepCount} — Thinking…`);
      await delay(300);
      await fadeOutAndRemove(thinkingEl, 300);
      activeAgentThinkingEl = null;

      const thinking = parsed.thinking || {};
      const thinkingDiv = document.createElement('div');
      thinkingDiv.className = 'message ai agent-thinking';

      const thinkingHeader = document.createElement('div');
      thinkingHeader.className = 'agent-thinking-header';
      thinkingHeader.innerHTML = `<span class="agent-thinking-icon">🧠</span> <span>Step ${stepCount} — Thinking</span> <span class="agent-thinking-toggle">▶</span>`;
      thinkingDiv.appendChild(thinkingHeader);

      const thinkingBody = document.createElement('div');
      thinkingBody.className = 'agent-thinking-body collapsed';
      const thinkingMd = [
        `**Goal achieved?** ${thinking.goal_achieved || '—'}`,
        `**Previous action?** ${thinking.previous_action || '—'}`,
        `**Screen on path?** ${thinking.screen_is_on_path || '—'}`,
        `**Target choice:** ${thinking.target_choice || '—'}`,
        `**Action choice:** ${thinking.action_choice || '—'}`,
        `**Why this choice:** ${parsed.why_this_choice || '—'}`
      ].join('\n\n');

      if (typeof marked !== 'undefined') thinkingBody.innerHTML = marked.parse(thinkingMd);
      else thinkingBody.textContent = thinkingMd;
      thinkingDiv.appendChild(thinkingBody);

      thinkingHeader.addEventListener('click', () => {
        thinkingBody.classList.toggle('collapsed');
        thinkingHeader.querySelector('.agent-thinking-toggle').textContent =
          thinkingBody.classList.contains('collapsed') ? '▶' : '▼';
      });
      chatContainer.appendChild(thinkingDiv);
      scrollToBottom();

      // ── 5. Validate direct_response ──
      const instruct = parsed.direct_response;
      if (!instruct || !instruct.action) {
        appendAIMessage('Agent returned invalid response (no direct_response.action). Stopping.', { className: 'message ai' });
        agentRunning = false;
        break;
      }

      // Append why to history (saved as string)
      if (typeof parsed.why_this_choice === 'string' && parsed.why_this_choice.trim()) {
        whyHistory.push(parsed.why_this_choice.trim());
      } else {
        whyHistory.push(`(no justification given) action=${instruct.action}${instruct.id != null ? ` id=${instruct.id}` : ''}`);
      }

      // ── 6. Show the command bubble ──
      const idLabel = instruct.id != null ? ` id=${instruct.id}` : '';
      const valLabel = instruct.value ? ` "${String(instruct.value).substring(0, 60)}"` : '';
      const cmdDiv = document.createElement('div');
      cmdDiv.className = 'message ai agent-command';
      cmdDiv.innerHTML = `<span class="agent-cmd-icon">⚡</span> <strong>Step ${stepCount}:</strong> ${instruct.action}${idLabel}${valLabel}`;
      chatContainer.appendChild(cmdDiv);
      scrollToBottom();

      await updateAgentPageOverlay({
        active: true,
        title: 'Alvelika Agent is working',
        detail: `Executing ${instruct.action}${idLabel}.`,
        step: `Step ${stepCount} • ${instruct.action}`
      });

      // ── 7. Done? ──
      if (String(instruct.action).toLowerCase() === 'done') {
        const doneText = instruct.value || 'Goal completed.';
        appendAIMessage(doneText, { stream: true });
        conversationHistory.push({ role: 'assistant', content: `[Agent completed] Goal: ${refinedGoal}\nResult: ${doneText}` });
        chrome.storage.local.set({ conversationHistory });
        agentRunning = false;
        break;
      }

      // ── 8. Execute with retry guard ──
      const actionType = String(instruct.action).toLowerCase();
      const sig = ['click', 'type', 'presskey'].includes(actionType)
        ? `${actionType}:${instruct.id ?? ''}`
        : actionType === 'navigate'
          ? `navigate:${instruct.value || instruct.url || ''}`
          : actionType === 'scroll'
            ? `scroll:${(instruct.value || '').toLowerCase()}`
            : actionType;

      const priorFailureCount = actionFailureCounts.get(sig) || 0;
      let blockedReason = blockedActions.get(sig) || null;
      let result;

      if (priorFailureCount >= AGENT_MAX_ACTION_RETRIES) {
        blockedReason = blockedReason || `${sig} is blocked after ${AGENT_MAX_ACTION_RETRIES} failed attempts. Pick a different id or action.`;
        blockedActions.set(sig, blockedReason);
        result = { success: false, errorType: 'retry_limit_reached', error: blockedReason };
      } else {
        result = await executeAgentCommandById(instruct);
      }

      if (result.success) {
        actionFailureCounts.delete(sig);
      } else if (result.errorType !== 'retry_limit_reached') {
        const newCount = priorFailureCount + 1;
        actionFailureCounts.set(sig, newCount);
        if (newCount >= AGENT_MAX_ACTION_RETRIES) {
          blockedActions.set(sig, `${sig} is blocked after ${AGENT_MAX_ACTION_RETRIES} failures. Last error: ${result.error || 'unknown'}`);
        }
      }

      // Build feedback for next step
      const feedbackLines = [
        `Step ${stepCount}: action=${instruct.action} id=${instruct.id ?? '—'} value=${instruct.value ? String(instruct.value).substring(0, 60) : '—'}`,
        `${result.success ? '✓ SUCCESS' : '✗ FAILURE'}: ${result.description || result.error || 'no details'}`
      ];
      if (!result.success && result.error) feedbackLines.push(`Browser error: ${result.error}`);
      lastFeedback = feedbackLines.join('\n');

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
  } finally {
    activeAgentThinkingEl = null;
    agentRunning = false;
    currentAbortController = null;
    hideAgentRunningUI();
    await updateAgentPageOverlay({ active: false });
    await clearAgentBadges();

    // Restore normal chat UI
    hideAgentRunningView();
  }
}

function streamText(fullText, container, signal) {
  return new Promise((resolve) => {
    if (!fullText) {
      container.textContent = '';
      resolve();
      return;
    }

    container.style.opacity = '0';
    container.style.transform = 'translateY(8px)';

    if (typeof marked !== 'undefined') {
      container.innerHTML = marked.parse(fullText);
    } else {
      container.textContent = fullText;
    }

    requestAnimationFrame(() => {
      container.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      container.style.opacity = '1';
      container.style.transform = 'translateY(0)';
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(resolve, 400);
    });
  });
}
