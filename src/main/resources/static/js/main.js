'use strict';

// DOM Elements
const usernamePage = document.querySelector('#username-page');
const chatPage = document.querySelector('#chat-page');
const usernameForm = document.querySelector('#usernameForm');
const messageForm = document.querySelector('#messageForm');
const messageInput = document.querySelector('#message');
const messageArea = document.querySelector('#messageArea');
const connectingElement = document.querySelector('.connecting');
const userCountElement = document.querySelector('#user-count');
const typingIndicator = document.querySelector('#typing-indicator');
const closeBtn = document.querySelector('#close-btn'); // Disconnect button

// WebSocket and chat state
let stompClient = null;
let username = null;
let userCount = 0;
let isConnected = false;

// Typing state
let typingTimer = null;
const currentlyTyping = new Set();

// Avatar colors
const colors = ['#00ff41', '#00ffff', '#ff0080', '#ff4081', '#ffff00', '#ff6600', '#8000ff', '#00ff80', '#ff0040', '#40ff00', '#0080ff', '#ff8000'];

function init() {
    usernameForm.addEventListener('submit', connect, true);
    messageForm.addEventListener('submit', sendMessage, true);
    messageInput.addEventListener('input', handleTyping);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(e);
        }
    });
    closeBtn.addEventListener('click', disconnectAndReset);
    initializeCyberEffects();
    document.querySelector('#name')?.focus();
}

function connect(event) {
    username = document.querySelector('#name').value.trim();
    if (!username) return event.preventDefault();

    const connectButton = document.querySelector('.username-submit');
    if (connectButton) {
        connectButton.textContent = 'CONNECTING...';
        connectButton.disabled = true;
    }

    setTimeout(() => {
        usernamePage.classList.add('hidden');
        chatPage.classList.remove('hidden');

        const socket = new SockJS('/ws');
        stompClient = Stomp.over(socket);
        stompClient.connect({}, onConnected, onError);

        // Handle duplicate usernames
        stompClient.subscribe('/user/queue/errors', (message) => {
            if (message.body === 'DUPLICATE_USERNAME') {
                alert('Username already taken. Try a different handle.');
                disconnectAndReset();
            }
        });
    }, 1000);

    event.preventDefault();
}

function onConnected() {
    isConnected = true;

    stompClient.subscribe('/topic/public', onMessageReceived);
    stompClient.subscribe('/topic/users', onUserListReceived);
    stompClient.subscribe('/topic/typing', onTypingReceived);
    stompClient.subscribe('/topic/pong', onPongReceived);

    stompClient.send("/app/chat.addUser", {}, JSON.stringify({ sender: username, type: 'JOIN' }));

    connectingElement.classList.add('hidden');
    displaySystemMessage('Connected to CYBERNET MAINFRAME');
    displaySystemMessage(`Welcome to the secure channel, ${username}`);

    setInterval(measureLatency, 5000); // Ping every 5s
    messageInput.focus();
}

function onError(error) {
    isConnected = false;
    connectingElement.innerHTML = `
        <div class="connecting-animation">
            <div class="loading-dots"><span></span><span></span><span></span></div>
        </div>
        <p style="color: #ff0040;">CONNECTION FAILED - Network unreachable</p>
        <button id="reconnect-btn" class="cyber-button primary" style="margin-top: 15px;">
            <span class="button-text">RETRY CONNECTION</span>
            <div class="button-glow"></div>
        </button>`;
    document.getElementById('reconnect-btn').addEventListener('click', () => location.reload());
}

// --------------------- Typing Indicator ----------------------
function handleTyping() {
    if (!isConnected || !stompClient) return;

    clearTimeout(typingTimer);
    stompClient.send("/app/chat.typing", {}, JSON.stringify({ sender: username, type: 'TYPING' }));

    typingTimer = setTimeout(() => {
        stompClient.send("/app/chat.stopTyping", {}, JSON.stringify({ sender: username, type: 'STOP_TYPING' }));
    }, 2000);
}

