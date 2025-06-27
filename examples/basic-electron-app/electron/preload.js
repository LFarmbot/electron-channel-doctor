const { contextBridge, ipcRenderer } = require('electron');

// Example preload.js with whitelist validation
contextBridge.exposeInMainWorld('electronAPI', {
    invoke: (channel, ...args) => {
        // This is the array that electron-channel-doctor analyzes
        const validInvokeChannels = [
            'get-app-version',
            'save-user-data',
            'load-file',
            'get-platform',
            'open-dialog',
            'unused-channel',      // ← This would be flagged as unused
            // 'missing-channel'   // ← This would be flagged as missing if used in renderer
        ];
        
        if (validInvokeChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, ...args);
        }
        
        throw new Error(`Invalid invoke channel: ${channel}`);
    },
    
    // Other APIs
    onMenuClick: (callback) => ipcRenderer.on('menu-click', callback),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
}); 