const fs = require('fs');
const path = require('path');
const glob = require('glob');

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
            ignorePatterns: options.ignorePatterns || [
                '**/node_modules/**',
                '**/dist/**',
                '**/build/**',
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
            complexityIssues: []
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
            this.analyzeComplexity(files.js)
        ]);

        return this.generateReport();
    }

    /**
     * Scan all project files
     */
    scanProjectFiles() {
        const jsFiles = glob.sync(this.options.jsPattern, {
            cwd: this.options.projectRoot,
            ignore: this.options.ignorePatterns
        });

        const cssFiles = glob.sync(this.options.cssPattern, {
            cwd: this.options.projectRoot,
            ignore: this.options.ignorePatterns
        });

        const htmlFiles = glob.sync(this.options.htmlPattern, {
            cwd: this.options.projectRoot,
            ignore: this.options.ignorePatterns
        });

        if (this.options.verbose) {
            console.log(`📊 Found ${jsFiles.length} JS files, ${cssFiles.length} CSS files, ${htmlFiles.length} HTML files`);
        }

        return {
            js: jsFiles.map(f => path.join(this.options.projectRoot, f)),
            css: cssFiles.map(f => path.join(this.options.projectRoot, f)),
            html: htmlFiles.map(f => path.join(this.options.projectRoot, f))
        };
    }

    /**
     * Detect unused functions across the codebase
     */
    async detectUnusedFunctions(jsFiles) {
        const definedFunctions = new Map();
        const usedFunctions = new Set();

        // First pass: Find all function definitions
        for (const filePath of jsFiles) {
            const content = fs.readFileSync(filePath, 'utf8');
            
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
        for (const filePath of jsFiles) {
            const content = fs.readFileSync(filePath, 'utf8');
            
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
        const definedClasses = new Set();
        const usedClasses = new Set();

        // Extract CSS classes
        for (const filePath of cssFiles) {
            const content = fs.readFileSync(filePath, 'utf8');
            const classes = content.matchAll(/\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g);
            for (const match of classes) {
                definedClasses.add(match[1]);
            }
        }

        // Find class usage in HTML
        for (const filePath of htmlFiles) {
            const content = fs.readFileSync(filePath, 'utf8');
            const classAttrs = content.matchAll(/class\s*=\s*["']([^"']+)["']/g);
            for (const match of classAttrs) {
                const classes = match[1].split(/\s+/);
                classes.forEach(cls => usedClasses.add(cls));
            }
        }

        // Find class usage in JavaScript
        for (const filePath of jsFiles) {
            const content = fs.readFileSync(filePath, 'utf8');
            
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
        for (const filePath of jsFiles) {
            const content = fs.readFileSync(filePath, 'utf8');
            
            // ES6 imports
            const imports = content.matchAll(/import\s+(?:{([^}]+)}|([a-zA-Z_$][a-zA-Z0-9_$]*)|.*?)\s+from\s+['"]([^'"]+)['"]/g);
            for (const match of imports) {
                if (match[1]) { // Destructured imports
                    const importedNames = match[1].split(',').map(s => s.trim());
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
                    const requiredNames = match[1].split(',').map(s => s.trim());
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
        }

        if (this.options.verbose) {
            console.log(`📦 Found ${this.analysisResults.unusedImports.length} unused imports`);
        }
    }

    /**
     * Detect dead code paths (unreachable code)
     */
    async detectDeadCodePaths(jsFiles) {
        for (const filePath of jsFiles) {
            const content = fs.readFileSync(filePath, 'utf8');
            
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
        }

        if (this.options.verbose) {
            console.log(`💀 Found ${this.analysisResults.deadCodePaths.length} dead code paths`);
        }
    }

    /**
     * Detect duplicate code blocks
     */
    async detectDuplicateCode(jsFiles) {
        const codeBlocks = new Map();

        for (const filePath of jsFiles) {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            
            // Look for duplicate blocks of 5+ lines
            for (let i = 0; i < lines.length - 5; i++) {
                const block = lines.slice(i, i + 5).join('\n').trim();
                if (block && !block.includes('//') && block.length > 50) {
                    if (codeBlocks.has(block)) {
                        codeBlocks.get(block).push({
                            file: filePath,
                            startLine: i + 1,
                            endLine: i + 5
                        });
                    } else {
                        codeBlocks.set(block, [{
                            file: filePath,
                            startLine: i + 1,
                            endLine: i + 5
                        }]);
                    }
                }
            }
        }

        // Find actual duplicates
        for (const [block, locations] of codeBlocks) {
            if (locations.length > 1) {
                this.analysisResults.duplicateCode.push({
                    block: block.substring(0, 100) + '...',
                    locations,
                    duplicateCount: locations.length
                });
            }
        }

        if (this.options.verbose) {
            console.log(`🔄 Found ${this.analysisResults.duplicateCode.length} duplicate code blocks`);
        }
    }

    /**
     * Analyze code complexity
     */
    async analyzeComplexity(jsFiles) {
        for (const filePath of jsFiles) {
            const content = fs.readFileSync(filePath, 'utf8');
            
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
        }

        if (this.options.verbose) {
            console.log(`🔥 Found ${this.analysisResults.complexityIssues.length} high complexity functions`);
        }
    }

    /**
     * Helper methods
     */
    isUsedInFile(content, identifier) {
        const regex = new RegExp(`\\b${identifier}\\b`, 'g');
        const matches = content.match(regex);
        return matches && matches.length > 1; // More than just the declaration
    }

    getLineNumber(content, index) {
        return content.substring(0, index).split('\n').length;
    }

    calculateComplexity(code) {
        const complexityKeywords = ['if', 'else', 'for', 'while', 'switch', 'case', 'catch', '&&', '||', '?'];
        let complexity = 1; // Base complexity
        
        for (const keyword of complexityKeywords) {
            const matches = code.match(new RegExp(`\\b${keyword}\\b`, 'g'));
            if (matches) {
                complexity += matches.length;
            }
        }
        
        return complexity;
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
                complexityIssues: this.analysisResults.complexityIssues.length
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

        return recommendations;
    }
}

module.exports = { UnusedCodeDetector }; 