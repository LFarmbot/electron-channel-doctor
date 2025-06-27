const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');
const { execSync } = require('child_process');

/**
 * Safe Code Surgeon - AST-based code cleanup with syntax validation
 * This replaces the dangerous regex-based approach with proper AST manipulation
 */
class SafeCodeSurgeon {
    constructor(options = {}) {
        this.options = {
            projectRoot: options.projectRoot || process.cwd(),
            backupDir: options.backupDir || '.electron-channel-doctor-backups',
            validateSyntax: options.validateSyntax !== false, // Default to true
            dryRun: options.dryRun || false,
            conservative: options.conservative !== false, // Default to true
            verbose: options.verbose || false,
            maxChangesPerFile: options.maxChangesPerFile || 10, // Limit changes to prevent catastrophic edits
            ...options
        };
        
        this.statistics = {
            filesAnalyzed: 0,
            filesModified: 0,
            filesSkipped: 0,
            syntaxErrors: 0,
            modificationsAttempted: 0,
            modificationsSuccessful: 0,
            modificationsFailed: 0,
            validationsFailed: 0
        };

        this.errors = [];
    }

    /**
     * Parse JavaScript code into AST
     */
    parseCode(code, filePath) {
        try {
            return parse(code, {
                sourceType: 'unambiguous',
                plugins: [
                    'jsx',
                    'typescript',
                    'decorators-legacy',
                    'classProperties',
                    'dynamicImport',
                    'exportDefaultFrom',
                    'exportNamespaceFrom',
                    'optionalChaining',
                    'nullishCoalescingOperator'
                ],
                errorRecovery: false // Don't try to parse broken code
            });
        } catch (error) {
            this.errors.push({
                file: filePath,
                error: `Parse error: ${error.message}`,
                type: 'parse_error'
            });
            return null;
        }
    }

    /**
     * Generate code from AST
     */
    generateCode(ast) {
        try {
            const result = generate(ast, {
                retainLines: true,
                retainFunctionParens: true,
                comments: true,
                compact: false,
                concise: false
            });
            return result.code;
        } catch (error) {
            return null;
        }
    }

    /**
     * Validate JavaScript syntax using Node.js
     */
    validateSyntax(code, filePath) {
        if (!this.options.validateSyntax) return true;

        try {
            // Try to parse with Node's built-in parser
            new Function(code);
            return true;
        } catch (error) {
            // Try with more lenient module parsing
            try {
                const tempFile = path.join(this.options.projectRoot, `.temp-syntax-check-${Date.now()}.js`);
                fs.writeFileSync(tempFile, code);
                
                try {
                    execSync(`node --check "${tempFile}"`, { 
                        cwd: this.options.projectRoot,
                        stdio: 'pipe' 
                    });
                    fs.unlinkSync(tempFile);
                    return true;
                } catch (syntaxError) {
                    fs.unlinkSync(tempFile);
                    this.errors.push({
                        file: filePath,
                        error: `Syntax validation failed: ${syntaxError.message}`,
                        type: 'syntax_error'
                    });
                    return false;
                }
            } catch (e) {
                return false;
            }
        }
    }

    /**
     * Safe modification wrapper
     */
    async safeModifyFile(filePath, modificationFn) {
        this.statistics.filesAnalyzed++;

        try {
            const originalContent = fs.readFileSync(filePath, 'utf8');
            const ast = this.parseCode(originalContent, filePath);
            
            if (!ast) {
                this.statistics.filesSkipped++;
                if (this.options.verbose) {
                    console.log(`  ⚠️  Skipping ${path.relative(this.options.projectRoot, filePath)} - parse error`);
                }
                return false;
            }

            // Apply modifications
            const modifiedAst = modificationFn(ast, originalContent);
            
            if (!modifiedAst || modifiedAst === ast) {
                return false; // No changes made
            }

            // Generate new code
            const newContent = this.generateCode(modifiedAst);
            
            if (!newContent) {
                this.statistics.modificationsFailed++;
                return false;
            }

            // Validate syntax before writing
            if (!this.validateSyntax(newContent, filePath)) {
                this.statistics.validationsFailed++;
                if (this.options.verbose) {
                    console.log(`  ❌ Skipping modification - would create syntax error`);
                }
                return false;
            }

            // Check if changes are too aggressive
            const linesBefore = originalContent.split('\n').length;
            const linesAfter = newContent.split('\n').length;
            const lineReduction = linesBefore - linesAfter;
            
            if (this.options.conservative && lineReduction > linesBefore * 0.3) {
                if (this.options.verbose) {
                    console.log(`  ⚠️  Skipping modification - too aggressive (${lineReduction} lines removed)`);
                }
                return false;
            }

            // Write file if not dry run
            if (!this.options.dryRun) {
                fs.writeFileSync(filePath, newContent, 'utf8');
            }

            this.statistics.filesModified++;
            this.statistics.modificationsSuccessful++;
            
            if (this.options.verbose) {
                console.log(`  ✅ Modified ${path.relative(this.options.projectRoot, filePath)}`);
            }

            return true;
        } catch (error) {
            this.errors.push({
                file: filePath,
                error: error.message,
                type: 'modification_error'
            });
            this.statistics.modificationsFailed++;
            return false;
        }
    }

