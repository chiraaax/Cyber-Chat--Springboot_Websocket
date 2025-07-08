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
    messageElement.style.cssText = `
        opacity: 0;
        transform: translateX(-30px) scale(0.95);
        transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    `;
    setTimeout(() => {
        messageElement.style.cssText = `
            opacity: 1;
            transform: translateX(0) scale(1);
        `;
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

// ------------------ Enhanced Cyber Matrix Effects ---------------------
function initializeCyberEffects() {
    // Enhanced title glitch effect with more variety
    setInterval(() => {
        const title = document.querySelector('.title');
        if (title && Math.random() < 0.15) {
            const glitchType = Math.random();

            if (glitchType < 0.3) {
                // Red glitch
                title.style.textShadow = '0 0 20px rgba(255,0,0,0.8), 2px 0 0 rgba(255,0,0,0.5)';
                title.style.transform = 'translateX(2px)';
            } else if (glitchType < 0.6) {
                // Cyan glitch
                title.style.textShadow = '0 0 20px rgba(0,255,255,0.8), -2px 0 0 rgba(0,255,255,0.5)';
                title.style.transform = 'translateX(-2px)';
            } else {
                // Multi-color glitch
                title.style.textShadow = '0 0 20px rgba(255,0,255,0.8), 1px 0 0 rgba(255,0,0,0.5), -1px 0 0 rgba(0,255,255,0.5)';
                title.style.transform = 'skew(2deg)';
            }

            setTimeout(() => {
                title.style.textShadow = '0 0 20px rgba(0,255,65,0.5)';
                title.style.transform = 'none';
            }, 80 + Math.random() * 120);
        }
    }, 1500);

    // Add subtle screen flicker effect
    setInterval(() => {
        if (Math.random() < 0.05) {
            document.body.style.filter = 'brightness(1.1) contrast(1.1)';
            setTimeout(() => {
                document.body.style.filter = 'none';
            }, 50);
        }
    }, 3000);

    // Initialize enhanced matrix effect
    createEnhancedMatrixEffect();

    // Add floating UI elements glitch
    initializeUIGlitches();
}

function createEnhancedMatrixEffect() {
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
        opacity: 0.4;
        z-index: -1;
        mix-blend-mode: screen;
    `;
    document.body.appendChild(canvas);

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Enhanced particle system
    const particles = [];
    const particleCount = 60;
    for(let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 4 + 1,
            speedX: (Math.random() - 0.5) * 0.8,
            speedY: (Math.random() - 0.5) * 0.8,
            opacity: Math.random() * 0.6 + 0.2,
            color: Math.random() > 0.7 ? '#00ff41' : Math.random() > 0.5 ? '#00ffff' : '#ff0080',
            pulseSpeed: Math.random() * 0.02 + 0.01,
            connections: []
        });
    }

    // Matrix rain with enhanced effects
    const matrix = "CYBERNET_TERMINAL_ACCESS_GRANTED_01234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%^&*()";
    const fontSize = 12;
    const columns = Math.floor(canvas.width / fontSize);
    const drops = Array(columns).fill(1);

    // Grid lines for cyber aesthetic
    const gridSize = 40;
    let gridOffset = 0;

    function animate() {
        // Clear with subtle fade
        ctx.fillStyle = 'rgba(0,0,0,0.03)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw animated grid
        ctx.strokeStyle = 'rgba(0,255,65,0.1)';
        ctx.lineWidth = 0.5;
        gridOffset += 0.5;

        for(let x = (gridOffset % gridSize) - gridSize; x < canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        for(let y = (gridOffset % gridSize) - gridSize; y < canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // Enhanced matrix rain - FIXED VERSION
                ctx.font = fontSize + 'px "Courier New", monospace';

                for (let i = 0; i < drops.length; i++) {
                    // Pick a random character from the matrix string
                    const text = matrix[Math.floor(Math.random() * matrix.length)];

                    // Calculate position - this makes it flow from top to bottom
                    const x = i * fontSize;
                    const y = drops[i] * fontSize;

                    // Calculate alpha based on position (fade out as it goes down) - REDUCED VISIBILITY
                    const alpha = Math.max(0, 1 - (y / canvas.height));

                    // Main character with reduced opacity (was 0.8, now 0.3)
                    ctx.fillStyle = `rgba(0,255,65,${alpha * 0.6})`;
                    ctx.fillText(text, x, y);

                    // Glow effect with reduced opacity (was 0.4, now 0.15)
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = '#00ff41';
                    ctx.fillStyle = `rgba(0,255,65,${alpha * 0.2})`;
                    ctx.fillText(text, x, y);
                    ctx.shadowBlur = 0;

                    // Move the drop down, reset when it reaches bottom
                    if (y > canvas.height && Math.random() > 0.975) {
                        drops[i] = 0; // Reset to top
                    } else {
                        drops[i]++; // Move down
                    }
                }

        // Draw particles with connections
        particles.forEach((particle, i) => {
            // Update particle
            particle.x += particle.speedX;
            particle.y += particle.speedY;

            // Wrap around edges
            if (particle.x < 0) particle.x = canvas.width;
            if (particle.x > canvas.width) particle.x = 0;
            if (particle.y < 0) particle.y = canvas.height;
            if (particle.y > canvas.height) particle.y = 0;

            // Pulse effect
            particle.opacity += Math.sin(Date.now() * particle.pulseSpeed + i) * 0.02;
            particle.opacity = Math.max(0.1, Math.min(0.8, particle.opacity));

            // Draw connections to nearby particles
            particles.forEach((other, j) => {
                if (i !== j) {
                    const dx = particle.x - other.x;
                    const dy = particle.y - other.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < 100) {
                        const opacity = (1 - distance / 100) * 0.2;
                        ctx.strokeStyle = `rgba(0,255,65,${opacity})`;
                        ctx.lineWidth = 0.5;
                        ctx.beginPath();
                        ctx.moveTo(particle.x, particle.y);
                        ctx.lineTo(other.x, other.y);
                        ctx.stroke();
                    }
                }
            });

            // Draw particle with enhanced glow
            ctx.save();
            ctx.globalAlpha = particle.opacity;

            // Outer glow
            ctx.shadowBlur = 20;
            ctx.shadowColor = particle.color;
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size * 1.5, 0, Math.PI * 2);
            ctx.fill();

            // Inner core
            ctx.shadowBlur = 5;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size * 0.3, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        });

        requestAnimationFrame(animate);
    }

    animate();

    // Enhanced resize handling
    const resizeObserver = new ResizeObserver(() => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // Recalculate drops array
        const newColumns = Math.floor(canvas.width / fontSize);
        drops.length = newColumns;
        drops.fill(1);

        // Redistribute particles
        particles.forEach(particle => {
            if (particle.x > canvas.width) particle.x = Math.random() * canvas.width;
            if (particle.y > canvas.height) particle.y = Math.random() * canvas.height;
        });
    });

    resizeObserver.observe(document.body);
}

function initializeUIGlitches() {
    // Add glitch effects to various UI elements
    const glitchElements = ['.cyber-button', '.cyber-input', '.status-indicator'];

    setInterval(() => {
        if (Math.random() < 0.08) {
            const selector = glitchElements[Math.floor(Math.random() * glitchElements.length)];
            const elements = document.querySelectorAll(selector);

            if (elements.length > 0) {
                const randomElement = elements[Math.floor(Math.random() * elements.length)];
                const originalFilter = randomElement.style.filter;

                randomElement.style.filter = 'hue-rotate(180deg) saturate(2)';
                randomElement.style.transform = 'scale(1.01)';

                setTimeout(() => {
                    randomElement.style.filter = originalFilter;
                    randomElement.style.transform = 'scale(1)';
                }, 100);
            }
        }
    }, 4000);
}

// -------------------- Enhanced Listeners --------------------
document.addEventListener('DOMContentLoaded', init);

// Add performance monitoring
let lastFrameTime = 0;
function monitorPerformance() {
    const now = performance.now();
    const fps = 1000 / (now - lastFrameTime);
    lastFrameTime = now;

    // Reduce particle count if performance is poor
    if (fps < 30) {
        console.log('Performance optimization: Reducing effects');
        // Could implement dynamic quality reduction here
    }
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
        canvas.remove();
    }
});