const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

/**
 * Code Surgeon - Automated code cleanup with surgical precision
 * Part of the Script Doctor suite within electron-channel-doctor
 */

class CodeSurgeon {
    constructor(options = {}) {
        this.options = {
            projectRoot: options.projectRoot || process.cwd(),
            backupDir: options.backupDir || '.electron-channel-doctor-backups',
            safeMode: options.safeMode !== false, // Default to safe mode
            verbose: options.verbose || false,
            ...options
        };
        
        this.statistics = {
            filesModified: 0,
            linesRemoved: 0,
            functionsRemoved: 0,
            importsRemoved: 0,
            cssClassesRemoved: 0,
            deadCodeRemoved: 0
        };
    }

    /**
     * Main surgical operation - remove unused code automatically
     */
    async performSurgery(analysisReport, operations = []) {
        console.log('🏥 Code Surgeon: Beginning surgical code cleanup...\n');
        
        if (this.options.safeMode) {
            await this.createBackup();
        }

        const defaultOperations = [
            'unused-functions',
            'unused-imports', 
            'unused-css-classes',
            'dead-code-paths'
        ];

        const activeOperations = operations.length > 0 ? operations : defaultOperations;

        for (const operation of activeOperations) {
            await this.performOperation(operation, analysisReport);
        }

        return this.generateSurgeryReport();
    }

    /**
     * Create backup of all files before surgery
     */
    async createBackup() {
        const backupPath = path.join(this.options.projectRoot, this.options.backupDir);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const backupDir = path.join(backupPath, `backup-${timestamp}`);

        if (!fs.existsSync(backupPath)) {
            fs.mkdirSync(backupPath, { recursive: true });
        }

        fs.mkdirSync(backupDir, { recursive: true });

        // Copy all relevant files to backup
        const filesToBackup = [
            '**/*.js',
            '**/*.jsx', 
            '**/*.ts',
            '**/*.tsx',
            '**/*.css',
            '**/*.scss',
            '**/*.sass'
        ];

        const glob = require('glob');
        
        for (const pattern of filesToBackup) {
            const files = glob.sync(pattern, {
                cwd: this.options.projectRoot,
                ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
            });

            for (const file of files) {
                const srcPath = path.join(this.options.projectRoot, file);
                const destPath = path.join(backupDir, file);
                const destDir = path.dirname(destPath);

                if (!fs.existsSync(destDir)) {
                    fs.mkdirSync(destDir, { recursive: true });
                }

                fs.copyFileSync(srcPath, destPath);
            }
        }

        console.log(`📋 Created backup in: ${backupDir}`);
        
        // Create restoration script
        const restoreScript = `#!/bin/bash
echo "🔄 Restoring files from backup..."
cp -r "${backupDir}/"* "${this.options.projectRoot}/"
echo "✅ Files restored successfully!"
echo "⚠️  You may need to reinstall node_modules"
`;

        fs.writeFileSync(path.join(backupDir, 'RESTORE.sh'), restoreScript);
        fs.chmodSync(path.join(backupDir, 'RESTORE.sh'), '755');

        console.log(`🔧 Run 'sh ${path.join(backupDir, 'RESTORE.sh')}' to restore if needed\n`);
    }

    /**
     * Perform specific cleanup operation
     */
    async performOperation(operation, analysisReport) {
        switch (operation) {
            case 'unused-functions':
                await this.removeUnusedFunctions(analysisReport.details.unusedFunctions);
                break;
            case 'unused-imports':
                await this.removeUnusedImports(analysisReport.details.unusedImports);
                break;
            case 'unused-css-classes':
                await this.removeUnusedCssClasses(analysisReport.details.unusedCssClasses);
                break;
            case 'dead-code-paths':
                await this.removeDeadCodePaths(analysisReport.details.deadCodePaths);
                break;
            default:
                console.log(`⚠️  Unknown operation: ${operation}`);
        }
    }

    /**
     * Remove unused functions with surgical precision
     */
    async removeUnusedFunctions(unusedFunctions) {
        if (unusedFunctions.length === 0) return;

        console.log(`🔪 Removing ${unusedFunctions.length} unused functions...`);

        const fileGroups = this.groupByFile(unusedFunctions);

        for (const [filePath, functions] of fileGroups) {
            let content = fs.readFileSync(filePath, 'utf8');
            let modified = false;

            // Sort by line number (descending) to avoid index issues
            const sortedFunctions = functions.sort((a, b) => b.line - a.line);

            for (const func of sortedFunctions) {
                const originalContent = content;
                
                try {
                    // Remove function based on type
                    if (func.type === 'function') {
                        content = this.removeFunctionDeclaration(content, func.name);
                    } else if (func.type === 'arrow') {
                        content = this.removeArrowFunction(content, func.name);
                    } else if (func.type === 'method') {
                        content = this.removeMethod(content, func.name);
                    }

                    if (content !== originalContent) {
                        modified = true;
                        this.statistics.functionsRemoved++;
                        this.statistics.linesRemoved += this.countLineReduction(originalContent, content);
                        
                        if (this.options.verbose) {
                            console.log(`  ✂️  Removed function '${func.name}' from ${path.relative(this.options.projectRoot, filePath)}`);
                        }
                    }
                } catch (error) {
                    console.log(`  ⚠️  Could not safely remove function '${func.name}': ${error.message}`);
                }
            }

            if (modified) {
                fs.writeFileSync(filePath, content);
                this.statistics.filesModified++;
            }
        }
    }