function onTypingReceived(payload) {
    const message = JSON.parse(payload.body);
    if (message.sender === username) return;

    message.type === 'TYPING'
        ? currentlyTyping.add(message.sender)
        : currentlyTyping.delete(message.sender);

    updateTypingIndicator();
}

function updateTypingIndicator() {
    if (!typingIndicator) return;
    const users = Array.from(currentlyTyping);

    if (users.length === 0) {
        typingIndicator.style.display = 'none';
        typingIndicator.textContent = '';
    } else {
        const nameList = users.join(', ');
        typingIndicator.innerHTML = `${nameList} ${users.length === 1 ? 'is' : 'are'} typing <span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>`;
        typingIndicator.style.display = 'block';
    }
}

// --------------------- Message Logic -------------------------
function sendMessage(event) {
    const messageContent = messageInput.value.trim();
    if (messageContent && stompClient && isConnected) {
        const chatMessage = {
            sender: username,
            content: messageContent,
            type: 'CHAT',
            timestamp: Date.now()
        };
        stompClient.send("/app/chat.sendMessage", {}, JSON.stringify(chatMessage));
        messageInput.value = '';
    }

    const sendButton = document.querySelector('.send-button');
    if (sendButton) {
        sendButton.style.transform = 'scale(0.95)';
        setTimeout(() => sendButton.style.transform = 'scale(1)', 150);
    }

    event.preventDefault();
}

function onMessageReceived(payload) {
    const message = JSON.parse(payload.body);
    const messageElement = document.createElement('li');

    switch (message.type) {
        case 'JOIN':
            messageElement.classList.add('event-message');
            messageElement.innerHTML = `<p>[SYSTEM] ${message.sender} has joined</p>`;
            break;

        case 'LEAVE':
            messageElement.classList.add('event-message');
            messageElement.innerHTML = `<p>[SYSTEM] ${message.sender} has left</p>`;
            break;

        case 'CHAT':
            messageElement.classList.add('chat-message');

            const avatar = document.createElement('i');
            avatar.textContent = message.sender[0].toUpperCase();
            avatar.style.backgroundColor = getAvatarColor(message.sender);

            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';

            const usernameSpan = document.createElement('span');
            usernameSpan.textContent = message.sender;

            const textPara = document.createElement('p');
            textPara.textContent = message.content;

            if (message.timestamp) {
                const timestamp = document.createElement('small');
                timestamp.style.color = 'rgba(0,255,65,0.5)';
                timestamp.style.fontSize = '11px';
                timestamp.style.marginLeft = '10px';
                timestamp.textContent = formatTimestamp(message.timestamp);
                timestamp.title = new Date(message.timestamp).toLocaleString();
                usernameSpan.appendChild(timestamp);
            }

            contentDiv.appendChild(usernameSpan);
            contentDiv.appendChild(textPara);
            messageElement.appendChild(avatar);
            messageElement.appendChild(contentDiv);

            if (document.hidden) {
                document.title = `[NEW] ${message.sender}: ${message.content.slice(0, 15)}...`;
                setTimeout(() => {
                    document.title = 'CyberNet Terminal - Secure Communication Hub';
                }, 4000);
            }
            break;

        case 'USER_COUNT':
            userCount = message.count;
            updateUserCount();
            return;
    }

    messageArea.appendChild(messageElement);
    messageArea.scrollTop = messageArea.scrollHeight;

    messageElement.style.opacity = '0';
    messageElement.style.transform = 'translateX(-20px)';
    setTimeout(() => {
        messageElement.style.transition = 'all 0.3s ease';
        messageElement.style.opacity = '1';
        messageElement.style.transform = 'translateX(0)';
    }, 50);
}

