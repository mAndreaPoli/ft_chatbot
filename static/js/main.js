import { configureMarked } from './utils.js';
import { initDomHandlers, initPageLoadEvents } from './dom-handlers.js';
import { initFileHandlers, checkInitialFileStatus } from './file-handlers.js';
import { startConversation, addBotProcessingMessage, updateLastBotMessage, initMessageHandlers } from './message-handlers.js';
import { initSessionHandlers, refreshSessionsList } from './session-handlers.js';
import { initWebIndexerHandlers } from './web-indexer.js';

document.addEventListener('DOMContentLoaded', function() {
    configureMarked();
    
    initDomHandlers();
    initFileHandlers(startConversation, addBotProcessingMessage, updateLastBotMessage);
    initMessageHandlers();
    initSessionHandlers();
    initWebIndexerHandlers();
    
    checkInitialFileStatus();
    refreshSessionsList();
    
    initPageLoadEvents();
});
