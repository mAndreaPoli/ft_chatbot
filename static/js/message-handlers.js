import { formatAndHighlightCode, formatTime } from './utils.js';
import { files, hasProcessedFiles, isProcessing as fileIsProcessing } from './file-handlers.js';

let conversationStarted = false;
let sessionId = null;
let isProcessing = false;

function startConversation() {
    const welcomeScreen = document.getElementById('welcomeScreen');
    if (!conversationStarted) {
        welcomeScreen.style.display = 'none';
        conversationStarted = true;
    }
}

/**
 * @param {string} title
 */
function updateConversationTitle(title) {
    const conversationTitle = document.getElementById('conversationTitle');
    if (conversationTitle) {
        conversationTitle.textContent = title || 'New conversation';
    }
}

/**
 * @param {string} content
 */
function addUserMessage(content) {
    startConversation();
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

/**
 * @param {string} statusText
 * @param {string} statusId
 */
function addBotProcessingMessage(statusText, statusId) {
    startConversation();
    const messagesContainer = document.getElementById('messagesContainer');
    const messagesWrapper = document.getElementById('messagesWrapper');
    
    const messageElement = document.createElement('div');
    messageElement.className = 'message bot-message';
    messageElement.innerHTML = `
        <div class="message-avatar bot-avatar">
            <div class="fortinet-logo">
                <img src="/static/Fortinet-logomark-rgb-red.svg" alt="Fortinet Logo">
            </div>
        </div>
        <div class="message-content">
            <div class="message-bubble bot-bubble">
                <div class="processing-indicator">
                    <div class="spinner"></div>
                    <div id="${statusId}">${statusText}</div>
                </div>
            </div>
            <div class="message-meta">
                <span class="message-sender">Fortinet Assistant</span>
                <span class="message-time">${formatTime(new Date())}</span>
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
}

/**
 * @param {string} htmlContent
 */
function updateLastBotMessage(htmlContent) {
    const messagesContainer = document.getElementById('messagesContainer');
    const messagesWrapper = document.getElementById('messagesWrapper');
    
    const lastBotMessage = messagesContainer.querySelector('.bot-message:last-child .message-bubble');
    if (lastBotMessage) {
        lastBotMessage.innerHTML = formatAndHighlightCode(htmlContent);
        messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
    }
}

/**
 * @param {string} questionText
 */
async function processFilesAndAsk(questionText) {
    const messagesContainer = document.getElementById('messagesContainer');
    const messagesWrapper = document.getElementById('messagesWrapper');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    
    if (!questionText.trim()) return;
    if (isProcessing) return;
    
    const question = questionText.trim();
    messageInput.value = '';
    
    addUserMessage(question);
    
    isProcessing = true;
    sendButton.disabled = true;
    
    addBotProcessingMessage('Searching for information...', 'botResponseStatus');
    
    const processingStatus = document.getElementById('botResponseStatus');
    
    try {
        if (files.length > 0 && !hasProcessedFiles) {
            processingStatus.textContent = 'Processing documents...';
            
            const formData = new FormData();
            files.forEach(file => {
                formData.append('files', file);
            });
            
            const uploadResponse = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            
            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json();
                throw new Error(errorData.detail || 'Error uploading files');
            }
            
            let processingComplete = false;
            while (!processingComplete) {
                const statusResponse = await fetch('/status');
                const statusData = await statusResponse.json();
                
                if (statusData.is_processing) {
                    processingStatus.textContent = `Processing documents: ${statusData.processed_files}/${statusData.total_files} files, ${statusData.chunks_created} segments created`;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    processingComplete = true;
                    hasProcessedFiles = true;
                    processingStatus.textContent = 'Searching for information...';
                    
                    files.length = 0;
                    document.getElementById('selectedFiles').innerHTML = '';
                }
            }
        }
        
        processingStatus.textContent = 'Generating response...';
        
        const formData = new FormData();
        formData.append('question', question);
        
        if (sessionId) {
            formData.append('session_id', sessionId);
        }
        
        const response = await fetch('/ask', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            if (result.session_id) {
                sessionId = result.session_id;
                window.refreshSessionsListFn && window.refreshSessionsListFn();
                
                if (!conversationStarted || messagesContainer.querySelectorAll('.message').length <= 2) {
                    updateConversationTitle(question.length > 40 ? question.substring(0, 40) + '...' : question);
                }
            }
            
            let answerText = result.answer;
            let messageHTML = '';
            
            messageHTML = formatAndHighlightCode(answerText);
            
            let sourcesHTML = '';
            if (result.sources && result.sources.length > 0) {
                sourcesHTML = `
                    <div class="sources-section">
                        <div class="sources-title">Sources:</div>
                        <ul class="sources-list">
                            ${result.sources.map(source => {
                                let sourceType = 'TXT';
                                if (source.toLowerCase().endsWith('.pdf')) {
                                    sourceType = 'PDF';
                                } else if (source.toLowerCase().endsWith('.html')) {
                                    sourceType = 'HTML';
                                }
                                return `<li><span class="source-badge">${sourceType}</span> ${source}</li>`;
                            }).join('')}
                        </ul>
                    </div>
                `;
            }
            
            const lastBotMessage = messagesContainer.querySelector('.bot-message:last-child .message-bubble');
            if (lastBotMessage) {
                lastBotMessage.innerHTML = messageHTML + sourcesHTML;
                
                document.querySelectorAll('pre code').forEach((block) => {
                    if (window.hljs) {
                        hljs.highlightElement(block);
                    }
                });
                
                const fullMessage = answerText + sourcesHTML;
                
                if (sessionId) {
                    const messageIndex = messagesContainer.querySelectorAll('.message').length - 1;
                    if (messageIndex >= 0) {
                        const messages = document.querySelectorAll('.message');
                        const lastMessage = messages[messageIndex];
                        if (lastMessage) {
                            lastMessage.setAttribute('data-full-message', fullMessage);
                        }
                    }
                }
            }
        } else {
            throw new Error(result.detail || 'Error processing question');
        }
    } catch (error) {
        updateLastBotMessage(`
            <div class="status-error" style="display: block;">
                <i class="fas fa-exclamation-circle"></i> Error: ${error.message}
            </div>
        `);
    } finally {
        isProcessing = false;
        sendButton.disabled = false;
        messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
    }
}

function initMessageHandlers() {
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    
    sendButton.addEventListener('click', () => {
        processFilesAndAsk(messageInput.value);
    });
    
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !sendButton.disabled && !isProcessing) {
            processFilesAndAsk(messageInput.value);
        }
    });
    
    const suggestionCards = document.querySelectorAll('.suggestion-card');
    suggestionCards.forEach(card => {
        card.addEventListener('click', () => {
            const suggestion = card.getAttribute('data-suggestion');
            messageInput.value = suggestion;
            processFilesAndAsk(suggestion);
        });
    });
}

function resetConversation() {
    conversationStarted = false;
    const welcomeScreen = document.getElementById('welcomeScreen');
    welcomeScreen.style.display = 'flex';
}

function setSessionId(id) {
    sessionId = id;
}

export {
    startConversation,
    updateConversationTitle,
    addUserMessage,
    addBotProcessingMessage,
    updateLastBotMessage,
    processFilesAndAsk,
    initMessageHandlers,
    resetConversation,
    sessionId,
    setSessionId
};