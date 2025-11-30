// Logger utility to control console output
// Set DEBUG_MODE to true in browser console to enable all logs: window.DEBUG_MODE = true

(function() {
    // Check if debug mode is enabled
    // You can enable it by setting window.DEBUG_MODE = true in browser console
    const isDebugMode = () => {
        return window.DEBUG_MODE === true || 
               localStorage.getItem('DEBUG_MODE') === 'true' ||
               window.location.hostname === 'localhost' ||
               window.location.hostname === '127.0.0.1';
    };

    // Store original console methods
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalDebug = console.debug;
    const originalWarn = console.warn;
    const originalError = console.error;

    // Override console methods
    console.log = function(...args) {
        if (isDebugMode()) {
            originalLog.apply(console, args);
        }
    };

    console.info = function(...args) {
        if (isDebugMode()) {
            originalInfo.apply(console, args);
        }
    };

    console.debug = function(...args) {
        if (isDebugMode()) {
            originalDebug.apply(console, args);
        }
    };

    // Always show warnings and errors
    console.warn = function(...args) {
        originalWarn.apply(console, args);
    };

    console.error = function(...args) {
        originalError.apply(console, args);
    };

    // Add helper functions to window
    window.enableDebugMode = function() {
        window.DEBUG_MODE = true;
        localStorage.setItem('DEBUG_MODE', 'true');
        originalLog('%cDebug mode ENABLED - All console logs will now show', 'color: #10b981; font-weight: bold; font-size: 14px;');
    };

    window.disableDebugMode = function() {
        window.DEBUG_MODE = false;
        localStorage.removeItem('DEBUG_MODE');
        originalLog('%cDebug mode DISABLED - Only errors and warnings will show', 'color: #ef4444; font-weight: bold; font-size: 14px;');
    };

    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1';
    
    if (isLocalhost) {
        if (isDebugMode()) {
            originalLog('%cDebug Mode: ON (localhost detected or manually enabled)', 'color: #10b981; font-weight: bold;');
            originalLog('%cTo disable: Run disableDebugMode() in console', 'color: #6b7280;');
        } else {
            originalLog('%cDebug Mode: OFF', 'color: #6b7280;');
            originalLog('%cTo enable: Run enableDebugMode() in console', 'color: #6b7280;');
        }
    }
    // In production: Silent - no status messages shown
})();