    /**
     * Remove unused functions using AST
     */
    async removeUnusedFunctions(unusedFunctions) {
        if (unusedFunctions.length === 0) return;

        console.log(`🔪 Safely removing unused functions (${this.options.dryRun ? 'DRY RUN' : 'LIVE'})...`);

        const fileGroups = this.groupByFile(unusedFunctions);

        for (const [filePath, functions] of fileGroups) {
            const functionNames = new Set(functions.map(f => f.name));

            await this.safeModifyFile(filePath, (ast) => {
                let modified = false;
                let changeCount = 0;

                traverse(ast, {
                    // Function declarations
                    FunctionDeclaration(path) {
                        if (functionNames.has(path.node.id.name) && changeCount < this.options.maxChangesPerFile) {
                            path.remove();
                            modified = true;
                            changeCount++;
                        }
                    },
                    // Variable declarations with function expressions
                    VariableDeclarator(path) {
                        if (path.node.id.type === 'Identifier' && 
                            functionNames.has(path.node.id.name) &&
                            (t.isFunctionExpression(path.node.init) || t.isArrowFunctionExpression(path.node.init)) &&
                            changeCount < this.options.maxChangesPerFile) {
                            
                            // Remove the entire variable declaration if it's the only declarator
                            const declaration = path.parent;
                            if (t.isVariableDeclaration(declaration) && declaration.declarations.length === 1) {
                                path.parentPath.remove();
                            } else {
                                path.remove();
                            }
                            modified = true;
                            changeCount++;
                        }
                    },
                    // Class methods
                    ClassMethod(path) {
                        if (path.node.key.type === 'Identifier' && 
                            functionNames.has(path.node.key.name) &&
                            changeCount < this.options.maxChangesPerFile) {
                            path.remove();
                            modified = true;
                            changeCount++;
                        }
                    }
                });

                return modified ? ast : null;
            });
        }
    }

    /**
     * Remove unused imports using AST
     */
    async removeUnusedImports(unusedImports) {
        if (unusedImports.length === 0) return;

        console.log(`📦 Safely removing unused imports (${this.options.dryRun ? 'DRY RUN' : 'LIVE'})...`);

        const fileGroups = this.groupByFile(unusedImports);

        for (const [filePath, imports] of fileGroups) {
            const importNames = new Set(imports.map(i => i.name));

            await this.safeModifyFile(filePath, (ast) => {
                let modified = false;

                traverse(ast, {
                    ImportDeclaration(path) {
                        const specifiers = path.node.specifiers;
                        const remainingSpecifiers = [];

                        for (const spec of specifiers) {
                            let shouldRemove = false;

                            if (t.isImportDefaultSpecifier(spec) && importNames.has(spec.local.name)) {
                                shouldRemove = true;
                            } else if (t.isImportSpecifier(spec) && importNames.has(spec.local.name)) {
                                shouldRemove = true;
                            } else if (t.isImportNamespaceSpecifier(spec) && importNames.has(spec.local.name)) {
                                shouldRemove = true;
                            }

                            if (!shouldRemove) {
                                remainingSpecifiers.push(spec);
                            } else {
                                modified = true;
                            }
                        }

                        if (remainingSpecifiers.length === 0) {
                            path.remove();
                        } else if (remainingSpecifiers.length < specifiers.length) {
                            path.node.specifiers = remainingSpecifiers;
                        }
                    },
                    // CommonJS requires
                    CallExpression(path) {
                        if (path.node.callee.name === 'require' && 
                            path.parent.type === 'VariableDeclarator' &&
                            path.parent.id.type === 'Identifier' &&
                            importNames.has(path.parent.id.name)) {
                            
                            const declaration = path.parentPath.parent;
                            if (t.isVariableDeclaration(declaration) && declaration.declarations.length === 1) {
                                path.parentPath.parentPath.remove();
                            } else {
                                path.parentPath.remove();
                            }
                            modified = true;
                        }
                    }
                });

                return modified ? ast : null;
            });
        }
    }

