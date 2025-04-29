function initDomHandlers() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const menuToggle = document.getElementById('menuToggle');
    
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
}

let pageFullyLoaded = false;

function initPageLoadEvents() {
    window.addEventListener('load', function() {
        pageFullyLoaded = true;
        
        if (window.refreshSessionsListFn) {
            window.refreshSessionsListFn();
        }
    });
}

export {
    initDomHandlers,
    initPageLoadEvents,
    pageFullyLoaded
};