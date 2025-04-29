function configureMarked() {
    marked.setOptions({
        breaks: true,
        sanitize: false,
        xhtml: false
    });
}

/**
 * @param {string} htmlContent
 * @returns {string}
 */
function formatAndHighlightCode(htmlContent) {
    const renderedContent = marked.parse(htmlContent);
    
    setTimeout(() => {
        document.querySelectorAll('pre code').forEach((block) => {
            if (window.hljs) {
                hljs.highlightElement(block);
            }
        });
    }, 0);
    
    return renderedContent;
}

/**
 * @param {Date} date
 * @returns {string}
 */
function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * @param {string} type
 * @param {string} message
 */
function showStatus(type, message) {
    const statusMessage = document.getElementById('statusMessage');
    statusMessage.className = `status-message status-${type}`;
    statusMessage.innerHTML = message;
    statusMessage.style.display = 'block';
    
    setTimeout(() => {
        statusMessage.style.display = 'none';
    }, 5000);
}

export {
    configureMarked,
    formatAndHighlightCode,
    formatTime,
    showStatus
};