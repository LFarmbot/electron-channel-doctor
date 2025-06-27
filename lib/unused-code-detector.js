const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
const babelParser = require('@babel/parser');
const crypto = require('crypto');
const { getAstFromFile } = require('./ast-parser');
const traverse = require('@babel/traverse').default;

/**
 * Unused Code Detector - Advanced static analysis for dead code elimination
 * Part of the Script Doctor suite within electron-channel-doctor
 */

class UnusedCodeDetector {
    constructor(options = {}) {
        this.options = {
            projectRoot: options.projectRoot || process.cwd(),
            jsPattern: options.jsPattern || '**/*.{js,jsx,ts,tsx}',
            cssPattern: options.cssPattern || '**/*.{css,scss,sass}',
            htmlPattern: options.htmlPattern || '**/*.{html,htm}',
            ignore: options.ignore || [
                '**/node_modules/**',
                '**/dist/**',
                '**/build/**',
                '**/.git/**',
                '**/*.min.js',
                '**/*.bundle.js'
            ],
            verbose: options.verbose || false,
            ...options
        };
        
        this.analysisResults = {
            unusedFunctions: [],
            unusedVariables: [],
            unusedImports: [],
            unusedCssClasses: [],
            deadCodePaths: [],
            duplicateCode: [],
            complexityIssues: [],
            unusedIpcHandlers: [],
        };
    }

    /**
     * Main analysis entry point
     */
    async analyzeProject() {
        console.log('🔍 Script Doctor: Analyzing project for unused code...\n');
        
        const files = this.scanProjectFiles();
        
        await Promise.all([
            this.detectUnusedFunctions(files.js),
            this.detectUnusedVariables(files.js),
            this.detectUnusedImports(files.js),
            this.detectUnusedCssClasses(files.css, files.html, files.js),
            this.detectDeadCodePaths(files.js),
            this.detectDuplicateCode(files.js),
            this.analyzeComplexity(files.js),
            this.detectUnusedIpcHandlers(files.js),
        ]);

        return this.generateReport();
    }

    /**
     * Scan all project files
     */
    scanProjectFiles() {
        const defaultIgnore = [
            '/node_modules/',
            '/dist/',
            '/build/',
        ];

        let jsFiles = glob.sync(this.options.jsPattern, {
            cwd: this.options.projectRoot,
            absolute: true,
        });
        jsFiles = jsFiles.filter(file => !defaultIgnore.some(pattern => file.includes(pattern)));
        
        let cssFiles = glob.sync(this.options.cssPattern, {
            cwd: this.options.projectRoot,
            absolute: true,
        });
        cssFiles = cssFiles.filter(file => !defaultIgnore.some(pattern => file.includes(pattern)));

        let htmlFiles = glob.sync(this.options.htmlPattern, {
            cwd: this.options.projectRoot,
            absolute: true,
        });
        htmlFiles = htmlFiles.filter(file => !defaultIgnore.some(pattern => file.includes(pattern)));


        if (this.options.verbose) {
            console.log(`📊 Found ${jsFiles.length} JS files, ${cssFiles.length} CSS files, ${htmlFiles.length} HTML files`);
        }

        return {
            js: jsFiles,
            css: cssFiles,
            html: htmlFiles
        };
    }

