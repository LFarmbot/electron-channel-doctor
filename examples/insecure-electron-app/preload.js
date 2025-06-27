/**
 * INSECURE PRELOAD SCRIPT - Example for Security Analysis
 * This file demonstrates bad security practices
 * DO NOT USE THIS CODE IN PRODUCTION!
 */

const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// CRITICAL: Not using contextBridge!
// CRITICAL: Directly exposing dangerous APIs to renderer

// BAD: Exposing Node.js APIs directly to window
window.electronAPI = {
    // CRITICAL: Exposing file system operations
    readFile: (filePath) => fs.readFileSync(filePath, 'utf8'),
    writeFile: (filePath, content) => fs.writeFileSync(filePath, content),
    
    // CRITICAL: Exposing require function
    require: require,
    
    // CRITICAL: Exposing process object
    process: process,
    
    // HIGH: No channel validation
    invoke: (channel, ...args) => {
        // No whitelist validation!
        return ipcRenderer.invoke(channel, ...args);
    },
    
    // HIGH: Exposing send without validation
    send: (channel, ...args) => {
        // No channel validation!
        ipcRenderer.send(channel, ...args);
    },
    
    // CRITICAL: Exposing eval
    evaluate: (code) => eval(code),
    
    // HIGH: Exposing sensitive environment variables
    getEnv: () => process.env,
    
    // MEDIUM: Synchronous IPC
    sendSync: (channel, ...args) => {
        return ipcRenderer.sendSync(channel, ...args);
    }
};

// BAD: Adding event listeners without validation
window.addEventListener('message', (event) => {
    // No origin validation!
    if (event.data.type === 'execute-command') {
        window.electronAPI.invoke('execute-command', event.data.command);
    }
});

// BAD: Global error handler exposing sensitive info
window.addEventListener('error', (event) => {
    console.error('Detailed error info:', {
        message: event.message,
        filename: event.filename,
        stack: event.error?.stack,
        env: process.env // Exposing environment variables in errors!
    });
}); 