    /**
     * Create comprehensive backup before any operations
     */
    async createBackup() {
        const backupPath = path.join(this.options.projectRoot, this.options.backupDir);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const backupDir = path.join(backupPath, `backup-${timestamp}`);

        if (!fs.existsSync(backupPath)) {
            fs.mkdirSync(backupPath, { recursive: true });
        }

        fs.mkdirSync(backupDir, { recursive: true });

        console.log(`📋 Creating backup in: ${backupDir}`);

        // Copy all source files
        const glob = require('glob');
        const patterns = ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.css', '**/*.scss'];
        
        for (const pattern of patterns) {
            const files = glob.sync(pattern, {
                cwd: this.options.projectRoot,
                ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', this.options.backupDir + '/**']
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

        // Create detailed restoration script
        const restoreScript = `#!/bin/bash
# Safe restoration script for electron-channel-doctor backup
# Created: ${new Date().toISOString()}

echo "🔄 Restoring files from backup..."
echo "⚠️  This will overwrite current files. Press Ctrl+C to cancel, or Enter to continue."
read

# Restore files
cp -r "${backupDir}/"* "${this.options.projectRoot}/"

echo "✅ Files restored successfully!"
echo "📝 Restoration log saved to: restoration.log"
echo "⚠️  You may need to:"
echo "   - Run 'npm install' to restore dependencies"
echo "   - Restart your development server"
echo "   - Clear any build caches"

# Log restoration
echo "Restoration performed at: $(date)" >> "${this.options.projectRoot}/restoration.log"
echo "Restored from: ${backupDir}" >> "${this.options.projectRoot}/restoration.log"
`;

        fs.writeFileSync(path.join(backupDir, 'RESTORE.sh'), restoreScript);
        fs.chmodSync(path.join(backupDir, 'RESTORE.sh'), '755');

        // Save modification report
        const reportPath = path.join(backupDir, 'BACKUP_INFO.json');
        fs.writeFileSync(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            projectRoot: this.options.projectRoot,
            filesBackedUp: glob.sync('**/*', { cwd: backupDir }).length,
            options: this.options
        }, null, 2));

        console.log(`✅ Backup complete. To restore: sh "${path.join(backupDir, 'RESTORE.sh')}"`);
        
        return backupDir;
    }

    /**
     * Main safe surgery operation
     */
    async performSafeSurgery(analysisReport, operations = []) {
        console.log('🏥 Safe Code Surgeon: Beginning AST-based code cleanup...\n');
        
        if (!this.options.dryRun) {
            await this.createBackup();
        }

        const defaultOperations = ['unused-imports', 'unused-functions'];
        const activeOperations = operations.length > 0 ? operations : defaultOperations;

        for (const operation of activeOperations) {
            this.statistics.modificationsAttempted++;
            
            switch (operation) {
                case 'unused-functions':
                    await this.removeUnusedFunctions(analysisReport.details.unusedFunctions || []);
                    break;
                case 'unused-imports':
                    await this.removeUnusedImports(analysisReport.details.unusedImports || []);
                    break;
                default:
                    console.log(`⚠️  Operation '${operation}' not supported in safe mode`);
            }
        }

        return this.generateSafetyReport();
    }

    /**
     * Generate detailed safety report
     */
    generateSafetyReport() {
        const report = {
            success: this.statistics.modificationsFailed === 0 && this.errors.length === 0,
            mode: this.options.dryRun ? 'DRY_RUN' : 'LIVE',
            statistics: this.statistics,
            errors: this.errors,
            safety: {
                syntaxValidation: this.options.validateSyntax,
                conservativeMode: this.options.conservative,
                maxChangesPerFile: this.options.maxChangesPerFile,
                astBased: true,
                regexBased: false
            },
            summary: {
                totalFiles: this.statistics.filesAnalyzed,
                successfullyModified: this.statistics.filesModified,
                skippedDueToErrors: this.statistics.filesSkipped,
                syntaxErrorsPrevented: this.statistics.validationsFailed,
                safetyScore: this.calculateSafetyScore()
            }
        };

        if (!this.options.dryRun && this.statistics.filesModified > 0) {
            report.recommendations = [
                '🧪 Run your test suite immediately',
                '🔍 Review the changes in your version control system',
                '🏗️ Rebuild your project to ensure everything compiles',
                '💾 Keep the backup until you\'re certain everything works'
            ];
        }

        return report;
    }

    /**
     * Calculate safety score (0-100)
     */
    calculateSafetyScore() {
        let score = 100;
        
        // Deduct for errors
        score -= this.statistics.syntaxErrors * 10;
        score -= this.statistics.modificationsFailed * 5;
        score -= this.statistics.validationsFailed * 5;
        score -= this.errors.length * 2;
        
        // Bonus for safety features
        if (this.options.validateSyntax) score += 10;
        if (this.options.conservative) score += 10;
        if (this.options.dryRun) score += 20;
        
        return Math.max(0, Math.min(100, score));
    }

    /**
     * Utility: Group items by file
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
}

module.exports = { SafeCodeSurgeon }; 