    /**
     * Detect unused functions across the codebase
     */
    async detectUnusedFunctions(jsFiles) {
        if (!jsFiles) return;
        const definedFunctions = new Map();
        const usedFunctions = new Set();

        const fileContents = await Promise.all(
            jsFiles.map(filePath => fs.readFile(filePath, 'utf8'))
        );

        // First pass: Find all function definitions
        for (let i = 0; i < jsFiles.length; i++) {
            const filePath = jsFiles[i];
            const content = fileContents[i];
            
            // Function declarations
            const functionDeclarations = content.matchAll(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g);
            for (const match of functionDeclarations) {
                definedFunctions.set(match[1], {
                    name: match[1],
                    file: filePath,
                    line: this.getLineNumber(content, match.index),
                    type: 'function'
                });
            }

            // Arrow functions and function expressions
            const arrowFunctions = content.matchAll(/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/g);
            for (const match of arrowFunctions) {
                definedFunctions.set(match[1], {
                    name: match[1],
                    file: filePath,
                    line: this.getLineNumber(content, match.index),
                    type: 'arrow'
                });
            }

            // Method definitions in classes/objects
            const methods = content.matchAll(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{/g);
            for (const match of methods) {
                if (!['if', 'for', 'while', 'switch', 'catch'].includes(match[1])) {
                    definedFunctions.set(match[1], {
                        name: match[1],
                        file: filePath,
                        line: this.getLineNumber(content, match.index),
                        type: 'method'
                    });
                }
            }
        }

        // Second pass: Find function usages
        for (const content of fileContents) {
            for (const funcName of definedFunctions.keys()) {
                // Look for function calls
                const callRegex = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
                if (callRegex.test(content)) {
                    usedFunctions.add(funcName);
                }
                
                // Look for function references (without calls)
                const refRegex = new RegExp(`\\b${funcName}\\b(?!\\s*[:(=])`, 'g');
                if (refRegex.test(content)) {
                    usedFunctions.add(funcName);
                }
            }
        }

        // Find unused functions
        for (const [funcName, funcInfo] of definedFunctions) {
            if (!usedFunctions.has(funcName)) {
                this.analysisResults.unusedFunctions.push(funcInfo);
            }
        }

        if (this.options.verbose) {
            console.log(`🔍 Found ${this.analysisResults.unusedFunctions.length} unused functions`);
        }
    }

    /**
     * Detect unused variables.
     * @todo Implement this feature.
     */
    async detectUnusedVariables(jsFiles) {
        if (!jsFiles) return;
        if (this.options.verbose) {
            console.log('📉 Skipping unused variable detection (not implemented).');
        }
        // Placeholder to prevent crashes
        return Promise.resolve();
    }

    /**
     * Detect unused CSS classes
     */
    async detectUnusedCssClasses(cssFiles, htmlFiles, jsFiles) {
        if (!cssFiles || !htmlFiles || !jsFiles) return;
        const definedClasses = new Set();
        const usedClasses = new Set();

        const [cssContents, htmlContents, jsContents] = await Promise.all([
            Promise.all(cssFiles.map(filePath => fs.readFile(filePath, 'utf8'))),
            Promise.all(htmlFiles.map(filePath => fs.readFile(filePath, 'utf8'))),
            Promise.all(jsFiles.map(filePath => fs.readFile(filePath, 'utf8')))
        ]);

        // Extract CSS classes
        for (const content of cssContents) {
            const classes = content.matchAll(/\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g);
            for (const match of classes) {
                definedClasses.add(match[1]);
            }
        }

        // Find class usage in HTML
        for (const content of htmlContents) {
            const classAttrs = content.matchAll(/class\s*=\s*["']([^"']+)["']/g);
            for (const match of classAttrs) {
                const classes = match[1].split(/\s+/);
                classes.forEach(cls => usedClasses.add(cls));
            }
        }

        // Find class usage in JavaScript
        for (const content of jsContents) {
            // className attributes
            const classNames = content.matchAll(/className\s*[=:]\s*["']([^"']+)["']/g);
            for (const match of classNames) {
                const classes = match[1].split(/\s+/);
                classes.forEach(cls => usedClasses.add(cls));
            }

            // classList operations
            const classList = content.matchAll(/classList\.[add|remove|toggle|contains]\s*\(\s*["']([^"']+)["']/g);
            for (const match of classList) {
                usedClasses.add(match[1]);
            }

            // getElementById, querySelector, etc.
            const selectors = content.matchAll(/(?:getElementById|querySelector|querySelectorAll)\s*\(\s*["']\.?([^"']+)["']/g);
            for (const match of selectors) {
                usedClasses.add(match[1].replace(/^\./, ''));
            }
        }

        // Find unused classes
        for (const className of definedClasses) {
            if (!usedClasses.has(className)) {
                this.analysisResults.unusedCssClasses.push({
                    name: className,
                    type: 'css-class'
                });
            }
        }

        if (this.options.verbose) {
            console.log(`🎨 Found ${this.analysisResults.unusedCssClasses.length} unused CSS classes`);
        }
    }

    /**
     * Detect unused imports/requires
     */
    async detectUnusedImports(jsFiles) {
        if (!jsFiles) return;
        await Promise.all(jsFiles.map(async (filePath) => {
            const content = await fs.readFile(filePath, 'utf8');
            
            // ES6 imports
            const imports = content.matchAll(/import\s+(?:{([^}]+)}|([a-zA-Z_$][a-zA-Z0-9_$]*)|.*?)\s+from\s+['"]([^'"]+)['"]/g);
            for (const match of imports) {
                if (match[1]) { // Destructured imports
                    const importedNames = match[1].split(',').map(s => s.trim()).filter(Boolean);
                    for (const name of importedNames) {
                        if (!this.isUsedInFile(content, name)) {
                            this.analysisResults.unusedImports.push({
                                name,
                                file: filePath,
                                line: this.getLineNumber(content, match.index),
                                type: 'es6-destructured'
                            });
                        }
                    }
                } else if (match[2]) { // Default imports
                    if (!this.isUsedInFile(content, match[2])) {
                        this.analysisResults.unusedImports.push({
                            name: match[2],
                            file: filePath,
                            line: this.getLineNumber(content, match.index),
                            type: 'es6-default'
                        });
                    }
                }
            }

            // CommonJS requires
            const requires = content.matchAll(/(?:const|let|var)\s+(?:{([^}]+)}|([a-zA-Z_$][a-zA-Z0-9_$]*)|.*?)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
            for (const match of requires) {
                if (match[1]) { // Destructured requires
                    const requiredNames = match[1].split(',').map(s => s.trim()).filter(Boolean);
                    for (const name of requiredNames) {
                        if (!this.isUsedInFile(content, name)) {
                            this.analysisResults.unusedImports.push({
                                name,
                                file: filePath,
                                line: this.getLineNumber(content, match.index),
                                type: 'commonjs-destructured'
                            });
                        }
                    }
                } else if (match[2]) { // Direct requires
                    if (!this.isUsedInFile(content, match[2])) {
                        this.analysisResults.unusedImports.push({
                            name: match[2],
                            file: filePath,
                            line: this.getLineNumber(content, match.index),
                            type: 'commonjs-direct'
                        });
                    }
                }
            }
        }));

        if (this.options.verbose) {
            console.log(`📦 Found ${this.analysisResults.unusedImports.length} unused imports`);
        }
    }

    /**
     * Detect dead code paths (unreachable code)
     */
    async detectDeadCodePaths(jsFiles) {
        if (!jsFiles) return;
        await Promise.all(jsFiles.map(async (filePath) => {
            const content = await fs.readFile(filePath, 'utf8');
            
            // Code after return statements
            const afterReturn = content.matchAll(/return\s+[^;]*;?\s*\n((?:\s*\/\/.*\n)*\s*)([^\n}]+)/g);
            for (const match of afterReturn) {
                if (match[2].trim() && !match[2].trim().startsWith('//') && !match[2].trim().startsWith('}')) {
                    this.analysisResults.deadCodePaths.push({
                        file: filePath,
                        line: this.getLineNumber(content, match.index),
                        type: 'after-return',
                        code: match[2].trim()
                    });
                }
            }

            // Unreachable code after throw
            const afterThrow = content.matchAll(/throw\s+[^;]*;?\s*\n((?:\s*\/\/.*\n)*\s*)([^\n}]+)/g);
            for (const match of afterThrow) {
                if (match[2].trim() && !match[2].trim().startsWith('//') && !match[2].trim().startsWith('}')) {
                    this.analysisResults.deadCodePaths.push({
                        file: filePath,
                        line: this.getLineNumber(content, match.index),
                        type: 'after-throw',
                        code: match[2].trim()
                    });
                }
            }
        }));

        if (this.options.verbose) {
            console.log(`💀 Found ${this.analysisResults.deadCodePaths.length} dead code paths`);
        }
    }

