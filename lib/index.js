const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
const { UnusedCodeDetector } = require('./unused-code-detector');
const { CodeSurgeon } = require('./code-surgeon');
const { SafeCodeSurgeon } = require('./safe-code-surgeon');
const { SecurityAnalyzer } = require('./security-analyzer');
const { ArchitectureAnalyzer } = require('./architecture-analyzer');
const { ASTParser } = require('./ast-parser');
const { FileSystem, MockFileSystem } = require('./file-system');

/**
 * Electron Channel Doctor - Main Library
 * Automate Electron IPC invoke channel management and prevent 'Invalid invoke channel' errors
 * 
 * NOW WITH SCRIPT DOCTOR FUNCTIONALITY:
 * - Advanced unused code detection
 * - Automatic code cleanup and surgery
 * - Comprehensive static analysis
 * - Security vulnerability detection (NEW!)
 */

class ChannelDoctor {
    constructor(options = {}) {
        const defaultIgnore = [
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
            '**/.git/**',
            '**/*.min.js',
            '**/*.bundle.js'
        ];

        const defaults = {
            preloadPath: 'electron/preload.js',
            jsSource: 'public/js/**/*.js',
            projectRoot: process.cwd(),
            verbose: false,
        };

        this.options = { ...defaults, ...options };
        this.options.ignore = [...defaultIgnore, ...(options.ignore || [])];
        this.fs = options.fs || new FileSystem();
    }