function onUserListReceived(payload) {
    const users = JSON.parse(payload.body);
    const userList = document.getElementById('online-users');
    userList.innerHTML = '';
    users.forEach(name => {
        const li = document.createElement('li');
        li.textContent = name;
        li.style.color = '#00ff80';
        li.style.padding = '5px 10px';
        li.style.borderBottom = '1px solid rgba(0,255,65,0.1)';
        userList.appendChild(li);
    });
}

// ------------------- Latency Measurement --------------------
let pingStart = null;
function measureLatency() {
    if (!stompClient || !isConnected) return;
    pingStart = Date.now();
    stompClient.send('/app/ping', {}, {});
}

function onPongReceived() {
    const latency = Date.now() - pingStart;
    const latencyElement = document.getElementById('latency');
    if (latencyElement) latencyElement.textContent = `${latency}ms`;
}

// ------------------- Utility & UX --------------------------
function displaySystemMessage(msg) {
    const el = document.createElement('li');
    el.classList.add('event-message');
    el.innerHTML = `<p>[SYSTEM] ${msg}</p>`;
    messageArea.appendChild(el);
    messageArea.scrollTop = messageArea.scrollHeight;
}

function updateUserCount() {
    userCountElement.textContent = userCount;
    userCountElement.style.transform = 'scale(1.2)';
    userCountElement.style.color = '#00ffff';
    setTimeout(() => {
        userCountElement.style.transform = 'scale(1)';
        userCountElement.style.color = '#00ff41';
    }, 200);
    userCountElement.style.textShadow = userCount > 1
        ? '0 0 10px rgba(0,255,65,0.8)'
        : 'none';
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getAvatarColor(sender) {
    let hash = 0;
    for (let i = 0; i < sender.length; i++) {
        hash = 31 * hash + sender.charCodeAt(i);
    }
    return colors[Math.abs(hash % colors.length)];
}

// ---------------------- Disconnect Logic ---------------------
function disconnectAndReset() {
    if (isConnected && stompClient) {
        try {
            stompClient.send("/app/chat.leave", {}, JSON.stringify({
                sender: username,
                type: 'LEAVE'
            }));
            stompClient.disconnect();
        } catch (e) {
            console.error('Disconnect error:', e);
        }
    }

    isConnected = false;
    username = null;
    chatPage.classList.add('hidden');
    usernamePage.classList.remove('hidden');
    messageArea.innerHTML = '';
    document.getElementById('online-users').innerHTML = '';
    document.getElementById('name').value = '';
    document.getElementById('name').focus();
    currentlyTyping.clear();
    updateTypingIndicator();

    const connectButton = document.querySelector('.cyber-button.primary');
    if (connectButton) {
        connectButton.textContent = 'CONNECT TO NETWORK';
        connectButton.disabled = false;
    }
}

// ------------------ Cyber Matrix Effects ---------------------
function initializeCyberEffects() {
    setInterval(() => {
        const title = document.querySelector('.title');
        if (title && Math.random() < 0.1) {
            title.style.textShadow = '0 0 20px rgba(255,0,0,0.8)';
            setTimeout(() => {
                title.style.textShadow = '0 0 20px rgba(0,255,65,0.5)';
            }, 100);
        }
    }, 2000);
    createMatrixEffect();
}

function createMatrixEffect() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        opacity: 0.1;
        z-index: -1;
    `;
    document.body.appendChild(canvas);

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const matrix = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789@#$%^&*()";
    const fontSize = 10;
    const columns = canvas.width / fontSize;
    const drops = Array(Math.floor(columns)).fill(1);

    function drawMatrix() {
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0f0';
        ctx.font = fontSize + 'px monospace';

        drops.forEach((y, x) => {
            const text = matrix[Math.floor(Math.random() * matrix.length)];
            ctx.fillText(text, x * fontSize, y * fontSize);
            drops[x] = (y * fontSize > canvas.height && Math.random() > 0.975) ? 0 : y + 1;
        });
    }

    setInterval(drawMatrix, 35);
}

// -------------------- Listeners --------------------
window.addEventListener('resize', () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
});

document.addEventListener('DOMContentLoaded', init);
