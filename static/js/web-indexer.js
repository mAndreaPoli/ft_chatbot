import { showStatus } from './utils.js';
import { startConversation, addBotProcessingMessage, updateLastBotMessage } from './message-handlers.js';

let isProcessing = false;

function showWebsiteModal() {
    const websiteModal = document.getElementById('websiteModal');
    websiteModal.classList.add('active');
}

function hideWebsiteModal() {
    const websiteModal = document.getElementById('websiteModal');
    websiteModal.classList.remove('active');
}

/**
 * @param {string} url
 * @param {number} maxPagesCount
 */
async function indexWebsite(url, maxPagesCount) {
    const messagesWrapper = document.getElementById('messagesWrapper');
    
    if (isProcessing) return;
    isProcessing = true;
    
    startConversation();
    addBotProcessingMessage('Exploring the website...', 'websiteCrawlStatus');
    
    const crawlStatus = document.getElementById('websiteCrawlStatus');
    
    try {
        const formData = new FormData();
        formData.append('base_url', url);
        formData.append('max_pages', maxPagesCount);
        
        const response = await fetch('/index-website', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Error while indexing the website');
        }
        
        let processingComplete = false;
        let lastProcessedFiles = 0;
        let lastChunksCreated = 0;
        
        while (!processingComplete) {
            const statusResponse = await fetch('/status');
            const statusData = await statusResponse.json();
            
            if (statusData.is_processing) {
                if (statusData.processed_files !== lastProcessedFiles || statusData.chunks_created !== lastChunksCreated) {
                    lastProcessedFiles = statusData.processed_files;
                    lastChunksCreated = statusData.chunks_created;
                    crawlStatus.textContent = `Processing: ${statusData.processed_files}/${statusData.total_files} pages, ${statusData.chunks_created} segments created`;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                processingComplete = true;
                
                updateLastBotMessage(`
                    <p>Website indexed successfully.</p>
                    <div class="status-success" style="display: block; margin-top: 12px;">
                        <i class="fas fa-check-circle"></i> ${lastProcessedFiles} page(s) analyzed, ${lastChunksCreated} segments created.
                    </div>
                    <p>You can now ask questions about the website content.</p>
                `);
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

function initWebIndexerHandlers() {
    const indexWebsiteBtn = document.getElementById('indexWebsiteBtn');
    const websiteForm = document.getElementById('websiteForm');
    const websiteUrl = document.getElementById('websiteUrl');
    const maxPages = document.getElementById('maxPages');
    const cancelWebsiteBtn = document.getElementById('cancelWebsiteBtn');
    const closeModalBtn = document.querySelector('.close-modal');
    
    indexWebsiteBtn.addEventListener('click', () => {
        showWebsiteModal();
    });
    
    closeModalBtn.addEventListener('click', () => {
        hideWebsiteModal();
    });
    
    cancelWebsiteBtn.addEventListener('click', () => {
        hideWebsiteModal();
    });
    
    websiteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = websiteUrl.value.trim();
        const pagesCount = parseInt(maxPages.value) || 50;
        
        if (!url) {
            showStatus('error', 'Please enter a valid URL');
            return;
        }
        
        hideWebsiteModal();
        indexWebsite(url, pagesCount);
    });
}

export {
    initWebIndexerHandlers,
    showWebsiteModal,
    hideWebsiteModal,
    indexWebsite
};