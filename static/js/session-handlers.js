import { formatAndHighlightCode, formatTime, showStatus } from './utils.js';
import { resetFiles } from './file-handlers.js';
import { updateConversationTitle, setSessionId, resetConversation } from './message-handlers.js';

async function refreshSessionsList() {
    const sessionsList = document.getElementById('sessionsList');
    try {
        const response = await fetch('/sessions');
        if (response.ok) {
            const data = await response.json();
            
            sessionsList.innerHTML = '';
            
            if (data.sessions && data.sessions.length > 0) {
                data.sessions.forEach(session => {
                    const sessionItem = document.createElement('div');
                    sessionItem.className = 'session-item';
                    sessionItem.setAttribute('data-id', session.id);
                    
                    const date = new Date(session.last_activity);
                    const formattedDate = `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                    
                    sessionItem.innerHTML = `
                        <div class="session-title">${session.title}</div>
                        <div class="session-meta">${formattedDate}</div>
                    `;
                    
                    sessionItem.addEventListener('click', () => {
                        loadSession(session.id);
                    });
                    
                    sessionsList.appendChild(sessionItem);
                });
                
                if (window.pageFullyLoaded && !window.sessionId && !window.conversationStarted && data.sessions.length > 0) {
                    const lastSession = data.sessions[0];
                    loadSession(lastSession.id);
                }
            } else {
                sessionsList.innerHTML = '<div class="session-item">No recent conversations</div>';
            }
        }
    } catch (error) {
        console.error('Error loading sessions:', error);
    }
}

/**
 * @param {string} id
 */
async function loadSession(id) {
    const messagesContainer = document.getElementById('messagesContainer');
    const messagesWrapper = document.getElementById('messagesWrapper');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    
    try {
        const response = await fetch(`/session/${id}`);
        if (response.ok) {
            const session = await response.json();
            
            setSessionId(session.id);
            updateConversationTitle(session.title);
            messagesContainer.innerHTML = '';
            
            welcomeScreen.style.display = 'none';
            
            session.messages.forEach(msg => {
                if (msg.role === 'user') {
                    addUserMessage(msg.content);
                } else {
                    let messageContent = msg.content;
                    let sourcesHTML = '';
                    
                    const sourcesPattern = /<div class="sources-section">([\s\S]*?)<\/div>/;
                    const sourcesMatch = messageContent.match(sourcesPattern);
                    
                    if (sourcesMatch) {
                        sourcesHTML = sourcesMatch[0];
                        messageContent = messageContent.replace(sourcesPattern, '').trim();
                    }

                    const messageElement = document.createElement('div');
                    messageElement.className = 'message bot-message';
                    
                    const formattedContent = formatAndHighlightCode(messageContent);
                    
                    messageElement.innerHTML = `
                        <div class="message-avatar bot-avatar">
                            <div class="fortinet-logo">
                                <img src="/static/Fortinet-logomark-rgb-red.svg" alt="Fortinet Logo">
                            </div>
                        </div>
                        <div class="message-content">
                            <div class="message-bubble bot-bubble">${formattedContent}${sourcesHTML}</div>
                            <div class="message-meta">
                                <span class="message-sender">Fortinet Assistant</span>
                                <span class="message-time">${formatTime(new Date(session.last_activity))}</span>
                            </div>
                        </div>
                    `;
                    
                    messagesContainer.appendChild(messageElement);
                }
            });
            
            setTimeout(() => {
                document.querySelectorAll('pre code').forEach((block) => {
                    if (window.hljs) {
                        hljs.highlightElement(block);
                    }
                });
            }, 0);
            
            messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
            
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        }
    } catch (error) {
        console.error('Error loading session:', error);
        showStatus('error', 'Error loading conversation');
    }
}

function startNewChat() {
    setSessionId(null);
    
    updateConversationTitle('New conversation');
    
    const messagesContainer = document.getElementById('messagesContainer');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const messageInput = document.getElementById('messageInput');
    
    messagesContainer.innerHTML = '';
    
    welcomeScreen.style.display = 'flex';
    resetConversation();
    
    resetFiles();
    
    messageInput.focus();
    
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
}

function addUserMessage(content) {
    const messagesContainer = document.getElementById('messagesContainer');
    const messagesWrapper = document.getElementById('messagesWrapper');
    
    const messageElement = document.createElement('div');
    messageElement.className = 'message user-message';
    messageElement.innerHTML = `
        <div class="message-avatar user-avatar">
            <i class="fas fa-user"></i>
        </div>
        <div class="message-content">
            <div class="message-bubble user-bubble">${content.replace(/\n/g, '<br>')}</div>
            <div class="message-meta">
                <span class="message-sender">You</span>
                <span class="message-time">${formatTime(new Date())}</span>
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
}

function initSessionHandlers() {
    const newChatBtn = document.getElementById('newChatBtn');
    
    newChatBtn.addEventListener('click', startNewChat);
    window.refreshSessionsListFn = refreshSessionsList;
}

export {
    refreshSessionsList,
    loadSession,
    startNewChat,
    initSessionHandlers
};