    /**
     * Get current whitelisted channels from preload.js
     */
    async getCurrentWhitelist() {
        const preloadPath = path.join(this.options.projectRoot, this.options.preloadPath);
        
        let preloadContent;
        try {
            preloadContent = await this.fs.readFile(preloadPath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Preload file not found at: ${preloadPath}`);
            }
            throw error;
        }
        
        return ASTParser.getPreloadChannels(preloadContent);
    }

    /**
     * Scan all JS files for invoke calls
     */
    async scanForInvokeCalls() {
        const foundChannels = new Set();
        
        const files = this.fs.findFiles(
            this.options.jsSource,
            this.options.projectRoot,
            this.options.ignore
        );

        if (this.options.verbose) {
            console.log(`Scanning ${files.length} JavaScript files...`);
        }

        await Promise.all(files.map(async (filePath) => {
            const channels = await this.scanFileForInvokeCalls(filePath);
            channels.forEach(channel => foundChannels.add(channel));
        }));
        
        return Array.from(foundChannels).sort();
    }

    /**
     * Scan a single file for invoke calls
     */
    async scanFileForInvokeCalls(filePath) {
        const foundChannels = new Set();
        try {
            const content = await this.fs.readFile(filePath);
            const channels = ASTParser.findInvokeChannels(content);
            
            channels.forEach(channel => {
                foundChannels.add(channel);

                if (this.options.verbose) {
                    const relativePath = path.relative(this.options.projectRoot, filePath);
                    console.log(`  Found channel '${channel}' in ${relativePath}`);
                }
            });
        } catch (error) {
            if (this.options.verbose) {
                console.warn(`Could not read file: ${filePath} - ${error.message}`);
            }
        }
        return Array.from(foundChannels);
    }

    /**
     * Main analysis function
     */
    async analyze() {
        try {
            const [whitelisted, found] = await Promise.all([
                this.getCurrentWhitelist(),
                this.scanForInvokeCalls()
            ]);
            
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
    async generateFixedPreload() {
        const analysis = await this.analyze();
        if (!analysis.success) {
            throw new Error(analysis.error);
        }

        const preloadPath = path.join(this.options.projectRoot, this.options.preloadPath);
        const preloadContent = await this.fs.readFile(preloadPath);
        
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
    async fix() {
        const fixed = await this.generateFixedPreload();
        const preloadPath = path.join(this.options.projectRoot, this.options.preloadPath);
        
        // Create backup
        const backupPath = `${preloadPath}.backup.${Date.now()}`;
        await fs.copyFile(preloadPath, backupPath);
        
        // Write the fixed version
        await fs.writeFile(preloadPath, fixed.content, 'utf8');
        
        return {
            success: true,
            backupPath,
            channelsAdded: fixed.channels.length - (fixed.channels.length - fixed.removed.length),
            channelsRemoved: fixed.removed,
            totalChannels: fixed.channels.length
        };
    }

    /**
     * 🩺 SCRIPT DOCTOR FEATURES 🩺
     * Advanced code analysis and surgical cleanup
     */

    /**
     * 🔒 SECURITY ANALYSIS 🔒
     * Detect security vulnerabilities in Electron IPC
     */
    async analyzeSecurityVulnerabilities(options = {}) {
        console.log('🔒 Electron IPC Security Analysis Starting...\n');
        
        const analyzer = new SecurityAnalyzer({
            ...this.options,
            ...options,
            fs: this.fs,
        });

        const analysis = await analyzer.analyze();
        const report = analyzer.generateReport(analysis);

        return report;
    }

    /**
     * 🏛️ ARCHITECTURE ANALYSIS 🏛️
     * Detect architectural and performance anti-patterns
     */
    async analyzeArchitecture(options = {}) {
        console.log('🏛️ Architecture Analyzer: Scanning for anti-patterns...\n');
        
        const analyzer = new ArchitectureAnalyzer({
            ...this.options,
            ...options,
            fs: this.fs,
        });

        const report = await analyzer.analyze();

        return report;
    }

    /**
     * Perform comprehensive code health checkup
     */
    async performHealthCheckup(options = {}) {
        console.log('🩺 Script Doctor: Performing comprehensive code health checkup...\n');
        
        const detector = new UnusedCodeDetector({
            ...this.options,
            ...options,
            fs: this.fs,
        });

        const analysisReport = await detector.analyzeProject();
        
        // Combine with IPC channel analysis
        const channelReport = await this.analyze();
        
        // Add security analysis
        const securityReport = await this.analyzeSecurityVulnerabilities(options);
        
        // Add architecture analysis
        const architectureReport = await this.analyzeArchitecture(options);
        
        const combinedReport = {
            ...analysisReport,
            channels: channelReport,
            security: securityReport,
            architecture: architectureReport,
            healthScore: this.calculateHealthScore(analysisReport, channelReport, securityReport)
        };

        return combinedReport;
    }

    /**
     * Perform automated code surgery to remove unused code
     */
    async performCodeSurgery(options = {}) {
        console.log('🏥 Script Doctor: Preparing for code surgery...\n');
        
        // First, analyze the code
        const analysisReport = await this.performHealthCheckup(options);
        
        if (analysisReport.summary.totalIssues === 0) {
            console.log('✨ Excellent! No surgical intervention needed. Your code is already clean!');
            return { success: true, message: 'No issues found' };
        }

        // Use safe mode by default, unless explicitly set to false
        const useSafeMode = options.safeMode !== false;
        
        if (useSafeMode) {
            console.log('🛡️ Using Safe Mode with AST-based modifications and syntax validation\n');
            const surgeon = new SafeCodeSurgeon({
                ...this.options,
                ...options
            });
            
            const surgeryReport = await surgeon.performSafeSurgery(analysisReport, options.operations);
            
            return {
                ...surgeryReport,
                analysisReport,
                recommendations: this.generatePostSurgeryRecommendations(surgeryReport)
            };
        } else {
            console.log('⚠️ WARNING: Using legacy regex-based surgery. This may cause syntax errors!\n');
            console.log('💡 Tip: Use safe mode (default) for AST-based modifications\n');
            
            // Perform the surgery with old method
            const surgeon = new CodeSurgeon({
                ...this.options,
                ...options
            });

            const surgeryReport = await surgeon.performSurgery(analysisReport, options.operations);
            
            return {
                ...surgeryReport,
                analysisReport,
                recommendations: this.generatePostSurgeryRecommendations(surgeryReport),
                warning: 'Legacy mode used - please check for syntax errors!'
            };
        }
    }

    /**
     * Generate detailed project health report
     */
    async generateHealthReport(options = {}) {
        const healthCheckup = await this.performHealthCheckup(options);
        
        return {
            timestamp: new Date().toISOString(),
            project: path.basename(this.options.projectRoot),
            ...healthCheckup,
            recommendations: this.generateHealthRecommendations(healthCheckup),
            nextSteps: this.generateNextSteps(healthCheckup)
        };
    }

    /**
     * Calculate overall project health score (0-100)
     */
    calculateHealthScore(analysisReport, channelReport, securityReport = null) {
        let score = 100;
        
        // Deduct points for various issues
        score -= Math.min(analysisReport.summary.unusedFunctions * 2, 20);
        score -= Math.min(analysisReport.summary.unusedImports * 1, 10);
        score -= Math.min(analysisReport.summary.unusedCssClasses * 0.5, 10);
        score -= Math.min(analysisReport.summary.deadCodePaths * 3, 15);
        score -= Math.min(analysisReport.summary.duplicateCode * 2, 10);
        score -= Math.min(analysisReport.summary.complexityIssues * 1, 15);
        
        // Channel issues
        if (channelReport.success) {
            score -= Math.min(channelReport.summary.missingFromWhitelist * 2, 10);
            score -= Math.min(channelReport.summary.unusedInWhitelist * 1, 10);
        }

        // Security issues (highest impact)
        if (securityReport) {
            score -= Math.min(securityReport.summary.critical * 10, 30);
            score -= Math.min(securityReport.summary.high * 5, 20);
            score -= Math.min(securityReport.summary.medium * 2, 10);
            score -= Math.min(securityReport.summary.low * 0.5, 5);
        }

        return Math.max(0, Math.round(score));
    }

    /**
     * Generate health-based recommendations
     */
    generateHealthRecommendations(healthReport) {
        const recommendations = [];
        
        if (healthReport.healthScore >= 90) {
            recommendations.push({
                type: 'excellent',
                message: '🎉 Excellent code health! Your project is in great shape.',
                priority: 'info'
            });
        } else if (healthReport.healthScore >= 70) {
            recommendations.push({
                type: 'good',
                message: '👍 Good code health with room for minor improvements.',
                priority: 'low'
            });
        } else if (healthReport.healthScore >= 50) {
            recommendations.push({
                type: 'needs-improvement',
                message: '⚠️ Code health needs improvement. Consider running surgery.',
                priority: 'medium'
            });
        } else {
            recommendations.push({
                type: 'critical',
                message: '🚨 Critical code health issues detected. Surgery strongly recommended.',
                priority: 'high'
            });
        }

        // Add specific recommendations
        if (healthReport.summary.unusedFunctions > 5) {
            recommendations.push({
                type: 'cleanup',
                message: `Remove ${healthReport.summary.unusedFunctions} unused functions to reduce bundle size`,
                priority: 'high',
                autoFixable: true
            });
        }

        if (healthReport.summary.duplicateCode > 3) {
            recommendations.push({
                type: 'refactor',
                message: `Refactor ${healthReport.summary.duplicateCode} duplicate code blocks`,
                priority: 'medium',
                autoFixable: false
            });
        }

        return recommendations;
    }

    /**
     * Generate actionable next steps
     */
    generateNextSteps(healthReport) {
        const steps = [];
        
        if (healthReport.summary.totalIssues > 0) {
            steps.push({
                action: 'Run surgical cleanup',
                command: 'npx electron-channel-doctor surgery',
                description: 'Automatically remove unused code with backup',
                priority: 1
            });
        }

        if (healthReport.channels.success && healthReport.channels.summary.missingFromWhitelist > 0) {
            steps.push({
                action: 'Fix IPC channels',
                command: 'npx electron-channel-doctor fix',
                description: 'Add missing invoke channels to preload.js',
                priority: 2
            });
        }

        if (healthReport.summary.complexityIssues > 0) {
            steps.push({
                action: 'Refactor complex functions',
                command: 'Manual refactoring needed',
                description: 'Break down overly complex functions for maintainability',
                priority: 3
            });
        }

        return steps;
    }

    /**
     * Generate post-surgery recommendations
     */
    generatePostSurgeryRecommendations(surgeryReport) {
        const recommendations = [];
        
        if (surgeryReport.statistics.filesModified > 0) {
            recommendations.push({
                type: 'test',
                message: '🧪 Run your test suite to ensure no functionality was broken',
                priority: 'high'
            });
            
            recommendations.push({
                type: 'build',
                message: '🏗️ Test your build process to verify everything still works',
                priority: 'high'
            });
        }

        if (surgeryReport.summary.estimatedBundleSizeReduction && surgeryReport.summary.estimatedBundleSizeReduction !== '0 Bytes') {
            recommendations.push({
                type: 'performance',
                message: `🚀 Bundle size reduced by ~${surgeryReport.summary.estimatedBundleSizeReduction}! Consider measuring actual improvement.`,
                priority: 'info'
            });
        }

        if (surgeryReport.backup) {
            recommendations.push({
                type: 'backup',
                message: `💾 Backup created at ${surgeryReport.backup.location}. Keep it until you're sure everything works.`,
                priority: 'info'
            });
        }

        return recommendations;
    }
}

module.exports = {
    ChannelDoctor,
    FileSystem,
    MockFileSystem,
    UnusedCodeDetector,
    CodeSurgeon,
    SafeCodeSurgeon,
    SecurityAnalyzer,
    ArchitectureAnalyzer,
    analyze: async (options) => new ChannelDoctor(options).analyze(),
    fix: async (options) => new ChannelDoctor(options).fix(),
    checkHealth: async (options) => new ChannelDoctor(options).performHealthCheckup(options),
    performSurgery: async (options) => new ChannelDoctor(options).performCodeSurgery(options),
    generateHealthReport: async (options) => new ChannelDoctor(options).generateHealthReport(options),
    analyzeSecurity: async (options) => new ChannelDoctor(options).analyzeSecurityVulnerabilities(options),
    analyzeArchitecture: async (options) => new ChannelDoctor(options).analyzeArchitecture(options)
}; 