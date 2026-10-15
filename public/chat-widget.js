(function() {
  const API_BASE = window.location.origin.includes('localhost') 
    ? 'http://localhost:8080/api' 
    : 'https://guidetrack-api.onrender.com/api';

  let isOpen = false;
  let history = [];
  let isTyping = false;

  function createStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .chat-toggle {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: linear-gradient(140deg, #7f1d1d, #5a1212);
        border: none;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(127, 29, 29, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .chat-toggle:hover {
        transform: scale(1.05);
        box-shadow: 0 12px 32px rgba(127, 29, 29, 0.5);
      }
      .chat-toggle svg {
        width: 28px;
        height: 28px;
        color: #facc15;
      }
      .chat-toggle .close-icon { display: none; }
      .chat-toggle.open .chat-icon { display: none; }
      .chat-toggle.open .close-icon { display: block; }

      .chat-window {
        position: fixed;
        bottom: 100px;
        right: 24px;
        width: 380px;
        max-height: 520px;
        background: #fffdf9;
        border: 1px solid #e9ddd2;
        border-top: 4px solid #7f1d1d;
        border-radius: 16px;
        box-shadow: 0 16px 48px rgba(61, 11, 11, 0.2);
        display: none;
        flex-direction: column;
        overflow: hidden;
        z-index: 9998;
        animation: slideUp 0.25s ease-out;
      }
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .chat-window.open { display: flex; }

      .chat-header {
        padding: 16px 20px;
        background: linear-gradient(120deg, #7f1d1d, #5a1212);
        color: #fff;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .chat-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #facc15;
        color: #7f1d1d;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 1rem;
      }
      .chat-title { flex: 1; }
      .chat-title h4 { margin: 0; font-size: 1rem; font-weight: 700; }
      .chat-title p { margin: 0; font-size: 0.75rem; opacity: 0.8; }
      .chat-close {
        background: none;
        border: none;
        color: #fff;
        cursor: pointer;
        padding: 4px;
        border-radius: 8px;
        transition: background 0.2s;
      }
      .chat-close:hover { background: rgba(255,255,255,0.15); }

      .chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .msg {
        max-width: 85%;
        padding: 12px 16px;
        border-radius: 16px;
        font-size: 0.9rem;
        line-height: 1.5;
        animation: fadeIn 0.2s ease-out;
      }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      .msg.user {
        align-self: flex-end;
        background: linear-gradient(140deg, #7f1d1d, #5a1212);
        color: #fff;
        border-bottom-right-radius: 4px;
      }
      .msg.assistant {
        align-self: flex-start;
        background: #f3e9df;
        color: #241a12;
        border-bottom-left-radius: 4px;
        box-shadow: 0 2px 8px rgba(61, 11, 11, 0.08);
      }
      .msg.typing { background: #fdf6cf; color: #854d0e; }
      .typing-dots { display: flex; gap: 4px; }
      .typing-dots span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #8a7a6b;
        animation: bounce 1.4s infinite ease-in-out;
      }
      .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
      .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }

      .chat-input-area {
        padding: 16px;
        border-top: 1px solid #e9ddd2;
        background: #faf6f1;
      }
      .chat-input-wrapper {
        display: flex;
        gap: 8px;
      }
      .chat-input {
        flex: 1;
        padding: 12px 16px;
        border: 1.5px solid #d9cbbd;
        border-radius: 24px;
        font-size: 0.9rem;
        font-family: inherit;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .chat-input:focus {
        border-color: #7f1d1d;
        box-shadow: 0 0 0 4px rgba(127, 29, 29, 0.12);
      }
      .chat-send {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: linear-gradient(140deg, #7f1d1d, #5a1212);
        border: none;
        color: #fff;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .chat-send:hover:not(:disabled) {
        transform: scale(1.05);
        box-shadow: 0 4px 12px rgba(127, 29, 29, 0.3);
      }
      .chat-send:disabled { opacity: 0.5; cursor: not-allowed; }
      .chat-send svg { width: 20px; height: 20px; }

      @media (max-width: 480px) {
        .chat-window { width: calc(100vw - 32px); right: 16px; bottom: 90px; max-height: 60vh; }
        .chat-toggle { bottom: 16px; right: 16px; }
      }
    `;
    document.head.appendChild(style);
  }

  function createToggle() {
    const btn = document.createElement('button');
    btn.className = 'chat-toggle';
    btn.setAttribute('aria-label', 'Open chat');
    btn.innerHTML = `
      <svg class="chat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <svg class="close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    btn.addEventListener('click', toggleChat);
    return btn;
  }

  function createWindow() {
    const div = document.createElement('div');
    div.className = 'chat-window';
    div.innerHTML = `
      <div class="chat-header">
        <div class="chat-avatar">GT</div>
        <div class="chat-title">
          <h4>GuideTrack Assistant</h4>
          <p>How can I help you today?</p>
        </div>
        <button class="chat-close" aria-label="Close chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
      </div>
      <div class="chat-messages"></div>
      <div class="chat-input-area">
        <div class="chat-input-wrapper">
          <input type="text" class="chat-input" placeholder="Ask me anything..." aria-label="Type your message">
          <button class="chat-send" aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    `;
    return div;
  }

  function toggleChat() {
    isOpen = !isOpen;
    toggleBtn.classList.toggle('open', isOpen);
    chatWindow.classList.toggle('open', isOpen);
    if (isOpen) {
      input.focus();
      if (messagesEl.children.length === 0) {
        addWelcomeMessage();
      }
    }
  }

  function addWelcomeMessage() {
    const div = document.createElement('div');
    div.className = 'msg assistant';
    div.textContent = 'Hello! I\'m GuideTrack Assistant. How can I help you today? You can ask me about booking appointments, reporting concerns, or anything about the guidance system.';
    messagesEl.appendChild(div);
  }

  function addMessage(role, content) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.textContent = content;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function showTyping() {
    isTyping = true;
    const div = document.createElement('div');
    div.className = 'msg assistant typing';
    div.id = 'typing-indicator';
    div.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideTyping() {
    isTyping = false;
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.remove();
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || isTyping) return;

    addMessage('user', text);
    history.push({ role: 'user', content: text });
    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;
    showTyping();

    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ message: text, history })
      });

      if (!res.ok) throw new Error('Failed');

      const data = await res.json();
      hideTyping();
      addMessage('assistant', data.reply);
      history.push({ role: 'assistant', content: data.reply });
      if (history.length > 20) history = history.slice(-20);

    } catch (e) {
      hideTyping();
      addMessage('assistant', 'Sorry, something went wrong. Please try again.');
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  function getToken() {
    try {
      const session = sessionStorage.getItem('chatToken');
      return session;
    } catch { return null; }
  }

  function init() {
    createStyles();
    toggleBtn = createToggle();
    chatWindow = createWindow();

    document.body.appendChild(toggleBtn);
    document.body.appendChild(chatWindow);

    messagesEl = chatWindow.querySelector('.chat-messages');
    input = chatWindow.querySelector('.chat-input');
    sendBtn = chatWindow.querySelector('.chat-send');
    closeBtn = chatWindow.querySelector('.chat-close');

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
    closeBtn.addEventListener('click', () => { isOpen = false; toggleChat(); });

    document.addEventListener('click', (e) => {
      if (isOpen && !chatWindow.contains(e.target) && !toggleBtn.contains(e.target)) {
        isOpen = false;
        toggleChat();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();