const fs = require('fs');
const path = require('path');
const glob = require('glob');

/**
 * Electron Channel Doctor - Main Library
 * Automate Electron IPC invoke channel management and prevent 'Invalid invoke channel' errors
 */

class ChannelDoctor {
    constructor(options = {}) {
        this.options = {
            preloadPath: options.preloadPath || 'electron/preload.js',
            jsSource: options.jsSource || 'public/js/**/*.js',
            projectRoot: options.projectRoot || process.cwd(),
            verbose: options.verbose || false,
            ...options
        };
    }

    /**
     * Get current whitelisted channels from preload.js
     */
    getCurrentWhitelist() {
        const preloadPath = path.join(this.options.projectRoot, this.options.preloadPath);
        
        if (!fs.existsSync(preloadPath)) {
            throw new Error(`Preload file not found at: ${preloadPath}`);
        }

        const preloadContent = fs.readFileSync(preloadPath, 'utf8');
        
        // Look for validInvokeChannels array
        const match = preloadContent.match(/validInvokeChannels\s*=\s*\[([\s\S]*?)\]/);
        if (!match) {
            throw new Error('Could not find validInvokeChannels array in preload.js');
        }
        
        const channelsString = match[1];
        const channels = [];
        const regex = /['"]([^'"]+)['"][,\s]/g;
        let match2;
        
        while ((match2 = regex.exec(channelsString)) !== null) {
            channels.push(match2[1]);
        }
        
        return channels.sort();
    }

    /**
     * Scan all JS files for invoke calls
     */
    scanForInvokeCalls() {
        const foundChannels = new Set();
        const jsPattern = path.join(this.options.projectRoot, this.options.jsSource);
        
        const files = glob.sync(jsPattern, { 
            ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'] 
        });

        if (this.options.verbose) {
            console.log(`Scanning ${files.length} JavaScript files...`);
        }

        for (const filePath of files) {
            this.scanFile(filePath, foundChannels);
        }
        
        return Array.from(foundChannels).sort();
    }

    /**
     * Scan a single file for invoke calls
     */
    scanFile(filePath, foundChannels) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const regex = /electronAPI\.invoke\s*\(\s*['"]([^'"]+)['"]/g;
            let match;
            
            while ((match = regex.exec(content)) !== null) {
                foundChannels.add(match[1]);
                
                if (this.options.verbose) {
                    const relativePath = path.relative(this.options.projectRoot, filePath);
                    console.log(`  Found channel '${match[1]}' in ${relativePath}`);
                }
            }
        } catch (error) {
            if (this.options.verbose) {
                console.warn(`Could not read file: ${filePath} - ${error.message}`);
            }
        }
    }

    /**
     * Main analysis function
     */
    analyze() {
        try {
            const whitelisted = this.getCurrentWhitelist();
            const found = this.scanForInvokeCalls();
            
            const missing = found.filter(channel => !whitelisted.includes(channel));
            const unused = whitelisted.filter(channel => !found.includes(channel));
            
            return {
                success: true,
                summary: {
                    foundChannels: found.length,
                    whitelistedChannels: whitelisted.length,
                    missingFromWhitelist: missing.length,
                    unusedInWhitelist: unused.length
                },
                channels: {
                    found,
                    whitelisted,
                    missing,
                    unused
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                channels: {
                    found: [],
                    whitelisted: [],
                    missing: [],
                    unused: []
                }
            };
        }
    }

    /**
     * Generate a fixed preload.js content
     */
    generateFixedPreload() {
        const analysis = this.analyze();
        if (!analysis.success) {
            throw new Error(analysis.error);
        }

        const preloadPath = path.join(this.options.projectRoot, this.options.preloadPath);
        const preloadContent = fs.readFileSync(preloadPath, 'utf8');
        
        // Create the new channel list (combine found + keep some common infrastructure ones)
        const infrastructureChannels = [
            'get-platform',
            'get-user-data-path',
            'convert-to-app-url'
        ];
        
        const allChannels = [...new Set([
            ...analysis.channels.found,
            ...infrastructureChannels.filter(ch => analysis.channels.whitelisted.includes(ch))
        ])].sort();

        // Format the channels nicely
        const channelsString = allChannels.map(ch => `            '${ch}'`).join(',\n');
        
        // Replace the validInvokeChannels array
        const newContent = preloadContent.replace(
            /validInvokeChannels\s*=\s*\[([\s\S]*?)\]/,
            `validInvokeChannels = [\n${channelsString}\n        ]`
        );

        return {
            content: newContent,
            channels: allChannels,
            removed: analysis.channels.unused.filter(ch => !infrastructureChannels.includes(ch))
        };
    }

    /**
     * Auto-fix the preload.js file
     */
    fix() {
        const fixed = this.generateFixedPreload();
        const preloadPath = path.join(this.options.projectRoot, this.options.preloadPath);
        
        // Create backup
        const backupPath = `${preloadPath}.backup.${Date.now()}`;
        fs.copyFileSync(preloadPath, backupPath);
        
        // Write the fixed version
        fs.writeFileSync(preloadPath, fixed.content, 'utf8');
        
        return {
            success: true,
            backupPath,
            channelsAdded: fixed.channels.length - (fixed.channels.length - fixed.removed.length),
            channelsRemoved: fixed.removed,
            totalChannels: fixed.channels.length
        };
    }
}

module.exports = {
    ChannelDoctor,
    analyze: (options) => new ChannelDoctor(options).analyze(),
    fix: (options) => new ChannelDoctor(options).fix()
}; 