    /**
     * Remove unused imports with precision
     */
    async removeUnusedImports(unusedImports) {
        if (unusedImports.length === 0) return;

        console.log(`📦 Removing ${unusedImports.length} unused imports...`);

        const fileGroups = this.groupByFile(unusedImports);

        for (const [filePath, imports] of fileGroups) {
            let content = fs.readFileSync(filePath, 'utf8');
            let modified = false;

            for (const importItem of imports) {
                const originalContent = content;

                try {
                    if (importItem.type.startsWith('es6')) {
                        content = this.removeES6Import(content, importItem.name);
                    } else if (importItem.type.startsWith('commonjs')) {
                        content = this.removeCommonJSImport(content, importItem.name);
                    }

                    if (content !== originalContent) {
                        modified = true;
                        this.statistics.importsRemoved++;
                        
                        if (this.options.verbose) {
                            console.log(`  📦 Removed import '${importItem.name}' from ${path.relative(this.options.projectRoot, filePath)}`);
                        }
                    }
                } catch (error) {
                    console.log(`  ⚠️  Could not safely remove import '${importItem.name}': ${error.message}`);
                }
            }

            if (modified) {
                fs.writeFileSync(filePath, content);
                this.statistics.filesModified++;
            }
        }
    }

    /**
     * Remove unused CSS classes
     */
    async removeUnusedCssClasses(unusedClasses) {
        if (unusedClasses.length === 0) return;

        console.log(`🎨 Removing ${unusedClasses.length} unused CSS classes...`);

        // Find all CSS files
        const glob = require('glob');
        const cssFiles = glob.sync('**/*.{css,scss,sass}', {
            cwd: this.options.projectRoot,
            ignore: ['**/node_modules/**']
        });

        for (const cssFile of cssFiles) {
            const filePath = path.join(this.options.projectRoot, cssFile);
            let content = fs.readFileSync(filePath, 'utf8');
            let modified = false;

            for (const cssClass of unusedClasses) {
                const originalContent = content;
                
                try {
                    // Remove CSS class definition
                    content = this.removeCssClass(content, cssClass.name);
                    
                    if (content !== originalContent) {
                        modified = true;
                        this.statistics.cssClassesRemoved++;
                        
                        if (this.options.verbose) {
                            console.log(`  🎨 Removed CSS class '.${cssClass.name}' from ${cssFile}`);
                        }
                    }
                } catch (error) {
                    console.log(`  ⚠️  Could not safely remove CSS class '.${cssClass.name}': ${error.message}`);
                }
            }

            if (modified) {
                fs.writeFileSync(filePath, content);
                this.statistics.filesModified++;
            }
        }
    }

    /**
     * Remove dead code paths
     */
    async removeDeadCodePaths(deadCodePaths) {
        if (deadCodePaths.length === 0) return;

        console.log(`💀 Removing ${deadCodePaths.length} dead code paths...`);

        const fileGroups = this.groupByFile(deadCodePaths);

        for (const [filePath, deadPaths] of fileGroups) {
            let content = fs.readFileSync(filePath, 'utf8');
            let modified = false;

            // Sort by line number (descending) to avoid index issues
            const sortedPaths = deadPaths.sort((a, b) => b.line - a.line);

            for (const deadPath of sortedPaths) {
                const originalContent = content;
                
                try {
                    content = this.removeDeadCode(content, deadPath.code);
                    
                    if (content !== originalContent) {
                        modified = true;
                        this.statistics.deadCodeRemoved++;
                        this.statistics.linesRemoved += this.countLineReduction(originalContent, content);
                        
                        if (this.options.verbose) {
                            console.log(`  💀 Removed dead code after ${deadPath.type} in ${path.relative(this.options.projectRoot, filePath)}`);
                        }
                    }
                } catch (error) {
                    console.log(`  ⚠️  Could not safely remove dead code: ${error.message}`);
                }
            }

            if (modified) {
                fs.writeFileSync(filePath, content);
                this.statistics.filesModified++;
            }
        }
    }

    /**
     * Helper methods for code removal
     */
    removeFunctionDeclaration(content, funcName) {
        const regex = new RegExp(`function\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{[^}]*(?:\\{[^}]*\\}[^}]*)*\\}`, 'g');
        return content.replace(regex, '').replace(/\n\s*\n\s*\n/g, '\\n\\n'); // Clean up extra newlines
    }