    /**
     * Detect duplicate code blocks using AST parsing for structural analysis
     */
    async detectDuplicateCode(jsFiles) {
        if (!jsFiles) return;
        const functionHashes = new Map();

        for (const filePath of jsFiles) {
            try {
                const content = await fs.readFile(filePath, 'utf8');
                const ast = babelParser.parse(content, {
                    sourceType: 'module',
                    plugins: ['jsx', 'typescript', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator']
                });

                this.traverse(ast, (node) => {
                    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
                        if (node.body && node.body.type === 'BlockStatement' && node.body.loc.end.line - node.body.loc.start.line > 3) {
                            
                            const normalizedBody = this.normalizeNode(node.body);
                            const blockString = JSON.stringify(normalizedBody);
                            const hash = this.hashNode(blockString);
                            
                            const location = {
                                file: path.relative(this.options.projectRoot, filePath),
                                startLine: node.loc.start.line,
                                endLine: node.loc.end.line
                            };

                            if (functionHashes.has(hash)) {
                                functionHashes.get(hash).locations.push(location);
                            } else {
                                functionHashes.set(hash, {
                                    block: content.substring(node.body.start, node.body.end),
                                    locations: [location]
                                });
                            }
                        }
                    }
                });

            } catch (error) {
                if (this.options.verbose) {
                    console.warn(`Could not parse ${filePath} for duplicate code detection: ${error.message}`);
                }
            }
        }

        // Find actual duplicates
        for (const [hash, data] of functionHashes) {
            if (data.locations.length > 1) {
                this.analysisResults.duplicateCode.push({
                    block: this.summarizeBlock(data.block),
                    locations: data.locations,
                    duplicateCount: data.locations.length
                });
            }
        }

        if (this.options.verbose) {
            console.log(`🔄 Found ${this.analysisResults.duplicateCode.length} duplicate code blocks`);
        }
    }
    
