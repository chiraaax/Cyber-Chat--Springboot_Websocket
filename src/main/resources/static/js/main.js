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
const closeBtn = document.querySelector('#close-btn'); // Close button

// WebSocket and Chat Variables
let stompClient = null;
let username = null;
let userCount = 0;
let isConnected = false;

// Typing state
let typingTimer = null;
const currentlyTyping = new Set();

// Colors
const colors = [
    '#00ff41', '#00ffff', '#ff0080', '#ff4081',
    '#ffff00', '#ff6600', '#8000ff', '#00ff80',
    '#ff0040', '#40ff00', '#0080ff', '#ff8000'
];

// Initialize app
function init() {
    usernameForm.addEventListener('submit', connect, true);
    messageForm.addEventListener('submit', sendMessage, true);
    messageInput.addEventListener('input', handleTyping);
    messageInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(e);
        }
    });
    initializeCyberEffects();
    document.querySelector('#name')?.focus();

    // Add event listener for close button
    closeBtn.addEventListener('click', disconnectAndReset);
}

function connect(event) {
    username = document.querySelector('#name').value.trim();
    if (username) {
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
        }, 1000);
    }
    event.preventDefault();
}

function onConnected() {
    isConnected = true;

    stompClient.subscribe('/topic/public', onMessageReceived);
    stompClient.subscribe('/topic/users', onUserListReceived);
    stompClient.subscribe('/topic/typing', onTypingReceived);

    stompClient.send("/app/chat.addUser", {}, JSON.stringify({
        sender: username,
        type: 'JOIN'
    }));

    connectingElement.classList.add('hidden');
    displaySystemMessage('Connected to CYBERNET MAINFRAME');
    displaySystemMessage('Welcome to the secure channel, ' + username);
    messageInput.focus();
}

function onError(error) {
    isConnected = false;
    connectingElement.innerHTML =
        `<div class="connecting-animation">
            <div class="loading-dots"><span></span><span></span><span></span></div>
        </div>
        <p style="color: #ff0040;">CONNECTION FAILED - Network unreachable</p>
        <button id="reconnect-btn" class="cyber-button primary" style="margin-top: 15px;">
            <span class="button-text">RETRY CONNECTION</span>
            <div class="button-glow"></div>
        </button>`;

    document.getElementById('reconnect-btn').addEventListener('click', () => {
        location.reload();
    });
}

// Handle typing
function handleTyping() {
    if (isConnected && stompClient) {
        clearTimeout(typingTimer);

        try {
            stompClient.send("/app/chat.typing", {}, JSON.stringify({
                sender: username,
                type: 'TYPING'
            }));
        } catch (e) {}

        typingTimer = setTimeout(() => {
            try {
                stompClient.send("/app/chat.stopTyping", {}, JSON.stringify({
                    sender: username,
                    type: 'STOP_TYPING'
                }));
            } catch (e) {}
        }, 2000);
    }
}

// Receive typing indicators
function onTypingReceived(payload) {
    let message;
    try {
        message = JSON.parse(payload.body);
    } catch (e) {
        console.error('Invalid typing message:', e);
        return;
    }

    if (message.sender === username) return;

    if (message.type === 'TYPING') {
        currentlyTyping.add(message.sender);
    } else if (message.type === 'STOP_TYPING') {
        currentlyTyping.delete(message.sender);
    }

    updateTypingIndicator();
}

function updateTypingIndicator() {
    if (!typingIndicator) return;
    const users = Array.from(currentlyTyping);

    if (users.length === 0) {
        typingIndicator.style.display = 'none';
        typingIndicator.textContent = '';
    } else {
        const isSingle = users.length === 1;
        const nameList = users.join(', ');
        typingIndicator.innerHTML =
            `${nameList} ${isSingle ? 'is' : 'are'} typing
            <span class="typing-dots">
                <span>.</span><span>.</span><span>.</span>
            </span>`;
        typingIndicator.style.display = 'block';
    }
}

// Send message
function sendMessage(event) {
    const messageContent = messageInput.value.trim();
    if (messageContent && stompClient && isConnected) {
        const chatMessage = {
            sender: username,
            content: messageContent,
            type: 'CHAT',
            timestamp: new Date().getTime()
        };
        stompClient.send("/app/chat.sendMessage", {}, JSON.stringify(chatMessage));
        messageInput.value = '';

        const sendButton = document.querySelector('.send-button');
        if (sendButton) {
            sendButton.style.transform = 'scale(0.95)';
            setTimeout(() => sendButton.style.transform = 'scale(1)', 150);
        }
    }
    event.preventDefault();
}

