# 🚨 Insecure Electron App Example

> **WARNING: This is an intentionally insecure Electron application for demonstration purposes only!**  
> **DO NOT USE ANY OF THIS CODE IN PRODUCTION!**

## Purpose

This example demonstrates common security vulnerabilities in Electron applications that the `electron-channel-doctor security` command can detect.

## Running Security Analysis

From the project root, run:

```bash
# Analyze this insecure example
npx electron-channel-doctor security \
  --main "examples/insecure-electron-app/main.js" \
  --preload "examples/insecure-electron-app/preload.js"
```

## Expected Vulnerabilities

The security analyzer should detect:

### 🚨 CRITICAL Issues:
- **nodeIntegration: true** - Major security risk
- **contextIsolation: false** - Allows context bypass attacks
- **Missing contextBridge** - Preload script not using secure API
- **Dangerous API exposure** - fs, child_process, eval exposed
- **Command injection** - Unvalidated command execution

### ⚠️ HIGH Issues:
- **webSecurity: false** - Disables web security features
- **enableRemoteModule: true** - Deprecated and insecure
- **Unvalidated IPC handlers** - No input validation
- **Sensitive data exposure** - Passwords, API keys in IPC
- **Path traversal** - File system access without validation

### ⚡ MEDIUM Issues:
- **Missing sender validation** - No frame/sender verification
- **Synchronous IPC** - Blocks main process
- **Large data transfers** - Potential performance issues

## Security Best Practices

To fix these issues:

1. **Enable security features**:
   ```javascript
   webPreferences: {
       contextIsolation: true,
       nodeIntegration: false,
       webSecurity: true,
       // Remove enableRemoteModule
   }
   ```

2. **Use contextBridge in preload**:
   ```javascript
   const { contextBridge, ipcRenderer } = require('electron');
   
   contextBridge.exposeInMainWorld('electronAPI', {
       sendMessage: (channel, data) => {
           const validChannels = ['allowed-channel-1', 'allowed-channel-2'];
           if (validChannels.includes(channel)) {
               return ipcRenderer.invoke(channel, data);
           }
       }
   });
   ```

3. **Validate all IPC inputs**:
   ```javascript
   ipcMain.handle('read-file', async (event, filePath) => {
       // Validate input
       if (typeof filePath !== 'string' || filePath.includes('..')) {
           throw new Error('Invalid file path');
       }
       // Additional validation...
   });
   ```

4. **Never expose sensitive data or dangerous APIs**
5. **Use asynchronous IPC (invoke/handle) instead of synchronous**

## Learn More

- [Electron Security Guidelines](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-channel-doctor Documentation](https://github.com/LFarmbot/electron-channel-doctor) 