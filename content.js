// content.js - Скрипт що виконується на веб-сторінках

// Цей скрипт може бути використаний для додаткової функціональності
// наприклад, для взаємодії з елементами сторінки або збору інформації

// Слухач повідомлень від розширення
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageInfo') {
      // Збираємо інформацію про сторінку
      const pageInfo = {
          title: document.title,
          url: window.location.href,
          timestamp: new Date().toISOString()
      };
      
      sendResponse(pageInfo);
      return true;
  }
  
  if (request.action === 'highlightElement') {
      // Приклад: підсвічування елемента перед скріншотом
      const element = document.querySelector(request.selector);
      if (element) {
          element.style.outline = '3px solid red';
          setTimeout(() => {
              element.style.outline = '';
          }, 2000);
      }
      sendResponse({success: true});
      return true;
  }
});

// Функція для створення оверлея з інформацією
function createInfoOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'screenshot-overlay';
  overlay.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px;
      border-radius: 5px;
      font-family: Arial, sans-serif;
      font-size: 12px;
      z-index: 10000;
      display: none;
  `;
  
  overlay.innerHTML = `
      <div>URL: ${window.location.href}</div>
      <div>Час: ${new Date().toLocaleString()}</div>
  `;
  
  document.body.appendChild(overlay);
  return overlay;
}

// Показуємо оверлей при створенні скріншота
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showOverlay') {
      const overlay = document.getElementById('screenshot-overlay') || createInfoOverlay();
      overlay.style.display = 'block';
      
      setTimeout(() => {
          overlay.style.display = 'none';
      }, 3000);
      
      sendResponse({success: true});
      return true;
  }
});

// Додаємо можливість створення скріншота через клавіатурний ярлик
document.addEventListener('keydown', (event) => {
  // Ctrl + Shift + S для швидкого скріншота
  if (event.ctrlKey && event.shiftKey && event.key === 'S') {
      event.preventDefault();
      
      // Відправляємо повідомлення до background script
      chrome.runtime.sendMessage({
          action: 'quickScreenshot',
          pageInfo: {
              title: document.title,
              url: window.location.href
          }
      });
  }
});

console.log('Screenshot Sender content script loaded');