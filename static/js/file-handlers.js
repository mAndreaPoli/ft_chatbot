import { formatAndHighlightCode, showStatus } from './utils.js';

let files = [];
let hasProcessedFiles = false;
let isProcessing = false;

function updateFilesList() {
    const selectedFilesDiv = document.getElementById('selectedFiles');
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

function initFileHandlers(startConversation, addBotProcessingMessage, updateLastBotMessage) {
    const addFilesBtn = document.getElementById('addFilesBtn');
    const fileInput = document.getElementById('fileInput');
    const statusMessage = document.getElementById('statusMessage');
    const messagesWrapper = document.getElementById('messagesWrapper');
    
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
                    uploadSelectedFiles(startConversation, addBotProcessingMessage, updateLastBotMessage);
                });
            }
        }
    });
}

async function uploadSelectedFiles(startConversation, addBotProcessingMessage, updateLastBotMessage) {
    const statusMessage = document.getElementById('statusMessage');
    const messagesWrapper = document.getElementById('messagesWrapper');
    
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

function resetFiles() {
    files = [];
    updateFilesList();
}

function checkInitialFileStatus() {
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
}

export {
    initFileHandlers,
    updateFilesList,
    resetFiles,
    checkInitialFileStatus,
    files,
    hasProcessedFiles,
    isProcessing
};