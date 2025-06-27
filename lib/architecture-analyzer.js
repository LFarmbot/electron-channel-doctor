const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');
const { getAstFromFile } = require('./ast-parser');
const traverse = require('@babel/traverse').default;

/**
 * Architecture Analyzer
 * Detects architectural and performance anti-patterns in Electron apps.
 */
class ArchitectureAnalyzer {
    constructor(options = {}) {
        this.options = {
            projectRoot: options.projectRoot || process.cwd(),
            rendererProcess: options.rendererProcess || ['src/**/*.js', 'public/**/*.js', 'renderer/**/*.js'],
            ...options
        };
    }

    /**
     * Main analysis function
     */
    async analyze() {
        const issues = {
            performance: [],
            architecture: []
        };

        const [bundlerIssues, syncIpcIssues, modernizationIssues] = await Promise.all([
            this.checkForBundler(),
            this.checkForSynchronousIPC(),
            this.checkForModernizationIssues()
        ]);

        issues.architecture.push(...bundlerIssues);
        issues.performance.push(...syncIpcIssues);
        issues.architecture.push(...modernizationIssues);

        return {
            success: true,
            issues,
            summary: {
                performance: issues.performance.length,
                architecture: issues.architecture.length,
                total: issues.performance.length + issues.architecture.length
            }
        };
    }

    /**
     * Checks if a bundler is present in package.json
     */
    async checkForBundler() {
        const issues = [];
        try {
            const packageJsonPath = path.join(this.options.projectRoot, 'package.json');
            const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
            const packageJson = JSON.parse(packageJsonContent);

            const devDependencies = packageJson.devDependencies || {};
            const dependencies = packageJson.dependencies || {};

            const bundlers = ['webpack', 'vite', 'esbuild', 'parcel', 'rollup'];
            const hasBundler = bundlers.some(b => devDependencies[b] || dependencies[b]);

            if (!hasBundler) {
                issues.push({
                    type: 'no-bundler-found',
                    severity: 'medium',
                    message: 'No modern JavaScript bundler (e.g., Webpack, Vite, esbuild) was found in your dependencies.',
                    recommendation: 'Using a bundler is highly recommended to optimize your code, reduce startup time, and manage dependencies effectively.'
                });
            }
        } catch (error) {
            // Ignore if package.json is not found or malformed
        }
        return issues;
    }

    /**
     * Scans for usage of synchronous IPC
     */
    async checkForSynchronousIPC() {
        const issues = [];
        const files = await this.findFiles(this.options.rendererProcess);

        for (const file of files) {
            const astData = getAstFromFile(file);
            if (!astData) continue;

            traverse(astData.ast, {
                CallExpression(nodePath) {
                    const callee = nodePath.get('callee');
                    if (callee.isMemberExpression() &&
                        callee.get('object').isIdentifier({ name: 'ipcRenderer' }) &&
                        callee.get('property').isIdentifier({ name: 'sendSync' })) {
                        issues.push({
                            type: 'synchronous-ipc-usage',
                            severity: 'high',
                            file: path.relative(this.options.projectRoot, file),
                            message: 'Found usage of synchronous IPC call (ipcRenderer.sendSync).',
                            recommendation: 'Synchronous IPC blocks the renderer process and can lead to a poor user experience. Replace it with asynchronous alternatives like ipcRenderer.invoke().'
                        });
                    }
                }
            });
        }
        return issues;
    }

    /**
     * Checks for modernization issues like outdated Electron versions or deprecated APIs.
     */
    async checkForModernizationIssues() {
        const issues = [];
        const deprecatedApis = [
            { object: 'app', property: 'runningUnderRosettaTranslation', replacement: 'app.runningUnderARM64Translation' },
            // Add more deprecated APIs here as needed
        ];

        // 1. Check Electron version from package.json
        try {
            const packageJsonPath = path.join(this.options.projectRoot, 'package.json');
            const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
            const packageJson = JSON.parse(packageJsonContent);
            const electronVersion = packageJson.devDependencies?.electron || packageJson.dependencies?.electron;

            if (electronVersion) {
                const majorVersionMatch = electronVersion.match(/^[\^~]?(\d+)\./);
                if (majorVersionMatch) {
                    const majorVersion = parseInt(majorVersionMatch[1], 10);
                    // A real implementation would fetch supported versions dynamically
                    const supportedVersions = [28, 27, 26]; // Example static list
                    if (!supportedVersions.includes(majorVersion)) {
                        issues.push({
                            type: 'unsupported-electron-version',
                            severity: 'high',
                            message: `You are using Electron v${majorVersion}, which is no longer officially supported.`,
                            recommendation: `Upgrade to a supported version (e.g., ${supportedVersions[0]}.x.x) to receive security patches and new features.`
                        });
                    }
                }
            }
        } catch (error) {
             // Ignore if package.json is not found or malformed
        }
        
        // 2. Scan for deprecated APIs using AST
        const filesToScan = await this.findFiles([
            ...(this.options.mainProcess || ['main.js', 'main/index.js', 'background.js']),
            ...this.options.rendererProcess
        ]);

        for (const file of filesToScan) {
            const astData = getAstFromFile(file);
            if (!astData) continue;

            traverse(astData.ast, {
                MemberExpression(nodePath) {
                    for (const api of deprecatedApis) {
                        if (nodePath.get('object').isIdentifier({ name: api.object }) &&
                            nodePath.get('property').isIdentifier({ name: api.property })) {
                            issues.push({
                                type: 'deprecated-api-usage',
                                severity: 'medium',
                                file: path.relative(this.options.projectRoot, file),
                                message: `Found usage of deprecated API: ${api.object}.${api.property}`,
                                recommendation: `Consult the Electron documentation. The replacement is often '${api.replacement}'.`
                            });
                        }
                    }
                }
            });
        }

        return issues;
    }

    /**
     * Helper: Find files matching patterns
     */
    async findFiles(patterns) {
        const patternArray = Array.isArray(patterns) ? patterns : [patterns];
        const globOpts = {
            cwd: this.options.projectRoot,
            ignore: this.options.ignore
        };

        const allFilePromises = patternArray.map(pattern => glob(pattern, globOpts));

        const filesPerPattern = await Promise.all(allFilePromises);
        return filesPerPattern.flat().map(f => path.join(this.options.projectRoot, f));
    }
}

module.exports = { ArchitectureAnalyzer }; 