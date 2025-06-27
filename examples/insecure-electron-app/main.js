/**
 * INSECURE ELECTRON APP - Example for Security Analysis
 * This file contains common security vulnerabilities for demonstration
 * DO NOT USE THIS CODE IN PRODUCTION!
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

let mainWindow;

function createWindow() {
    // CRITICAL: Insecure webPreferences
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,          // CRITICAL: Security risk!
            contextIsolation: false,        // CRITICAL: Allows context bypass
            webSecurity: false,             // HIGH: Disables web security
            enableRemoteModule: true,       // HIGH: Deprecated and insecure
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('index.html');
}

// HIGH: Unvalidated IPC handler - no input validation
ipcMain.handle('read-file', async (event, filePath) => {
    // CRITICAL: Exposing fs directly without validation
    return fs.readFileSync(filePath, 'utf8');
});

// CRITICAL: Command injection vulnerability
ipcMain.handle('execute-command', async (event, command) => {
    // No validation - allows arbitrary command execution!
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve(stdout);
        });
    });
});

// HIGH: Sensitive data exposure
ipcMain.handle('get-user-credentials', async (event) => {
    return {
        password: process.env.USER_PASSWORD,        // Exposing password
        apiKey: process.env.SECRET_API_KEY,        // Exposing API key
        databaseUrl: process.env.DATABASE_URL,     // Exposing database URL
        sessionToken: generateSessionToken()       // Exposing session token
    };
});

// MEDIUM: Missing sender validation (CVE-2022-29247 pattern)
ipcMain.on('privileged-action', (event, data) => {
    // Not validating event.senderFrame or event.sender
    performPrivilegedAction(data);
});

// MEDIUM: Synchronous IPC blocking main process
ipcMain.on('sync-heavy-operation', (event, data) => {
    // Synchronous operation blocks the main process
    const result = performHeavyComputation(data);
    event.returnValue = result;
});

// HIGH: Path traversal vulnerability
ipcMain.handle('get-app-file', async (event, fileName) => {
    // No validation - allows reading any file!
    const filePath = path.join(__dirname, '..', fileName);
    return fs.readFileSync(filePath, 'utf8');
});

// CRITICAL: Eval usage with user input
ipcMain.handle('evaluate-code', async (event, code) => {
    // Never use eval with user input!
    return eval(code);
});

// Helper functions (for demo purposes)
function generateSessionToken() {
    return 'super-secret-session-token-12345';
}

function performPrivilegedAction(data) {
    console.log('Performing privileged action:', data);
}

function performHeavyComputation(data) {
    // Simulate heavy computation
    let result = 0;
    for (let i = 0; i < 1000000; i++) {
        result += Math.random();
    }
    return result;
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
}); 