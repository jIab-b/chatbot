let API_KEY = null;
let chats = [];
let chatStore = {}; // {id: [{role, content}]}
let currentChat = null;

// -- API KEY HANDLING --
const overlay = document.getElementById("keyInputOverlay");
const app = document.getElementById("app");
document.getElementById("keyFileInput").addEventListener('change', function(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const content = e.target.result;
    const match = content.match(/OPENAI_API_KEY\s*=\s*"?([a-zA-Z0-9-_]+)"/i);
    if (!match) {
      document.getElementById("keyError").textContent = "Could not parse .key file.";
      return;
    }
    API_KEY = match[1];
    overlay.style.display = 'none';
    app.style.display = '';
    init();
  };
  reader.readAsText(file);
});

// -- CHAT LOGIC --
function saveChatsToStorage() {
  localStorage.setItem("cs-chat-chats", JSON.stringify(chats));
  localStorage.setItem("cs-chat-store", JSON.stringify(chatStore));
}
function loadChatsFromStorage() {
  try {
    chats = JSON.parse(localStorage.getItem("cs-chat-chats")) || [];
    chatStore = JSON.parse(localStorage.getItem("cs-chat-store")) || {};
  } catch (e) {
    chats = [];
    chatStore = {};
  }
}

function makeChatTitle(history) {
  for (const m of history) if (m.role === 'user') return m.content.slice(0, 20);
  return "Chat";
}
// Add a new chat
function newChat() {
  const id = Math.random().toString(36).slice(2,10);
  chats.push({id, title: "New Chat"});
  chatStore[id] = [];
  currentChat = id;
  saveChatsToStorage();
  renderChats();
  loadChat(id);
}
// Fork current chat
function forkChat() {
  if (!currentChat) return;
  const old = chatStore[currentChat] || [];
  const id = Math.random().toString(36).slice(2,10);
  chatStore[id] = old.map(m => ({...m})); // Deep copy messages
  chats.push({id, title: makeChatTitle(chatStore[id]) + " (fork)"});
  currentChat = id;
  saveChatsToStorage();
  renderChats();
  loadChat(id);
}
function renderChats() {
  const list = document.getElementById('chatList');
  list.innerHTML = '';
  for(const chat of chats) {
    const li = document.createElement('li');
    li.textContent = chat.title || "Untitled";
    li.className = chat.id === currentChat ? "active" : "";
    li.onclick = () => loadChat(chat.id);
    list.appendChild(li);
  }
}
function loadChat(id) {
  currentChat = id;
  renderChats();
  renderChatMessages();
  updateHeader(id);
}
function updateHeader(id) {
  document.getElementById('chatHeader').innerHTML = id ? `<span>Chat <span style="color:#adcdfe;">${id.slice(0,8)}</span></span>` : '';
}
function renderChatMessages() {
  const chatHistory = document.getElementById('chatHistory');
  chatHistory.innerHTML = '';
  const messages = chatStore[currentChat] || [];
  messages.forEach(msg => {
    const bubble = document.createElement('div');
    bubble.className = 'msg ' + msg.role;
    bubble.innerHTML = `<div class="bubble">${msg.content.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g,'<br>')}</div>`;
    chatHistory.appendChild(bubble);
  });
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

document.getElementById('newChatBtn').onclick = newChat;
document.getElementById('forkBtn').onclick = forkChat;

document.getElementById('messageForm').onsubmit = async (e) => {
  e.preventDefault();
  const inp = document.getElementById('messageInput');
  const val = inp.value.trim();
  if(!val || !currentChat) return;
  chatStore[currentChat].push({role:"user", content:val});
  renderChatMessages();
  inp.value = '';
  // "typing..." placeholder
  chatStore[currentChat].push({role:"assistant", content:"..."});
  renderChatMessages();
  saveChatsToStorage();
  // -- AI API CALL --
  const reply = await fetchChatCompletion(chatStore[currentChat].slice(0,-1)); // don't send the '...' as context
  chatStore[currentChat][chatStore[currentChat].length-1].content = reply;
  // Update chat title on first user message
  if(chatStore[currentChat].length==2) {
    chats.find(c => c.id === currentChat).title = val.slice(0,20);
  }
  renderChats();
  renderChatMessages();
  saveChatsToStorage();
};

async function fetchChatCompletion(messages) {
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages
      })
    });
    const data = await resp.json();
    if(data?.choices?.[0]?.message?.content) return data.choices[0].message.content;
    if(data?.error) return `[API error: ${data.error.message}]`;
    return "[No response]";
  } catch(e) {
    return "[Error: "+e+"]";
  }
}
// --- INIT ---
function init() {
  loadChatsFromStorage();
  renderChats();
  if(chats.length) loadChat(chats[0].id);
  else newChat();
}