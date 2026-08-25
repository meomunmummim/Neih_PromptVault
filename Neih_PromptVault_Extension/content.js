// Listens for insertion requests from popup.js and injects text into active chat inputs
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'INSERT_PROMPT') {
    const activeEl = document.activeElement;
    
    // Check if user is focused on a standard textarea or input
    if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
      activeEl.value = request.text;
      activeEl.dispatchEvent(new Event('input', { bubbles: true }));
      sendResponse({ success: true });
      return;
    }


    // Check for rich-text editable elements (e.g. ChatGPT, Claude, Notion)
    const contentEditable = document.querySelector('[contenteditable="true"]') || activeEl;
    if (contentEditable && contentEditable.isContentEditable) {
      contentEditable.focus();
      document.execCommand('insertText', false, request.text);
      sendResponse({ success: true });
      return;
    }


    sendResponse({ success: false });
  }
});