    /**
     * Helper: Traverse the AST
     */
    traverse(node, visitor) {
        visitor(node);
        for (const key in node) {
            if (node.hasOwnProperty(key)) {
                const child = node[key];
                if (typeof child === 'object' && child !== null) {
                    if (Array.isArray(child)) {
                        child.forEach(subChild => this.traverse(subChild, visitor));
                    } else {
                        this.traverse(child, visitor);
                    }
                }
            }
        }
    }
    
    /**
     * Helper: Normalize an AST node by removing location data and other noise
     */
    normalizeNode(node) {
        if (typeof node !== 'object' || node === null) {
            return node;
        }

        // Create a new object to avoid modifying the original AST
        const normalized = {};
        const ignoredKeys = new Set(['loc', 'start', 'end', 'comments', 'leadingComments', 'trailingComments', 'innerComments']);

        for (const key in node) {
            if (node.hasOwnProperty(key) && !ignoredKeys.has(key)) {
                if (Array.isArray(node[key])) {
                    normalized[key] = node[key].map(child => this.normalizeNode(child));
                } else if (typeof node[key] === 'object') {
                    normalized[key] = this.normalizeNode(node[key]);
                } else {
                    normalized[key] = node[key];
                }
            }
        }
        
        // In identifiers, nullify the name to find structurally similar but differently named variables/functions
        if (normalized.type === 'Identifier') {
            normalized.name = null;
        }

        return normalized;
    }
    
