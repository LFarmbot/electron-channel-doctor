/**
 * Electron IPC Security Analyzer
 * Detects security vulnerabilities in Electron IPC communication
 * Based on 2024 security research and CVE analysis
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

class SecurityAnalyzer {
    constructor(options = {}) {
        this.options = {
            projectRoot: options.projectRoot || process.cwd(),
            mainProcess: options.mainProcess || ['main.js', 'electron/**/*.js', 'src/main/**/*.js'],
            rendererProcess: options.rendererProcess || ['src/**/*.js', 'public/**/*.js', 'renderer/**/*.js'],
            preloadScripts: options.preloadScripts || ['preload.js', 'electron/preload.js', 'src/preload/**/*.js'],
            verbose: options.verbose || false,
            ...options
        };

        // Dangerous Node.js APIs that shouldn't be exposed
        this.dangerousAPIs = [
            'child_process', 'fs', 'os', 'path', 'crypto', 'http', 'https',
            'net', 'tls', 'dns', 'dgram', 'cluster', 'process.env',
            'eval', 'Function', 'require', '__dirname', '__filename'
        ];

        // Patterns that indicate sensitive data
        this.sensitivePatterns = [
            /password/i, /secret/i, /token/i, /api[_-]?key/i, /credential/i,
            /private[_-]?key/i, /auth/i, /session/i, /cookie/i, /bearer/i
        ];

        // Context isolation bypass patterns
        this.bypassPatterns = [
            /window\.__ELECTRON__/,
            /global\.__ELECTRON__/,
            /nodeIntegration\s*:\s*true/,
            /contextIsolation\s*:\s*false/,
            /enableRemoteModule\s*:\s*true/,
            /webSecurity\s*:\s*false/
        ];
    }

    /**
     * Main security analysis function
     */
    async analyze() {
        console.log('🔒 Analyzing Electron IPC security vulnerabilities...\n');

        const vulnerabilities = {
            critical: [],
            high: [],
            medium: [],
            low: []
        };

        // Analyze different aspects
        const mainProcessIssues = await this.analyzeMainProcess();
        const preloadIssues = await this.analyzePreloadScripts();
        const rendererIssues = await this.analyzeRendererProcess();
        const configIssues = await this.analyzeElectronConfig();
        const ipcPatternIssues = await this.analyzeIPCPatterns();

        // Combine all issues
        this.categorizeVulnerabilities(mainProcessIssues, vulnerabilities);
        this.categorizeVulnerabilities(preloadIssues, vulnerabilities);
        this.categorizeVulnerabilities(rendererIssues, vulnerabilities);
        this.categorizeVulnerabilities(configIssues, vulnerabilities);
        this.categorizeVulnerabilities(ipcPatternIssues, vulnerabilities);

        return {
            success: true,
            vulnerabilities,
            summary: {
                critical: vulnerabilities.critical.length,
                high: vulnerabilities.high.length,
                medium: vulnerabilities.medium.length,
                low: vulnerabilities.low.length,
                total: vulnerabilities.critical.length + vulnerabilities.high.length + 
                       vulnerabilities.medium.length + vulnerabilities.low.length
            },
            securityScore: this.calculateSecurityScore(vulnerabilities)
        };
    }

    /**
     * Analyze main process for security issues
     */
    async analyzeMainProcess() {
        const issues = [];
        const files = this.findFiles(this.options.mainProcess);

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            const relativePath = path.relative(this.options.projectRoot, file);

            // Check for unvalidated IPC handlers
            const ipcHandlers = this.findIPCHandlers(content);
            for (const handler of ipcHandlers) {
                if (!this.hasInputValidation(handler.code)) {
                    issues.push({
                        type: 'unvalidated-ipc-handler',
                        severity: 'high',
                        file: relativePath,
                        line: handler.line,
                        channel: handler.channel,
                        message: `IPC handler '${handler.channel}' lacks input validation`,
                        recommendation: 'Add input validation to prevent injection attacks',
                        cve: 'Related to CVE-2022-29247'
                    });
                }

                // Check if handler exposes dangerous APIs
                for (const api of this.dangerousAPIs) {
                    if (handler.code.includes(api)) {
                        issues.push({
                            type: 'dangerous-api-exposure',
                            severity: 'critical',
                            file: relativePath,
                            line: handler.line,
                            channel: handler.channel,
                            api: api,
                            message: `IPC handler '${handler.channel}' exposes dangerous API: ${api}`,
                            recommendation: 'Never expose Node.js system APIs directly via IPC',
                            cve: 'Common attack vector in Electron apps'
                        });
                    }
                }

                // Check for sensitive data exposure
                if (this.containsSensitiveData(handler.code)) {
                    issues.push({
                        type: 'sensitive-data-exposure',
                        severity: 'high',
                        file: relativePath,
                        line: handler.line,
                        channel: handler.channel,
                        message: `IPC handler '${handler.channel}' may expose sensitive data`,
                        recommendation: 'Sanitize responses and avoid sending credentials via IPC'
                    });
                }
            }

            // Check for missing sender validation
            const missingValidation = this.findMissingSenderValidation(content);
            for (const issue of missingValidation) {
                issues.push({
                    type: 'missing-sender-validation',
                    severity: 'medium',
                    file: relativePath,
                    line: issue.line,
                    message: 'IPC handler missing sender frame validation',
                    recommendation: 'Validate event.senderFrame to prevent unauthorized access',
                    cve: 'CVE-2022-29247 vulnerability pattern'
                });
            }
        }

        return issues;
    }

    /**
     * Analyze preload scripts for security issues
     */
    async analyzePreloadScripts() {
        const issues = [];
        const files = this.findFiles(this.options.preloadScripts);

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            const relativePath = path.relative(this.options.projectRoot, file);

            // Check for improper contextBridge usage
            if (!content.includes('contextBridge')) {
                issues.push({
                    type: 'missing-context-bridge',
                    severity: 'critical',
                    file: relativePath,
                    message: 'Preload script not using contextBridge API',
                    recommendation: 'Use contextBridge.exposeInMainWorld for secure IPC'
                });
            }

            // Check for exposed dangerous APIs
            const exposedAPIs = this.findExposedAPIs(content);
            for (const api of exposedAPIs) {
                if (this.dangerousAPIs.some(dangerous => api.name.includes(dangerous))) {
                    issues.push({
                        type: 'dangerous-api-in-preload',
                        severity: 'critical',
                        file: relativePath,
                        line: api.line,
                        api: api.name,
                        message: `Dangerous API '${api.name}' exposed in preload script`,
                        recommendation: 'Never expose Node.js APIs directly to renderer'
                    });
                }
            }

            // Check for missing channel whitelisting
            if (!this.hasChannelWhitelisting(content)) {
                issues.push({
                    type: 'missing-channel-whitelist',
                    severity: 'high',
                    file: relativePath,
                    message: 'Preload script lacks channel whitelisting',
                    recommendation: 'Implement channel validation to prevent unauthorized IPC'
                });
            }
        }

        return issues;
    }

    /**
     * Analyze renderer process for security issues
     */
    async analyzeRendererProcess() {
        const issues = [];
        const files = this.findFiles(this.options.rendererProcess);

        for (const file of files) {
            // Skip node_modules and build directories
            if (file.includes('node_modules') || file.includes('dist') || file.includes('build')) {
                continue;
            }

            const content = fs.readFileSync(file, 'utf8');
            const relativePath = path.relative(this.options.projectRoot, file);

            // Check for context isolation bypasses
            for (const pattern of this.bypassPatterns) {
                const matches = content.match(pattern);
                if (matches) {
                    issues.push({
                        type: 'context-isolation-bypass',
                        severity: 'critical',
                        file: relativePath,
                        pattern: pattern.toString(),
                        message: 'Potential context isolation bypass detected',
                        recommendation: 'Enable context isolation and remove bypass attempts'
                    });
                }
            }

            // Check for direct window manipulation
            if (content.includes('window.electronAPI = ') || content.includes('window.api = ')) {
                issues.push({
                    type: 'direct-window-manipulation',
                    severity: 'high',
                    file: relativePath,
                    message: 'Direct window object manipulation detected',
                    recommendation: 'Use contextBridge in preload script instead'
                });
            }
        }

        return issues;
    }

    /**
     * Analyze Electron configuration
     */
    async analyzeElectronConfig() {
        const issues = [];
        const mainFiles = this.findFiles(this.options.mainProcess);

        for (const file of mainFiles) {
            const content = fs.readFileSync(file, 'utf8');
            const relativePath = path.relative(this.options.projectRoot, file);

            // Find BrowserWindow configurations
            const windowConfigs = this.findBrowserWindowConfigs(content);
            
            for (const config of windowConfigs) {
                // Check for insecure webPreferences
                if (config.code.includes('nodeIntegration: true')) {
                    issues.push({
                        type: 'insecure-node-integration',
                        severity: 'critical',
                        file: relativePath,
                        line: config.line,
                        message: 'nodeIntegration enabled - major security risk',
                        recommendation: 'Set nodeIntegration: false and use contextBridge'
                    });
                }

                if (config.code.includes('contextIsolation: false')) {
                    issues.push({
                        type: 'disabled-context-isolation',
                        severity: 'critical',
                        file: relativePath,
                        line: config.line,
                        message: 'contextIsolation disabled - allows context bypass attacks',
                        recommendation: 'Enable contextIsolation for security',
                        cve: 'Enables attacks like CVE-2022-29247'
                    });
                }

                if (config.code.includes('webSecurity: false')) {
                    issues.push({
                        type: 'disabled-web-security',
                        severity: 'high',
                        file: relativePath,
                        line: config.line,
                        message: 'Web security disabled - allows XSS and other attacks',
                        recommendation: 'Keep webSecurity enabled'
                    });
                }

                if (config.code.includes('enableRemoteModule: true')) {
                    issues.push({
                        type: 'remote-module-enabled',
                        severity: 'high',
                        file: relativePath,
                        line: config.line,
                        message: 'Remote module enabled - deprecated and insecure',
                        recommendation: 'Migrate away from @electron/remote'
                    });
                }
            }
        }

        return issues;
    }

    /**
     * Analyze IPC communication patterns
     */
    async analyzeIPCPatterns() {
        const issues = [];
        const allFiles = [...this.findFiles(this.options.mainProcess), 
                          ...this.findFiles(this.options.rendererProcess)];

        for (const file of allFiles) {
            const content = fs.readFileSync(file, 'utf8');
            const relativePath = path.relative(this.options.projectRoot, file);

            // Check for synchronous IPC (performance issue)
            if (content.includes('ipcRenderer.sendSync') || content.includes('ipcMain.on') && content.includes('event.returnValue')) {
                issues.push({
                    type: 'synchronous-ipc',
                    severity: 'medium',
                    file: relativePath,
                    message: 'Synchronous IPC detected - blocks main process',
                    recommendation: 'Use async IPC (invoke/handle) for better performance'
                });
            }

            // Check for large data transfers
            const largeDataPatterns = [
                /send\([^)]*JSON\.stringify\([^)]*\)/,
                /invoke\([^)]*Buffer/,
                /send\([^)]*\.length\s*>\s*\d{6}/
            ];

            for (const pattern of largeDataPatterns) {
                if (pattern.test(content)) {
                    issues.push({
                        type: 'large-data-transfer',
                        severity: 'medium',
                        file: relativePath,
                        message: 'Potential large data transfer via IPC',
                        recommendation: 'Consider using MessagePort or shared memory for large data'
                    });
                }
            }

            // Check for missing error handling
            const ipcCalls = content.match(/\.invoke\s*\([^)]+\)/g) || [];
            for (const call of ipcCalls) {
                if (!content.includes('.catch') && !content.includes('try')) {
                    issues.push({
                        type: 'missing-error-handling',
                        severity: 'low',
                        file: relativePath,
                        message: 'IPC call without error handling',
                        recommendation: 'Add .catch() or try/catch for IPC calls'
                    });
                }
            }
        }

        return issues;
    }

    /**
     * Helper: Find files matching patterns
     */
    findFiles(patterns) {
        const files = [];
        const patternArray = Array.isArray(patterns) ? patterns : [patterns];

        for (const pattern of patternArray) {
            const fullPath = path.join(this.options.projectRoot, pattern);
            const found = glob.sync(fullPath, {
                ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
            });
            files.push(...found);
        }

        return [...new Set(files)]; // Remove duplicates
    }

    /**
     * Helper: Find IPC handlers in code
     */
    findIPCHandlers(content) {
        const handlers = [];
        const patterns = [
            /ipcMain\.(on|handle)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(async\s*)?\s*\([^)]*\)\s*=>\s*{([^}]+)}/g,
            /ipcMain\.(on|handle)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(async\s*)?\s*function[^{]*{([^}]+)}/g
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                handlers.push({
                    channel: match[2],
                    code: match[4],
                    line: content.substring(0, match.index).split('\n').length
                });
            }
        }

        return handlers;
    }

    /**
     * Helper: Check if code has input validation
     */
    hasInputValidation(code) {
        const validationPatterns = [
            /if\s*\([^)]*typeof/,
            /if\s*\([^)]*instanceof/,
            /if\s*\([^)]*\.length/,
            /validateInput/i,
            /checkParam/i,
            /assert/i,
            /throw\s+new\s+Error/
        ];

        return validationPatterns.some(pattern => pattern.test(code));
    }

    /**
     * Helper: Check for sensitive data patterns
     */
    containsSensitiveData(code) {
        return this.sensitivePatterns.some(pattern => pattern.test(code));
    }

    /**
     * Helper: Find missing sender validation
     */
    findMissingSenderValidation(content) {
        const issues = [];
        const handlerPattern = /ipcMain\.(on|handle)\s*\([^)]+\)/g;
        let match;

        while ((match = handlerPattern.exec(content)) !== null) {
            const startIndex = match.index;
            const endIndex = content.indexOf('}', startIndex);
            const handlerCode = content.substring(startIndex, endIndex);

            if (!handlerCode.includes('senderFrame') && !handlerCode.includes('sender.id')) {
                issues.push({
                    line: content.substring(0, startIndex).split('\n').length
                });
            }
        }

        return issues;
    }

    /**
     * Helper: Find exposed APIs in preload
     */
    findExposedAPIs(content) {
        const apis = [];
        const pattern = /exposeInMainWorld\s*\([^,]+,\s*{([^}]+)}/g;
        let match;

        while ((match = pattern.exec(content)) !== null) {
            const apisBlock = match[1];
            const apiPattern = /(\w+)\s*:/g;
            let apiMatch;

            while ((apiMatch = apiPattern.exec(apisBlock)) !== null) {
                apis.push({
                    name: apiMatch[1],
                    line: content.substring(0, match.index).split('\n').length
                });
            }
        }

        return apis;
    }

    /**
     * Helper: Check for channel whitelisting
     */
    hasChannelWhitelisting(content) {
        return content.includes('validChannels') || 
               content.includes('allowedChannels') ||
               content.includes('whitelist');
    }

    /**
     * Helper: Find BrowserWindow configurations
     */
    findBrowserWindowConfigs(content) {
        const configs = [];
        const pattern = /new\s+BrowserWindow\s*\(\s*{([^}]+webPreferences[^}]+)}/g;
        let match;

        while ((match = pattern.exec(content)) !== null) {
            configs.push({
                code: match[1],
                line: content.substring(0, match.index).split('\n').length
            });
        }

        return configs;
    }

    /**
     * Categorize vulnerabilities by severity
     */
    categorizeVulnerabilities(issues, vulnerabilities) {
        for (const issue of issues) {
            vulnerabilities[issue.severity].push(issue);
        }
    }

    /**
     * Calculate security score (0-100)
     */
    calculateSecurityScore(vulnerabilities) {
        let score = 100;

        // Deduct points based on severity
        score -= vulnerabilities.critical.length * 25;
        score -= vulnerabilities.high.length * 15;
        score -= vulnerabilities.medium.length * 5;
        score -= vulnerabilities.low.length * 2;

        return Math.max(0, Math.round(score));
    }

    /**
     * Generate security report
     */
    generateReport(analysis) {
        const report = {
            timestamp: new Date().toISOString(),
            securityScore: analysis.securityScore,
            summary: analysis.summary,
            vulnerabilities: analysis.vulnerabilities,
            recommendations: this.generateRecommendations(analysis),
            resources: [
                'https://www.electronjs.org/docs/latest/tutorial/security',
                'https://github.com/electron/electron/security/advisories',
                'OWASP Electron Security Guidelines'
            ]
        };

        return report;
    }

    /**
     * Generate actionable recommendations
     */
    generateRecommendations(analysis) {
        const recommendations = [];

        if (analysis.vulnerabilities.critical.length > 0) {
            recommendations.push({
                priority: 'CRITICAL',
                action: 'Fix critical vulnerabilities immediately',
                description: 'Critical vulnerabilities can lead to RCE or data theft'
            });
        }

        const hasNodeIntegration = analysis.vulnerabilities.critical.some(v => 
            v.type === 'insecure-node-integration');
        if (hasNodeIntegration) {
            recommendations.push({
                priority: 'CRITICAL',
                action: 'Disable nodeIntegration and enable contextIsolation',
                description: 'This is the most important security configuration'
            });
        }

        const hasDangerousAPIs = analysis.vulnerabilities.critical.some(v => 
            v.type === 'dangerous-api-exposure');
        if (hasDangerousAPIs) {
            recommendations.push({
                priority: 'HIGH',
                action: 'Remove direct Node.js API exposure',
                description: 'Use safe wrappers in main process instead'
            });
        }

        if (analysis.securityScore < 50) {
            recommendations.push({
                priority: 'HIGH',
                action: 'Conduct security audit',
                description: 'Consider professional security review for production apps'
            });
        }

        return recommendations;
    }
}

module.exports = { SecurityAnalyzer }; 