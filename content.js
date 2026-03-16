chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageContext') {
    let contextText = '';
    
    // Prioritize semantic content, then fallback to everything
    const mainContent = document.querySelector('article') || document.querySelector('main');
    
    if (mainContent) {
      contextText = mainContent.innerText;
    } else {
      contextText = document.body.innerText;
    }
    
    // Trim and limit to avoid massive payloads breaking the messaging channel
    const MAX_LENGTH = 50000;
    contextText = contextText.substring(0, MAX_LENGTH);
    
    sendResponse({ 
      context: contextText, 
      title: document.title, 
      url: window.location.href 
    });
  }
  // Return true to indicate we wish to send a response asynchronously but here it's sync so not strictly necessary, 
  // however good practice if it ever becomes async.
  return true; 
});