// Handle all messages
function onMessageReceived(payload) {
    let message;
    try {
        message = JSON.parse(payload.body);
    } catch (e) {
        console.error('Error parsing message:', e);
        return;
    }

    const messageElement = document.createElement('li');

    if (message.type === 'JOIN') {
        messageElement.classList.add('event-message');
        messageElement.innerHTML = `<p>[SYSTEM] User ${message.sender} has joined the network</p>`;
    }
    else if (message.type === 'LEAVE') {
        messageElement.classList.add('event-message');
        messageElement.innerHTML = `<p>[SYSTEM] User ${message.sender} has disconnected</p>`;
    }
    else if (message.type === 'CHAT') {
        messageElement.classList.add('chat-message');
        const avatarElement = document.createElement('i');
        avatarElement.textContent = message.sender[0].toUpperCase();
        avatarElement.style.backgroundColor = getAvatarColor(message.sender);

        const messageContentDiv = document.createElement('div');
        messageContentDiv.className = 'message-content';

        const usernameElement = document.createElement('span');
        usernameElement.textContent = message.sender;

        const messageText = document.createElement('p');
        messageText.textContent = message.content;

        if (message.timestamp) {
            const timestamp = document.createElement('small');
            timestamp.style.color = 'rgba(0, 255, 65, 0.5)';
            timestamp.style.fontSize = '11px';
            timestamp.style.marginLeft = '10px';
            timestamp.textContent = formatTimestamp(message.timestamp);
            usernameElement.appendChild(timestamp);
        }

        messageContentDiv.appendChild(usernameElement);
        messageContentDiv.appendChild(messageText);
        messageElement.appendChild(avatarElement);
        messageElement.appendChild(messageContentDiv);
    }
    else if (message.type === 'USER_COUNT') {
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

// Handle online user list
function onUserListReceived(payload) {
    let users;
    try {
        users = JSON.parse(payload.body);
    } catch (e) {
        console.error('Invalid user list:', e);
        return;
    }

    const userListElement = document.getElementById('online-users');
    userListElement.innerHTML = '';
    users.forEach(name => {
        const li = document.createElement('li');
        li.textContent = name;
        li.style.padding = '5px 10px';
        li.style.borderBottom = '1px solid rgba(0,255,65,0.1)';
        li.style.color = '#00ff80';
        userListElement.appendChild(li);
    });
}

function displaySystemMessage(content) {
    const messageElement = document.createElement('li');
    messageElement.classList.add('event-message');
    messageElement.innerHTML = `<p>[SYSTEM] ${content}</p>`;
    messageArea.appendChild(messageElement);
    messageArea.scrollTop = messageArea.scrollHeight;
}

function updateUserCount() {
    if (userCountElement) {
        userCountElement.textContent = userCount;
        userCountElement.style.transform = 'scale(1.2)';
        userCountElement.style.color = '#00ffff';
        setTimeout(() => {
            userCountElement.style.transform = 'scale(1)';
            userCountElement.style.color = '#00ff41';
        }, 200);
        userCountElement.style.textShadow = userCount > 1
            ? '0 0 10px rgba(0, 255, 65, 0.8)'
            : 'none';
    }
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getAvatarColor(sender) {
    let hash = 0;
    for (let i = 0; i < sender.length; i++) {
        hash = 31 * hash + sender.charCodeAt(i);
    }
    const index = Math.abs(hash % colors.length);
    return colors[index];
}

// Disconnect and reset function
function disconnectAndReset() {
    if (isConnected && stompClient) {
        try {
            // Send leave notification
            stompClient.send("/app/chat.leave", {}, JSON.stringify({
                sender: username,
                type: 'LEAVE'
            }));

            // Disconnect from server
            stompClient.disconnect();
        } catch (e) {
            console.log('Disconnect error', e);
        }
    }

    isConnected = false;
    username = null;

    // Reset UI
    chatPage.classList.add('hidden');
    usernamePage.classList.remove('hidden');
    messageArea.innerHTML = '';
    document.getElementById('online-users').innerHTML = '';

    // Reset connect button
    const connectButton = document.querySelector('.cyber-button.primary');
    if (connectButton) {
        connectButton.textContent = 'CONNECT TO NETWORK';
        connectButton.disabled = false;
    }

    // Reset username field
    const nameInput = document.getElementById('name');
    nameInput.value = '';
    nameInput.focus();

    // Clear typing indicators
    currentlyTyping.clear();
    updateTypingIndicator();
}

// Cyber matrix animation
function initializeCyberEffects() {
    setInterval(() => {
        const title = document.querySelector('.title');
        if (title && Math.random() < 0.1) {
            title.style.textShadow = '0 0 20px rgba(255, 0, 0, 0.8)';
            setTimeout(() => {
                title.style.textShadow = '0 0 20px rgba(0, 255, 65, 0.5)';
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
        ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#00ff41';
        ctx.font = fontSize + 'px monospace';

        drops.forEach((y, x) => {
            const text = matrix[Math.floor(Math.random() * matrix.length)];
            ctx.fillText(text, x * fontSize, y * fontSize);
            drops[x] = (y * fontSize > canvas.height && Math.random() > 0.975) ? 0 : y + 1;
        });
    }

    setInterval(drawMatrix, 35);
}



window.addEventListener('resize', () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden && isConnected) {
        try {
            stompClient.send("/app/chat.leave", {}, JSON.stringify({
                sender: username,
                type: 'LEAVE'
            }));
        } catch (e) {}
    }
});

document.addEventListener('DOMContentLoaded', init);