    /**
     * Helper: Generate a hash from a node
     */
    hashNode(nodeString) {
        return crypto.createHash('sha1').update(nodeString).digest('hex');
    }

    /**
     * Helper: Summarize a code block
     */
    summarizeBlock(block) {
        const trimmed = block.trim().replace(/^{\s*|\s*}$/g, ''); // Remove outer braces
        return trimmed.substring(0, 150) + (trimmed.length > 150 ? '...' : '');
    }

    /**
     * Analyze code complexity
     */
    async analyzeComplexity(jsFiles) {
        if (!jsFiles) return;
        await Promise.all(jsFiles.map(async (filePath) => {
            const content = await fs.readFile(filePath, 'utf8');
            
            // Find overly complex functions (high cyclomatic complexity)
            const functions = content.matchAll(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g);
            
            for (const match of functions) {
                const funcName = match[1];
                const funcBody = match[2];
                
                // Count complexity indicators
                const complexity = this.calculateComplexity(funcBody);
                
                if (complexity > 10) { // High complexity threshold
                    this.analysisResults.complexityIssues.push({
                        name: funcName,
                        file: filePath,
                        line: this.getLineNumber(content, match.index),
                        complexity,
                        type: 'high-complexity'
                    });
                }
            }
        }));

        if (this.options.verbose) {
            console.log(`🔥 Found ${this.analysisResults.complexityIssues.length} high complexity functions`);
        }
    }

