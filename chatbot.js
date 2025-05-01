// WARNING: Never commit or deploy production API keys client-side

// Chat tree structure
let chatsById = {};
let rootChatId = null;
let currentChatId = null;

// ---- Chat Tree Functions ----

function saveToStorage() {
  localStorage.setItem('chatsById', JSON.stringify(chatsById));
  localStorage.setItem('rootChatId', rootChatId || '');
}

function loadFromStorage() {
  try {
    chatsById = JSON.parse(localStorage.getItem('chatsById')) || {};
    rootChatId = localStorage.getItem('rootChatId') || null;
  } catch (e) {
    chatsById = {};
    rootChatId = null;
  }
}

function newChat(parentId = null) {
  const id = Math.random().toString(36).slice(2,10);
  const chat = {
    id,
    title: "New Chat",
    parentId,
    forks: [],
    messages: [],
  };
  chatsById[id] = chat;
  if (parentId) {
    chatsById[parentId].forks.push(id);
  } else {
    rootChatId = id;
  }
  currentChatId = id;
  saveToStorage();
  renderSidebar();
  loadChat(id);
}

function forkChat() {
  if (!currentChatId) return;
  const parent = chatsById[currentChatId];
  const id = Math.random().toString(36).slice(2,10);
  const chat = {
    id,
    title: parent.title + " (fork)",
    parentId: currentChatId,
    forks: [],
    messages: parent.messages.map(m => ({...m}))
  };
  chatsById[id] = chat;
  chatsById[currentChatId].forks.push(id);
  currentChatId = id;
  saveToStorage();
  renderSidebar();
  loadChat(id);
}

function mergeForkToParent(forkId) {
  const fork = chatsById[forkId];
  if (!fork || !fork.parentId) return;
  const parent = chatsById[fork.parentId];
  if (!parent) return;

  // Merge messages uniquely
  const merged = [];
  let pm = parent.messages, fm = fork.messages;
  merged.push(...pm);
  for (const m of fm) {
    if (!pm.some(mm => mm.role === m.role && mm.content === m.content))
      merged.push(m);
  }
  parent.messages = merged;
  parent.title = parent.title.replace(/ \(merged\)$/,'')+" (merged)";

  // Move any forks of the fork into the parent
  for (const childId of fork.forks) {
    chatsById[parent.id].forks.push(childId);
    chatsById[childId].parentId = parent.id;
  }
  parent.forks = parent.forks.filter(fid => fid !== forkId);
  delete chatsById[forkId];
  if(currentChatId === forkId) currentChatId = parent.id;
  saveToStorage();
  renderSidebar();
  loadChat(currentChatId);
}

function renderSidebar() {
  const list = document.getElementById('chatList');
  list.innerHTML = '';
  function renderTree(id, depth=0) {
    const chat = chatsById[id];
    const li = document.createElement('li');
    li.style.paddingLeft = `${12 + 25*depth}px`;
    li.textContent = chat.title || "Untitled";
    li.className = (id === currentChatId ? "active" : "");
    li.onclick = () => loadChat(id);
    list.appendChild(li);

    // If not root and is a fork, show merge button
    if (chat.parentId) {
      const mergeBtn = document.createElement('button');
      mergeBtn.textContent = "Merge";
      mergeBtn.className = "merge-btn";
      mergeBtn.title = "Merge this fork with its parent";
      mergeBtn.onclick = (ev) => { ev.stopPropagation(); mergeForkToParent(id); };
      li.appendChild(mergeBtn);
    }

    for (const childId of chat.forks) {
      renderTree(childId, depth+1);
    }
  }
  if (rootChatId) renderTree(rootChatId);
}
function loadChat(id) {
  currentChatId = id;
  renderSidebar();
  renderChatMessages();
  updateHeader(id);
}
function updateHeader(id) {
  document.getElementById('chatHeader').innerHTML = id
    ? `<span>Chat <span style="color: #adcdfe;">${id.slice(0,8)}</span></span>` : '';
}
function renderChatMessages() {
  const chatHistory = document.getElementById('chatHistory');
  chatHistory.innerHTML = '';
  const messages = chatsById[currentChatId]?.messages || [];
  messages.forEach(msg => {
    const bubble = document.createElement('div');
    bubble.className = 'msg ' + msg.role;
    bubble.innerHTML = `<div class="bubble">${msg.content.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g,'<br>')}</div>`;
    chatHistory.appendChild(bubble);
  });
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

document.getElementById('newChatBtn').onclick = () => newChat(null);
document.getElementById('forkBtn').onclick = forkChat;

document.getElementById('messageForm').onsubmit = async (e) => {
  e.preventDefault();
  const inp = document.getElementById('messageInput');
  const val = inp.value.trim();
  if(!val || !currentChatId) return;
  chatsById[currentChatId].messages.push({role:"user", content:val});
  renderChatMessages();
  inp.value = '';
  chatsById[currentChatId].messages.push({role:"assistant", content:"..."});
  renderChatMessages();
  saveToStorage();

  const reply = await fetchChatCompletion(chatsById[currentChatId].messages.slice(0,-1));
  chatsById[currentChatId].messages[chatsById[currentChatId].messages.length-1].content = reply;
  if(chatsById[currentChatId].messages.length<=2) {
    chatsById[currentChatId].title = val.slice(0,24);
  }
  saveToStorage();
  renderSidebar();
  renderChatMessages();
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

// ---- INIT ----
function init() {
  loadFromStorage();
  if(!rootChatId) newChat(null);
  renderSidebar();
  if(currentChatId) loadChat(currentChatId);
}
init();
