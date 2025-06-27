// Example renderer code with various electronAPI.invoke() calls

async function initializeApp() {
    try {
        // This channel exists in preload.js whitelist ✅
        const version = await window.electronAPI.invoke('get-app-version');
        console.log('App version:', version);
        
        // This channel exists in preload.js whitelist ✅
        const platform = await window.electronAPI.invoke('get-platform');
        console.log('Platform:', platform);
        
    } catch (error) {
        console.error('Failed to initialize:', error);
    }
}

async function saveData() {
    const userData = {
        name: 'John Doe',
        preferences: { theme: 'dark' }
    };
    
    try {
        // This channel exists in preload.js whitelist ✅
        await window.electronAPI.invoke('save-user-data', userData);
        console.log('Data saved successfully');
    } catch (error) {
        console.error('Failed to save:', error);
    }
}

async function loadDocument() {
    try {
        // This channel exists in preload.js whitelist ✅
        const fileData = await window.electronAPI.invoke('load-file', 'document.txt');
        console.log('File loaded:', fileData);
    } catch (error) {
        console.error('Failed to load file:', error);
    }
}

async function uploadToCloud() {
    try {
        // ❌ This channel is NOT in preload.js whitelist!
        // electron-channel-doctor would flag this as MISSING
        const result = await window.electronAPI.invoke('upload-to-cloud', {
            file: 'image.jpg',
            bucket: 'my-bucket'
        });
        console.log('Upload result:', result);
    } catch (error) {
        console.error('Upload failed:', error);
    }
}

async function openFileDialog() {
    try {
        // This channel exists in preload.js whitelist ✅
        const filePath = await window.electronAPI.invoke('open-dialog', {
            type: 'file',
            filters: [{ name: 'Images', extensions: ['jpg', 'png'] }]
        });
        
        if (filePath) {
            console.log('Selected file:', filePath);
        }
    } catch (error) {
        console.error('Dialog failed:', error);
    }
}

async function analyzeProject() {
    try {
        // ❌ Another missing channel that would be caught
        const analysis = await window.electronAPI.invoke('analyze-project-structure');
        console.log('Project analysis:', analysis);
    } catch (error) {
        console.error('Analysis failed:', error);
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', initializeApp);
document.getElementById('save-btn')?.addEventListener('click', saveData);
document.getElementById('load-btn')?.addEventListener('click', loadDocument);
document.getElementById('upload-btn')?.addEventListener('click', uploadToCloud);
document.getElementById('dialog-btn')?.addEventListener('click', openFileDialog);
document.getElementById('analyze-btn')?.addEventListener('click', analyzeProject);

/*
 * Summary for electron-channel-doctor analysis:
 * 
 * ✅ USED CHANNELS (properly whitelisted):
 * - get-app-version
 * - get-platform  
 * - save-user-data
 * - load-file
 * - open-dialog
 * 
 * ❌ MISSING CHANNELS (used but not whitelisted):
 * - upload-to-cloud
 * - analyze-project-structure
 * 
 * ⚠️  UNUSED CHANNELS (whitelisted but not used):
 * - unused-channel
 * 
 * Running `electron-channel-doctor check` would show:
 * - 5 channels properly configured
 * - 2 missing from whitelist  
 * - 1 unused in whitelist
 */ 