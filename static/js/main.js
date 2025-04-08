document.addEventListener('DOMContentLoaded', function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const menuToggle = document.getElementById('menuToggle');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const messagesWrapper = document.getElementById('messagesWrapper');
    const messagesContainer = document.getElementById('messagesContainer');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const addFilesBtn = document.getElementById('addFilesBtn');
    const fileInput = document.getElementById('fileInput');
    const selectedFilesDiv = document.getElementById('selectedFiles');
    const statusMessage = document.getElementById('statusMessage');
    const newChatBtn = document.getElementById('newChatBtn');
    const sessionsList = document.getElementById('sessionsList');
    const suggestionCards = document.querySelectorAll('.suggestion-card');
    const conversationTitle = document.getElementById('conversationTitle');
    
    let files = [];
    let hasProcessedFiles = false;
    let conversationStarted = false;
    let sessionId = null;
    let isProcessing = false;
    let pageFullyLoaded = false;
    
    function updateConversationTitle(title) {
        if (conversationTitle) {
            conversationTitle.textContent = title || 'New conversation';
        }
    }
    
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        });
    }
    
    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }
    
    suggestionCards.forEach(card => {
        card.addEventListener('click', () => {
            const suggestion = card.getAttribute('data-suggestion');
            messageInput.value = suggestion;
            processFilesAndAsk(suggestion);
        });
    });
    
    function updateFilesList() {
        selectedFilesDiv.innerHTML = '';
        
        if (files.length > 0) {
            files.forEach((file, index) => {
                const fileChip = document.createElement('div');
                fileChip.className = 'file-chip';
                fileChip.innerHTML = `
                    <i class="fas ${file.name.endsWith('.pdf') ? 'fa-file-pdf' : 'fa-file-alt'}"></i>
                    <span>${file.name}</span>
                    <button class="remove-file" data-index="${index}">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                selectedFilesDiv.appendChild(fileChip);
            });
            
            selectedFilesDiv.querySelectorAll('.remove-file').forEach(btn => {
                btn.addEventListener('click', function() {
                    const index = parseInt(this.getAttribute('data-index'));
                    files.splice(index, 1);
                    updateFilesList();
                });
            });
        }
    }
    
    addFilesBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            Array.from(e.target.files).forEach(file => {
                if (file.type === 'application/pdf' || file.type === 'text/plain' || file.name.endsWith('.txt')) {
                    if (!files.some(f => f.name === file.name)) {
                        files.push(file);
                    }
                }
            });
            
            updateFilesList();
            
            if (files.length > 0) {
                statusMessage.className = 'status-message status-info';
                statusMessage.innerHTML = `${files.length} file(s) selected. <button id="uploadNowBtn" class="upload-btn">Process now</button>`;
                statusMessage.style.display = 'block';
                
                document.getElementById('uploadNowBtn').addEventListener('click', () => {
                    uploadSelectedFiles();
                });
            }
        }
    });
    
    async function uploadSelectedFiles() {
        if (files.length === 0) {
            showStatus('error', 'No files selected');
            return;
        }
        
        if (isProcessing) return;
        isProcessing = true;
        
        startConversation();
        addBotProcessingMessage('Processing documents...', 'processingStatus');
        
        const processingStatus = document.getElementById('processingStatus');
        
        try {
            statusMessage.style.display = 'none';
            
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
                    processingStatus.textContent = `Processing: ${statusData.processed_files}/${statusData.total_files} files, ${statusData.chunks_created} segments created`;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    processingComplete = true;
                    hasProcessedFiles = true;
                    
                    updateLastBotMessage(`
                        <p>Documents processed successfully.</p>
                        <div class="status-success" style="display: block; margin-top: 12px;">
                            <i class="fas fa-check-circle"></i> ${files.length} document(s) analyzed, ${statusData.chunks_created} segments created.
                        </div>
                    `);
                    
                    files = [];
                    updateFilesList();
                }
            }
        } catch (error) {
            updateLastBotMessage(`
                <div class="status-error" style="display: block;">
                    <i class="fas fa-exclamation-circle"></i> Error: ${error.message}
                </div>
            `);
            
            showStatus('error', error.message);
        } finally {
            isProcessing = false;
            messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
        }
    }
    
    async function processFilesAndAsk(questionText) {
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
                        
                        files = [];
                        updateFilesList();
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
                    refreshSessionsList();
                    
                    if (!conversationStarted || messagesContainer.querySelectorAll('.message').length <= 2) {
                        updateConversationTitle(question.length > 40 ? question.substring(0, 40) + '...' : question);
                    }
                }
                
                let messageHTML = result.answer.replace(/\n/g, '<br>');
                
                if (result.sources && result.sources.length > 0) {
                    messageHTML += `
                        <div class="sources-section">
                            <div class="sources-title">Sources:</div>
                            <ul class="sources-list">
                                ${result.sources.map(source => {
                                    const sourceType = source.toLowerCase().endsWith('.pdf') ? 'PDF' : 'TXT';
                                    return `<li><span class="source-badge">${sourceType}</span> ${source}</li>`;
                                }).join('')}
                            </ul>
                        </div>
                    `;
                }
                
                updateLastBotMessage(messageHTML);
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
    
    function addUserMessage(content) {
        startConversation();
        
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
    
    function addBotProcessingMessage(statusText, statusId) {
        startConversation();
        
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
    
    function updateLastBotMessage(htmlContent) {
        const lastBotMessage = messagesContainer.querySelector('.bot-message:last-child .message-bubble');
        if (lastBotMessage) {
            const renderedContent = marked.parse(htmlContent);
            lastBotMessage.innerHTML = renderedContent;
            
            document.querySelectorAll('pre code').forEach((block) => {
                if (window.hljs) {
                    hljs.highlightElement(block);
                }
            });
            
            messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
        }
    }
                
    function showStatus(type, message) {
        statusMessage.className = `status-message status-${type}`;
        statusMessage.innerHTML = message;
        statusMessage.style.display = 'block';
        
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 5000);
    }
    
    function startConversation() {
        if (!conversationStarted) {
            welcomeScreen.style.display = 'none';
            conversationStarted = true;
        }
    }
    
    function formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    async function refreshSessionsList() {
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
                    
                    if (pageFullyLoaded && !sessionId && !conversationStarted && data.sessions.length > 0) {
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
    
    async function loadSession(id) {
        try {
            const response = await fetch(`/session/${id}`);
            if (response.ok) {
                const session = await response.json();
                
                sessionId = session.id;
                
                updateConversationTitle(session.title);
                
                messagesContainer.innerHTML = '';
                
                welcomeScreen.style.display = 'none';
                conversationStarted = true;
                
                session.messages.forEach(msg => {
                    if (msg.role === 'user') {
                        addUserMessage(msg.content);
                    } else {
                        const messageElement = document.createElement('div');
                        messageElement.className = 'message bot-message';
                        messageElement.innerHTML = `
                            <div class="message-avatar bot-avatar">
                                <div class="fortinet-logo">
                                    <img src="/static/Fortinet-logomark-rgb-red.svg" alt="Fortinet Logo">
                                </div>
                            </div>
                            <div class="message-content">
                                <div class="message-bubble bot-bubble">${marked.parse(msg.content)}</div>
                                <div class="message-meta">
                                    <span class="message-sender">Fortinet Assistant</span>
                                    <span class="message-time">${formatTime(new Date(session.last_activity))}</span>
                                </div>
                            </div>
                        `;
                        messagesContainer.appendChild(messageElement);
                    }
                });
                
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
        sessionId = null;
        
        updateConversationTitle('New conversation');
        
        messagesContainer.innerHTML = '';
        
        welcomeScreen.style.display = 'flex';
        conversationStarted = false;
        
        files = [];
        updateFilesList();
        
        messageInput.focus();
        
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    }
    
    newChatBtn.addEventListener('click', startNewChat);
    
    sendButton.addEventListener('click', () => {
        processFilesAndAsk(messageInput.value);
    });
    
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !sendButton.disabled && !isProcessing) {
            processFilesAndAsk(messageInput.value);
        }
    });
    
    refreshSessionsList();
    
    fetch('/status')
        .then(response => response.json())
        .then(data => {
            if (data.chunks_created > 0) {
                hasProcessedFiles = true;
            }
        })
        .catch(error => {
            console.error('Error checking initial status:', error);
        });
    
    window.addEventListener('load', function() {
        pageFullyLoaded = true;
        
        refreshSessionsList();
    });
});