    /**
     * Helper methods
     */
    isUsedInFile(content, identifier) {
        // Robustness: ensure identifier is a non-empty string
        if (!identifier || typeof identifier !== 'string') {
            return true; // Assume used to avoid false positives
        }
        try {
            // Escape special characters to create a valid regex
            const escapedIdentifier = identifier.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedIdentifier}\\b`, 'g');
            const matches = content.match(regex);
            return matches && matches.length > 1; // More than just the declaration
        } catch (e) {
            if (this.options.verbose) {
                console.warn(`Could not create regex for identifier: "${identifier}". Assuming it's used.`, e.message);
            }
            return true; // Assume used if regex fails
        }
    }

    getLineNumber(content, index) {
        return content.substring(0, index).split('\n').length;
    }

    calculateComplexity(code) {
        const wordComplexityKeywords = ['if', 'else', 'for', 'while', 'switch', 'case', 'catch'];
        const symbolComplexityKeywords = ['&&', '||', '?'];
        let complexity = 1; // Base complexity
        
        for (const keyword of wordComplexityKeywords) {
            const matches = code.match(new RegExp(`\\b${keyword}\\b`, 'g'));
            if (matches) {
                complexity += matches.length;
            }
        }

        for (const keyword of symbolComplexityKeywords) {
            // Symbols don't have word boundaries, and need escaping
            const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const matches = code.match(new RegExp(escapedKeyword, 'g'));
            if (matches) {
                complexity += matches.length;
            }
        }
        
        return complexity;
    }

    /**
     * Detects unused IPC channels by comparing `ipcMain.handle` definitions
     * with `ipcRenderer.invoke` calls across the entire project.
     * @param {string[]} jsFiles - An array of absolute paths to JavaScript files.
     */
    async detectUnusedIpcHandlers(jsFiles) {
        const definedHandlers = new Map();
        const invokedChannels = new Set();

        for (const filePath of jsFiles) {
            const astData = getAstFromFile(filePath);
            if (!astData) continue;

            const { ast } = astData;

            traverse(ast, {
                CallExpression: (nodePath) => {
                    const { node } = nodePath;
                    const callee = node.callee;
                    
                    // Detect ipcMain.handle('channel-name', ...)
                    if (
                        callee.type === 'MemberExpression' &&
                        callee.object.type === 'Identifier' &&
                        callee.object.name === 'ipcMain' &&
                        callee.property.type === 'Identifier' &&
                        callee.property.name === 'handle' &&
                        node.arguments.length > 0 &&
                        node.arguments[0].type === 'StringLiteral'
                    ) {
                        const channelName = node.arguments[0].value;
                        definedHandlers.set(channelName, {
                            name: channelName,
                            file: path.relative(this.options.projectRoot, filePath),
                            line: node.loc.start.line,
                        });
                    }

                    // Detect ipcRenderer.invoke('channel-name', ...)
                    if (
                        callee.type === 'MemberExpression' &&
                        callee.object.type === 'Identifier' &&
                        callee.object.name === 'ipcRenderer' &&
                        callee.property.type === 'Identifier' &&
                        callee.property.name === 'invoke' &&
                        node.arguments.length > 0 &&
                        node.arguments[0].type === 'StringLiteral'
                    ) {
                        const channelName = node.arguments[0].value;
                        invokedChannels.add(channelName);
                    }
                },
            });
        }

        // Compare defined handlers with invoked channels
        for (const [channelName, handlerInfo] of definedHandlers) {
            if (!invokedChannels.has(channelName)) {
                this.analysisResults.unusedIpcHandlers.push(handlerInfo);
            }
        }

        if (this.options.verbose) {
            console.log(`📡 Found ${this.analysisResults.unusedIpcHandlers.length} unused IPC handlers.`);
        }
    }

    /**
     * Generate comprehensive report
     */
    generateReport() {
        const totalIssues = Object.values(this.analysisResults).reduce((sum, arr) => sum + arr.length, 0);
        
        const report = {
            summary: {
                totalIssues,
                unusedFunctions: this.analysisResults.unusedFunctions.length,
                unusedVariables: this.analysisResults.unusedVariables.length,
                unusedImports: this.analysisResults.unusedImports.length,
                unusedCssClasses: this.analysisResults.unusedCssClasses.length,
                deadCodePaths: this.analysisResults.deadCodePaths.length,
                duplicateCode: this.analysisResults.duplicateCode.length,
                complexityIssues: this.analysisResults.complexityIssues.length,
                unusedIpcHandlers: this.analysisResults.unusedIpcHandlers.length,
            },
            details: this.analysisResults,
            recommendations: this.generateRecommendations()
        };

        return report;
    }

    generateRecommendations() {
        const recommendations = [];

        if (this.analysisResults.unusedFunctions.length > 0) {
            recommendations.push({
                type: 'cleanup',
                priority: 'high',
                message: `Remove ${this.analysisResults.unusedFunctions.length} unused functions to reduce bundle size`,
                autoFixable: true
            });
        }

        if (this.analysisResults.unusedImports.length > 0) {
            recommendations.push({
                type: 'cleanup',
                priority: 'medium',
                message: `Remove ${this.analysisResults.unusedImports.length} unused imports to improve build performance`,
                autoFixable: true
            });
        }

        if (this.analysisResults.duplicateCode.length > 0) {
            recommendations.push({
                type: 'refactor',
                priority: 'medium',
                message: `Refactor ${this.analysisResults.duplicateCode.length} duplicate code blocks into reusable functions`,
                autoFixable: false
            });
        }

        if (this.analysisResults.complexityIssues.length > 0) {
            recommendations.push({
                type: 'refactor',
                priority: 'low',
                message: `Break down ${this.analysisResults.complexityIssues.length} overly complex functions`,
                autoFixable: false
            });
        }

        if (this.analysisResults.unusedIpcHandlers.length > 0) {
            recommendations.push({
                type: 'cleanup',
                priority: 'high',
                message: `Remove ${this.analysisResults.unusedIpcHandlers.length} unused IPC handlers to reduce backend surface area.`,
                autoFixable: false // Can be true if we add modification logic
            });
        }

        return recommendations;
    }
}

module.exports = { UnusedCodeDetector }; 