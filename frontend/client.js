// client.js
(() => {
  const wsUrl = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? `ws://${location.hostname}:8080`
    : (location.protocol === 'https:' ? `wss://${location.host}` : `ws://${location.host}`);

  let ws;
  let clientId;
  let joinedRoom = null;
  let username = null;
  let typingTimeout = null;
  const TYPING_DEBOUNCE = 800;
  const notificationSound = new Audio('notification.mp3');

  // DOM
  const joinBtn = document.getElementById('joinBtn');
  const usernameInput = document.getElementById('username');
  const roomInput = document.getElementById('room');
  const roomInfo = document.getElementById('roomInfo');
  const roomNameEl = document.getElementById('roomName');
  const usersList = document.getElementById('usersList');
  const messagesEl = document.getElementById('messages');
  const sendBtn = document.getElementById('sendBtn');
  const messageInput = document.getElementById('messageInput');
  const chatTitle = document.getElementById('chatTitle');
  const typingIndicator = document.getElementById('typingIndicator');

  function connect() {
    ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => {
      console.log('Connected to server');
      chatTitle.textContent = 'Connected — join a room';
    });

    ws.addEventListener('message', (ev) => {
      let data;
      try { data = JSON.parse(ev.data); } catch (e) { return; }

      switch (data.type) {
        case 'connected':
          clientId = data.clientId;
          break;

        case 'history':
          // render history
          joinedRoom = data.room;
          roomNameEl.textContent = joinedRoom;
          roomInfo.hidden = false;
          messagesEl.innerHTML = '';
          data.history.forEach(m => renderMessage(m));
          scrollToBottom();
          chatTitle.textContent = `Room: ${joinedRoom}`;
          break;

        case 'message':
          // Play sound only for messages from others
          if (data.username !== usernameInput.value) {
            playNotificationSound();
          }
          renderMessage(data.message);
          scrollToBottom();
          break;

        case 'user-joined':
          playNotificationSound();
          showSmallNotification(`${data.username} joined`);
          break;

        case 'user-left':
          showSmallNotification(`${data.username || 'Someone'} left`);
          break;

        case 'users':
          renderUsers(data.users);
          break;

        case 'typing':
          showTypingIndicator(data);
          break;

        default:
          break;
      }
    });

    ws.addEventListener('close', () => {
      showSmallNotification('Disconnected from server');
      chatTitle.textContent = 'Disconnected';
      typingIndicator.textContent = '';
    });

    ws.addEventListener('error', () => {
      showSmallNotification('Connection error');
    });
  }

  // UI helpers
  function renderUsers(users) {
    usersList.innerHTML = '';
    users.forEach(u => {
      const li = document.createElement('li');
      li.textContent = u.username + (u.clientId === clientId ? ' (you)' : '');
      usersList.appendChild(li);
    });
  }

  function renderMessage(m) {
    const isSelf = m.clientId === clientId;
    const div = document.createElement('div');
    div.className = 'msg ' + (isSelf ? 'out' : 'in');

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<strong>${escapeHtml(m.username)}</strong> · <span>${new Date(m.ts).toLocaleTimeString()}</span>`;

    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = m.text;

    div.appendChild(meta);
    div.appendChild(text);
    messagesEl.appendChild(div);
  }

  function showSmallNotification(txt) {
    const el = document.createElement('div');
    el.className = 'small';
    el.textContent = txt;
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight + 200;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"'`]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;' }[c]));
  }

  function showTypingIndicator(data) {
    // If someone else typing, show it briefly
    if (data.clientId === clientId) return;
    typingIndicator.textContent = data.isTyping ? `${data.username} is typing…` : '';
    if (data.isTyping) {
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => typingIndicator.textContent = '', 1200);
    }
  }

  function playNotificationSound() {
    // Reset the sound to the beginning
    notificationSound.currentTime = 0;
    // Play the sound and handle any errors
    notificationSound.play().catch(err => {
        console.log('Error playing notification:', err);
    });
  }

 joinBtn.addEventListener('click', () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) connect();

  username = (usernameInput.value || '').trim() || ('User' + Math.floor(Math.random()*900+100));
  const room = (roomInput.value || '').trim() || 'main';
  if (!ws) return;

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'join', username, room }));
  }, { once: true });

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'join', username, room }));
  }

  joinedRoom = room;
  roomNameEl.textContent = joinedRoom;
  roomInfo.hidden = false;
  chatTitle.textContent = `Room: ${joinedRoom}`;

  messageInput.disabled = false;
  sendBtn.disabled = false;
  messageInput.focus();
});

  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
      return;
    }
    // emit typing
    if (ws && ws.readyState === WebSocket.OPEN && joinedRoom) {
      ws.send(JSON.stringify({ type: 'typing', isTyping: true }));
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'typing', isTyping: false }));
      }, TYPING_DEBOUNCE);
    }
  });

  function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      showSmallNotification('Not connected to server.');
      return;
    }
    ws.send(JSON.stringify({ type: 'message', text }));
    messageInput.value = '';
    // tell others we stopped typing
    ws.send(JSON.stringify({ type: 'typing', isTyping: false }));
  }

  // Ensure we connect right away (optional)
  connect();

})();
