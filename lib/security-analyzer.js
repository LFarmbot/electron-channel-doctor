/**
 * Electron IPC Security Analyzer
 * Detects security vulnerabilities in Electron IPC communication
 * Based on 2024 security research and CVE analysis
 */

const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');
const { getAstFromFile } = require('./ast-parser');
const traverse = require('@babel/traverse').default;

class SecurityAnalyzer {
    constructor(options = {}) {
        this.options = {
            projectRoot: options.projectRoot || process.cwd(),
            mainProcess: options.mainProcess || ['main.js', 'electron/**/*.js', 'src/main/**/*.js'],
            rendererProcess: options.rendererProcess || ['src/**/*.js', 'public/**/*.js', 'renderer/**/*.js'],
            preloadScripts: options.preloadScripts || ['preload.js', 'electron/preload.js', 'src/preload/**/*.js'],
            verbose: options.verbose || false,
            ignore: options.ignore || [
                '**/node_modules/**',
                '**/dist/**',
                '**/build/**',
                '**/.git/**'
            ],
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
        const ipcPatternIssues = await this.analyzeIPCPatterns();

        // Combine all issues
        this.categorizeVulnerabilities(mainProcessIssues, vulnerabilities);
        this.categorizeVulnerabilities(preloadIssues, vulnerabilities);
        this.categorizeVulnerabilities(rendererIssues, vulnerabilities);
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
        const files = await this.findFiles(this.options.mainProcess);

        for (const file of files) {
            const parsedFile = getAstFromFile(file);
            if (!parsedFile) continue;
            const { ast, code } = parsedFile;

            const relativePath = path.relative(this.options.projectRoot, file);

            // Check for insecure openExternal calls
            const openExternalIssues = this.findInsecureOpenExternal(ast, relativePath);
            issues.push(...openExternalIssues);

            // Check for unvalidated IPC handlers
            const ipcHandlers = this.findIPCHandlers(ast, code);
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

                if (!handler.hasSenderValidation) {
                    issues.push({
                        type: 'missing-sender-validation',
                        severity: 'medium',
                        file: relativePath,
                        line: handler.line,
                        channel: handler.channel,
                        message: `IPC handler '${handler.channel}' is missing sender frame validation`,
                        recommendation: 'Validate event.senderFrame to prevent unauthorized access',
                        cve: 'CVE-2022-29247 vulnerability pattern'
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

            // Check for insecure BrowserWindow configurations
            const browserWindowIssues = this.findInsecureBrowserWindowConfigs(ast, relativePath);
            issues.push(...browserWindowIssues);
        }

        return issues;
    }

    /**
     * Analyze preload scripts for security issues
     */
    async analyzePreloadScripts() {
        const issues = [];
        const files = await this.findFiles(this.options.preloadScripts);

        for (const file of files) {
            const content = await fs.readFile(file, 'utf8');
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
        const files = await this.findFiles(this.options.rendererProcess);

        for (const file of files) {
            // Skip node_modules and build directories
            if (file.includes('node_modules') || file.includes('dist') || file.includes('build')) {
                continue;
            }

            const content = await fs.readFile(file, 'utf8');
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
     * Analyze IPC communication patterns
     */
    async analyzeIPCPatterns() {
        const issues = [];
        const [mainFiles, rendererFiles] = await Promise.all([
            this.findFiles(this.options.mainProcess),
            this.findFiles(this.options.rendererProcess)
        ]);
        const allFiles = [...mainFiles, ...rendererFiles];

        for (const file of allFiles) {
            const content = await fs.readFile(file, 'utf8');
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
    async findFiles(patterns) {
        const patternArray = Array.isArray(patterns) ? patterns : [patterns];

        const allFilePromises = patternArray.map(pattern => {
            const fullPath = path.join(this.options.projectRoot, pattern);
            return glob(fullPath, {
                ignore: this.options.ignore
            });
        });

        const filesPerPattern = await Promise.all(allFilePromises);
        const files = filesPerPattern.flat();

        return [...new Set(files)]; // Remove duplicates
    }

    /**
     * Helper: Find IPC handlers in code using AST
     */
    findIPCHandlers(ast, code) {
        const handlers = [];
        traverse(ast, {
            CallExpression(nodePath) {
                const callee = nodePath.get('callee');
                if (
                    callee.isMemberExpression() &&
                    callee.get('object').isIdentifier({ name: 'ipcMain' }) &&
                    (callee.get('property').isIdentifier({ name: 'on' }) || callee.get('property').isIdentifier({ name: 'handle' }))
                ) {
                    const args = nodePath.get('arguments');
                    if (args.length > 1 && args[0].isStringLiteral()) {
                        const channel = args[0].node.value;
                        const handlerFunc = args[1];
                        let hasSenderValidation = false;
                        const handlerNode = handlerFunc.node;
                        const handlerCode = code.substring(handlerNode.start, handlerNode.end);

                        if (handlerFunc.isArrowFunctionExpression() || handlerFunc.isFunctionExpression()) {
                            const eventParam = handlerFunc.get('params')[0];
                            if (eventParam && eventParam.isIdentifier()) {
                                const eventParamName = eventParam.node.name;
                                handlerFunc.traverse({
                                    MemberExpression(memberPath) {
                                        const obj = memberPath.get('object');
                                        if (obj.isIdentifier({ name: eventParamName }) && 
                                            (memberPath.get('property').isIdentifier({ name: 'sender' }) || memberPath.get('property').isIdentifier({ name: 'senderFrame' }))) {
                                            hasSenderValidation = true;
                                        }
                                    }
                                });
                            }
                        }

                        handlers.push({
                            channel: channel,
                            code: handlerCode,
                            line: nodePath.node.loc.start.line,
                            hasSenderValidation: hasSenderValidation
                        });
                    }
                }
            }
        });
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
     * Helper: Find insecure `shell.openExternal` calls using AST
     */
    findInsecureOpenExternal(ast, filePath) {
        const issues = [];

        traverse(ast, {
            CallExpression(nodePath) {
                const callee = nodePath.get('callee');
                if (callee.isMemberExpression() && callee.get('object').isIdentifier({ name: 'shell' }) && callee.get('property').isIdentifier({ name: 'openExternal' })) {
                    const args = nodePath.get('arguments');
                    if (args.length > 0 && !args[0].isStringLiteral()) {
                        issues.push({
                            type: 'insecure-open-external',
                            severity: 'high',
                            file: filePath,
                            line: nodePath.node.loc.start.line,
                            message: 'Potentially insecure use of shell.openExternal with a variable.',
                            recommendation: 'Ensure that only static, trusted URLs are passed to shell.openExternal. User-provided content should be validated against a strict allowlist.'
                        });
                    }
                }
            }
        });

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
     * Helper: Find insecure BrowserWindow configurations using AST
     */
    findInsecureBrowserWindowConfigs(ast, filePath) {
        const issues = [];
        const insecureSettings = {
            nodeIntegration: 'critical',
            contextIsolation: 'critical',
            webSecurity: 'high',
            enableRemoteModule: 'high',
            webviewTag: 'high'
        };

        traverse(ast, {
            NewExpression(nodePath) {
                if (nodePath.get('callee').isIdentifier({ name: 'BrowserWindow' })) {
                    const args = nodePath.get('arguments');
                    if (args.length > 0 && args[0].isObjectExpression()) {
                        const webPreferences = args[0]
                            .get('properties')
                            .find(p => p.isObjectProperty() && p.get('key').isIdentifier({ name: 'webPreferences' }));

                        if (webPreferences) {
                            webPreferences.get('value').get('properties').forEach(prop => {
                                const key = prop.get('key').node.name;
                                const valueNode = prop.get('value');
                                if (insecureSettings[key] && valueNode.isBooleanLiteral({ value: true })) {
                                    issues.push({
                                        type: `insecure-${key.toLowerCase()}`,
                                        severity: insecureSettings[key],
                                        file: filePath,
                                        line: prop.node.loc.start.line,
                                        message: `${key} enabled - major security risk`,
                                        recommendation: `Set ${key}: false for security`
                                    });
                                }
                                if (key === 'contextIsolation' && valueNode.isBooleanLiteral({ value: false })) {
                                     issues.push({
                                        type: 'disabled-context-isolation',
                                        severity: 'critical',
                                        file: filePath,
                                        line: prop.node.loc.start.line,
                                        message: 'contextIsolation disabled - allows context bypass attacks',
                                        recommendation: 'Enable contextIsolation for security'
                                    });
                                }
                                if (key === 'webSecurity' && valueNode.isBooleanLiteral({ value: false })) {
                                     issues.push({
                                        type: 'disabled-web-security',
                                        severity: 'high',
                                        file: filePath,
                                        line: prop.node.loc.start.line,
                                        message: 'webSecurity disabled - allows XSS and other attacks',
                                        recommendation: 'Keep webSecurity enabled'
                                    });
                                }
                            });
                        }
                    }
                }
            }
        });

        return issues;
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