    removeArrowFunction(content, funcName) {
        // Handle various arrow function patterns
        const patterns = [
            new RegExp(`(?:const|let|var)\\s+${funcName}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\\{[^}]*(?:\\{[^}]*\\}[^}]*)*\\}`, 'g'),
            new RegExp(`(?:const|let|var)\\s+${funcName}\\s*=\\s*[a-zA-Z_$][a-zA-Z0-9_$]*\\s*=>\\s*\\{[^}]*(?:\\{[^}]*\\}[^}]*)*\\}`, 'g'),
            new RegExp(`(?:const|let|var)\\s+${funcName}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*[^;\\n]+[;\\n]`, 'g')
        ];

        for (const pattern of patterns) {
            content = content.replace(pattern, '');
        }
        
        return content.replace(/\n\s*\n\s*\n/g, '\\n\\n');
    }

    removeMethod(content, methodName) {
        const regex = new RegExp(`${methodName}\\s*\\([^)]*\\)\\s*\\{[^}]*(?:\\{[^}]*\\}[^}]*)*\\}`, 'g');
        return content.replace(regex, '').replace(/\n\s*\n\s*\n/g, '\\n\\n');
    }

    removeES6Import(content, importName) {
        // Handle various ES6 import patterns
        const patterns = [
            new RegExp(`import\\s+${importName}\\s+from\\s+['"][^'"]+['"];?\\n?`, 'g'), // Default import
            new RegExp(`import\\s*\\{[^}]*\\b${importName}\\b[^}]*\\}\\s+from\\s+['"][^'"]+['"];?\\n?`, 'g'), // Destructured
            new RegExp(`import\\s*\\{\\s*${importName}\\s*\\}\\s+from\\s+['"][^'"]+['"];?\\n?`, 'g') // Single destructured
        ];

        for (const pattern of patterns) {
            const before = content;
            content = content.replace(pattern, '');
            
            // If we removed a single import from a destructured import, clean up the remaining braces
            if (content !== before) {
                content = content.replace(/import\s*\{\s*,\s*([^}]+)\}\s+from/g, 'import { $1 } from');
                content = content.replace(/import\s*\{\s*([^,}]+)\s*,\s*\}\s+from/g, 'import { $1 } from');
                content = content.replace(/import\s*\{\s*\}\s+from\s+['"][^'"]+['"];?\n?/g, '');
            }
        }

        return content;
    }

    removeCommonJSImport(content, importName) {
        const patterns = [
            new RegExp(`(?:const|let|var)\\s+${importName}\\s*=\\s*require\\s*\\(\\s*['"][^'"]+['"]\\s*\\);?\\n?`, 'g'), // Direct require
            new RegExp(`(?:const|let|var)\\s*\\{[^}]*\\b${importName}\\b[^}]*\\}\\s*=\\s*require\\s*\\(\\s*['"][^'"]+['"]\\s*\\);?\\n?`, 'g') // Destructured
        ];

        for (const pattern of patterns) {
            content = content.replace(pattern, '');
        }

        return content;
    }

    removeCssClass(content, className) {
        // Remove entire CSS rule for the class
        const regex = new RegExp(`\\.${className}\\s*\\{[^}]*\\}\\s*`, 'g');
        return content.replace(regex, '');
    }

    removeDeadCode(content, deadCode) {
        // Escape special regex characters in the dead code
        const escapedCode = deadCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\s*${escapedCode}\\s*`, 'g');
        return content.replace(regex, '');
    }

    /**
     * Utility methods
     */
    groupByFile(items) {
        const groups = new Map();
        for (const item of items) {
            if (!groups.has(item.file)) {
                groups.set(item.file, []);
            }
            groups.get(item.file).push(item);
        }
        return groups;
    }

    countLineReduction(before, after) {
        return before.split('\\n').length - after.split('\\n').length;
    }

    /**
     * Generate surgery report
     */
    generateSurgeryReport() {
        const report = {
            success: true,
            statistics: this.statistics,
            summary: {
                totalFilesModified: this.statistics.filesModified,
                totalLinesRemoved: this.statistics.linesRemoved,
                totalItemsRemoved: this.statistics.functionsRemoved + 
                                   this.statistics.importsRemoved + 
                                   this.statistics.cssClassesRemoved + 
                                   this.statistics.deadCodeRemoved
            },
            backup: this.options.safeMode ? {
                location: path.join(this.options.projectRoot, this.options.backupDir),
                restore: 'Run RESTORE.sh script in backup directory to undo changes'
            } : null
        };

        // Calculate estimated bundle size reduction
        const avgBytesPerLine = 50;
        const estimatedBytesReduced = this.statistics.linesRemoved * avgBytesPerLine;
        report.summary.estimatedBundleSizeReduction = this.formatBytes(estimatedBytesReduced);

        return report;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = { CodeSurgeon }; 