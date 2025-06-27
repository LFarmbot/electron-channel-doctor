#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { ChannelDoctor } = require('../lib/index.js');

const program = new Command();

// Package info
const packagePath = path.join(__dirname, '..', 'package.json');
const packageInfo = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

program
    .name('electron-channel-doctor')
    .description('Automate Electron IPC invoke channel management and prevent "Invalid invoke channel" errors')
    .version(packageInfo.version);

// Check command (default)
program
    .command('check', { isDefault: true })
    .description('Check for missing or unused invoke channels')
    .option('-p, --preload <path>', 'path to preload.js file', 'electron/preload.js')
    .option('-s, --source <pattern>', 'glob pattern for JS source files', 'public/js/**/*.js')
    .option('-i, --ignore <patterns...>', 'glob patterns to ignore')
    .option('-v, --verbose', 'verbose output')
    .option('--json', 'output results as JSON')
    .action(async (options) => {
        console.log(chalk.blue('🔍 Electron Channel Doctor - Checking invoke channels...\n'));

        const doctor = new ChannelDoctor({
            preloadPath: options.preload,
            jsSource: options.source,
            ignore: options.ignore,
            verbose: options.verbose
        });

        const result = await doctor.analyze();

        if (!result.success) {
            console.error(chalk.red('❌ Error:'), result.error);
            process.exit(1);
        }

        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }

        // Pretty output
        const { summary, channels } = result;
        
        console.log(chalk.cyan('📊 Results:'));
        console.log(`   Found ${summary.foundChannels} unique invoke channels in use`);
        console.log(`   Currently whitelisted: ${summary.whitelistedChannels} channels`);
        console.log(`   Missing from whitelist: ${summary.missingFromWhitelist}`);
        console.log(`   Unused in whitelist: ${summary.unusedInWhitelist}\n`);

        if (channels.missing.length > 0) {
            console.log(chalk.red('❌ Missing channels (add these to preload.js):'));
            channels.missing.forEach(channel => {
                console.log(chalk.yellow(`   '${channel}',`));
            });
            console.log('');
        }

        if (channels.unused.length > 0) {
            console.log(chalk.yellow('⚠️  Unused channels (consider removing):'));
            channels.unused.forEach(channel => {
                console.log(chalk.gray(`   '${channel}',`));
            });
            console.log('');
        }

        if (channels.missing.length === 0 && channels.unused.length === 0) {
            console.log(chalk.green('✅ All invoke channels are properly whitelisted!'));
        } else if (channels.missing.length > 0) {
            console.log(chalk.blue('💡 Tip: Run'), chalk.white('electron-channel-doctor fix'), chalk.blue('to automatically fix missing channels'));
        }

        // Exit with error code if there are missing channels (for CI/CD)
        process.exit(channels.missing.length > 0 ? 1 : 0);
    });

// Fix command
program
    .command('fix')
    .description('Automatically fix missing invoke channels in preload.js')
    .option('-p, --preload <path>', 'path to preload.js file', 'electron/preload.js')
    .option('-s, --source <pattern>', 'glob pattern for JS source files', 'public/js/**/*.js')
    .option('-i, --ignore <patterns...>', 'glob patterns to ignore')
    .option('-v, --verbose', 'verbose output')
    .option('--dry-run', 'show what would be changed without making changes')
    .action(async (options) => {
        console.log(chalk.blue('🔧 Electron Channel Doctor - Fixing invoke channels...\n'));

        const doctor = new ChannelDoctor({
            preloadPath: options.preload,
            jsSource: options.source,
            ignore: options.ignore,
            verbose: options.verbose
        });

        try {
            if (options.dryRun) {
                const fixed = await doctor.generateFixedPreload();
                console.log(chalk.yellow('🔍 Dry run - showing what would be changed:\n'));
                console.log(chalk.green(`✅ Would keep ${fixed.channels.length} channels`));
                if (fixed.removed.length > 0) {
                    console.log(chalk.red(`❌ Would remove ${fixed.removed.length} unused channels:`));
                    fixed.removed.forEach(ch => console.log(chalk.gray(`   '${ch}'`)));
                }
                console.log(chalk.blue('\n💡 Run without --dry-run to apply changes'));
                return;
            }

            const result = await doctor.fix();
            
            console.log(chalk.green('✅ Successfully fixed preload.js!'));
            console.log(`   Backup created: ${path.relative(process.cwd(), result.backupPath)}`);
            console.log(`   Total channels: ${result.totalChannels}`);
            
            if (result.channelsRemoved.length > 0) {
                console.log(`   Removed unused: ${result.channelsRemoved.length}`);
            }
            
            console.log(chalk.blue('\n💡 Don\'t forget to restart your Electron app!'));
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    });

// List command
program
    .command('list')
    .description('List all found invoke channels')
    .option('-p, --preload <path>', 'path to preload.js file', 'electron/preload.js')
    .option('-s, --source <pattern>', 'glob pattern for JS source files', 'public/js/**/*.js')
    .option('-i, --ignore <patterns...>', 'glob patterns to ignore')
    .option('--used-only', 'only show channels that are actually used')
    .option('--unused-only', 'only show channels that are unused')
    .action(async (options) => {
        const doctor = new ChannelDoctor({
            preloadPath: options.preload,
            jsSource: options.source,
            ignore: options.ignore
        });

        const result = await doctor.analyze();

        if (!result.success) {
            console.error(chalk.red('❌ Error:'), result.error);
            process.exit(1);
        }

        const { channels } = result;

        if (options.usedOnly) {
            console.log(chalk.green('📋 Used invoke channels:'));
            channels.found.forEach(ch => console.log(`   ${ch}`));
        } else if (options.unusedOnly) {
            console.log(chalk.yellow('📋 Unused invoke channels:'));
            channels.unused.forEach(ch => console.log(`   ${ch}`));
        } else {
            console.log(chalk.cyan('📋 All invoke channels:'));
            
            console.log(chalk.green('\n✅ Used channels:'));
            channels.found.forEach(ch => {
                const status = channels.whitelisted.includes(ch) ? '✅' : '❌';
                console.log(`   ${status} ${ch}`);
            });
            
            if (channels.unused.length > 0) {
                console.log(chalk.yellow('\n⚠️  Unused channels:'));
                channels.unused.forEach(ch => console.log(`   ❓ ${ch}`));
            }
        }
    });

// Init command
program
    .command('init')
    .description('Create a configuration file for electron-channel-doctor')
    .action(async () => {
        const configPath = path.join(process.cwd(), '.channel-doctor.json');
        
        if (fs.existsSync(configPath)) {
            console.log(chalk.yellow('⚠️  Configuration file already exists at .channel-doctor.json'));
            return;
        }

        const config = {
            preloadPath: "electron/preload.js",
            jsSource: "src/**/*.js",
            ignore: [
                "**/node_modules/**",
                "**/dist/**",
                "**/build/**"
            ]
        };

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(chalk.green('✅ Created .channel-doctor.json configuration file'));
        console.log(chalk.blue('💡 Edit this file to customize the paths for your project'));
    });

// 🩺 SCRIPT DOCTOR COMMANDS 🩺

program
    .command('security')
    .description('🔒 Analyze Electron IPC security vulnerabilities')
    .option('-p, --preload <path>', 'path to preload.js file', 'electron/preload.js')
    .option('-m, --main <pattern>', 'glob pattern for main process files', 'main.js,electron/**/*.js,src/main/**/*.js')
    .option('-r, --renderer <pattern>', 'glob pattern for renderer files', 'src/**/*.js,public/**/*.js,renderer/**/*.js')
    .option('-i, --ignore <patterns...>', 'glob patterns to ignore')
    .option('-v, --verbose', 'show detailed output')
    .option('--json', 'output as JSON')
    .option('-o, --output <file>', 'save report to file')
    .action(async (options) => {
        console.log(chalk.blue('🔒 Security Analyzer: Scanning for Electron IPC vulnerabilities...\n'));
        
        const doctor = new ChannelDoctor({
            preloadPath: options.preload,
            mainProcess: options.main.split(','),
            rendererProcess: options.renderer.split(','),
            ignore: options.ignore,
            verbose: options.verbose
        });
        
        try {
            const securityReport = await doctor.analyzeSecurityVulnerabilities();
            
            if (options.json || options.output) {
                const jsonOutput = JSON.stringify(securityReport, null, 2);
                
                if (options.output) {
                    fs.writeFileSync(options.output, jsonOutput);
                    console.log(chalk.green(`✅ Security report saved to: ${options.output}`));
                    
                    // Still show summary on console
                    displaySecuritySummary(securityReport);
                } else {
                    console.log(jsonOutput);
                }
                return;
            }
            
            // Display results
            displaySecuritySummary(securityReport);
            
            // Display vulnerabilities by severity
            if (securityReport.summary.critical > 0) {
                console.log(chalk.red('\n🚨 CRITICAL Vulnerabilities:'));
                securityReport.vulnerabilities.critical.forEach(vuln => {
                    console.log(chalk.red(`\n   [${vuln.type}] ${vuln.message}`));
                    console.log(chalk.gray(`   File: ${vuln.file}${vuln.line ? ` (line ${vuln.line})` : ''}`));
                    console.log(chalk.yellow(`   Fix: ${vuln.recommendation}`));
                    if (vuln.cve) console.log(chalk.gray(`   Reference: ${vuln.cve}`));
                });
            }
            
            if (securityReport.summary.high > 0) {
                console.log(chalk.red('\n⚠️  HIGH Vulnerabilities:'));
                securityReport.vulnerabilities.high.forEach(vuln => {
                    console.log(chalk.yellow(`\n   [${vuln.type}] ${vuln.message}`));
                    console.log(chalk.gray(`   File: ${vuln.file}${vuln.line ? ` (line ${vuln.line})` : ''}`));
                    console.log(chalk.cyan(`   Fix: ${vuln.recommendation}`));
                    if (vuln.cve) console.log(chalk.gray(`   Reference: ${vuln.cve}`));
                });
            }
            
            if (securityReport.summary.medium > 0 && options.verbose) {
                console.log(chalk.yellow('\n⚡ MEDIUM Vulnerabilities:'));
                securityReport.vulnerabilities.medium.forEach(vuln => {
                    console.log(chalk.gray(`\n   [${vuln.type}] ${vuln.message}`));
                    console.log(chalk.gray(`   File: ${vuln.file}${vuln.line ? ` (line ${vuln.line})` : ''}`));
                    console.log(chalk.gray(`   Fix: ${vuln.recommendation}`));
                });
            }
            
            if (securityReport.summary.low > 0 && options.verbose) {
                console.log(chalk.gray('\n💡 LOW Vulnerabilities:'));
                securityReport.vulnerabilities.low.forEach(vuln => {
                    console.log(chalk.gray(`\n   [${vuln.type}] ${vuln.message}`));
                    console.log(chalk.gray(`   File: ${vuln.file}${vuln.line ? ` (line ${vuln.line})` : ''}`));
                    console.log(chalk.gray(`   Fix: ${vuln.recommendation}`));
                });
            }
            
            // Recommendations
            if (securityReport.recommendations && securityReport.recommendations.length > 0) {
                console.log(chalk.cyan('\n🛡️  Security Recommendations:'));
                securityReport.recommendations.forEach(rec => {
                    const icon = rec.priority === 'CRITICAL' ? '🚨' : 
                               rec.priority === 'HIGH' ? '⚠️' : '💡';
                    console.log(`\n   ${icon} ${chalk.bold(rec.action)}`);
                    console.log(chalk.gray(`      ${rec.description}`));
                });
            }
            
            // Resources
            if (securityReport.resources && securityReport.resources.length > 0) {
                console.log(chalk.blue('\n📚 Security Resources:'));
                securityReport.resources.forEach(resource => {
                    console.log(`   • ${resource}`);
                });
            }
            
            // Exit with error code if critical vulnerabilities exist
            process.exit(securityReport.summary.critical > 0 ? 1 : 0);
            
        } catch (error) {
            console.error(chalk.red(`❌ Security analysis failed: ${error.message}`));
            process.exit(1);
        }
    });

// Helper function to display security summary
function displaySecuritySummary(securityReport) {
    const scoreColor = securityReport.securityScore >= 90 ? 'green' : 
                      securityReport.securityScore >= 70 ? 'yellow' : 
                      securityReport.securityScore >= 50 ? 'red' : 'red';
    
    console.log(chalk[scoreColor](`🛡️  Security Score: ${securityReport.securityScore}/100\n`));
    
    console.log(chalk.cyan('📊 Vulnerability Summary:'));
    
    if (securityReport.summary.critical > 0) {
        console.log(chalk.red(`   🚨 Critical: ${securityReport.summary.critical}`));
    } else {
        console.log(chalk.green(`   ✅ Critical: 0`));
    }
    
    if (securityReport.summary.high > 0) {
        console.log(chalk.red(`   ⚠️  High: ${securityReport.summary.high}`));
    } else {
        console.log(chalk.green(`   ✅ High: 0`));
    }
    
    if (securityReport.summary.medium > 0) {
        console.log(chalk.yellow(`   ⚡ Medium: ${securityReport.summary.medium}`));
    } else {
        console.log(chalk.green(`   ✅ Medium: 0`));
    }
    
    if (securityReport.summary.low > 0) {
        console.log(chalk.gray(`   💡 Low: ${securityReport.summary.low}`));
    } else {
        console.log(chalk.green(`   ✅ Low: 0`));
    }
    
    console.log(chalk.cyan(`\n   Total Issues: ${securityReport.summary.total}`));
}

program
    .command('health')
    .description('🩺 Perform comprehensive code health checkup')
    .option('-p, --preload <path>', 'path to preload.js file', 'electron/preload.js')
    .option('-s, --source <pattern>', 'glob pattern for JS source files', '**/*.{js,jsx,ts,tsx}')
    .option('--css <pattern>', 'glob pattern for CSS files', '**/*.{css,scss,sass}')
    .option('--html <pattern>', 'glob pattern for HTML files', '**/*.{html,htm}')
    .option('-i, --ignore <patterns...>', 'glob patterns to ignore')
    .option('-v, --verbose', 'show detailed output')
    .option('--json', 'output as JSON')
    .action(async (options) => {
        console.log(chalk.blue('🩺 Script Doctor: Performing comprehensive health checkup...\n'));
        
        const doctor = new ChannelDoctor({
            preloadPath: options.preload,
            jsPattern: options.source,
            cssPattern: options.css,
            htmlPattern: options.html,
            ignore: options.ignore,
            verbose: options.verbose
        });
        
        try {
            const healthReport = await doctor.generateHealthReport();
            
            if (options.json) {
                console.log(JSON.stringify(healthReport, null, 2));
                return;
            }
            
            // Display health score with color coding
            const scoreColor = healthReport.healthScore >= 90 ? 'green' : 
                             healthReport.healthScore >= 70 ? 'yellow' : 'red';
            
            console.log(chalk[scoreColor](`🏥 Overall Health Score: ${healthReport.healthScore}/100\n`));
            
            // Summary
            console.log(chalk.cyan('📊 Code Health Summary:'));
            console.log(`   Unused Functions: ${healthReport.summary.unusedFunctions}`);
            console.log(`   Unused Imports: ${healthReport.summary.unusedImports}`);
            console.log(`   Unused CSS Classes: ${healthReport.summary.unusedCssClasses}`);
            console.log(`   Dead Code Paths: ${healthReport.summary.deadCodePaths}`);
            console.log(`   Duplicate Code Blocks: ${healthReport.summary.duplicateCode}`);
            console.log(`   Complex Functions: ${healthReport.summary.complexityIssues}`);
            
            if (healthReport.channels.success) {
                console.log(`   Missing IPC Channels: ${healthReport.channels.summary.missingFromWhitelist}`);
                console.log(`   Unused IPC Channels: ${healthReport.channels.summary.unusedInWhitelist}`);
            }
            
            // Architecture issues
            if (healthReport.architecture && healthReport.architecture.summary.total > 0) {
                console.log(chalk.cyan('\n🏛️ Architecture & Performance Issues:'));
                [...healthReport.architecture.issues.architecture, ...healthReport.architecture.issues.performance].forEach(issue => {
                    const severityColor = issue.severity === 'high' ? 'red' : 'yellow';
                    console.log(chalk[severityColor](`\n   [${issue.severity.toUpperCase()}] ${issue.message}`));
                    if (issue.file) {
                        console.log(chalk.gray(`   File: ${issue.file}`));
                    }
                    console.log(chalk.cyan(`   -> Recommendation: ${issue.recommendation}`));
                });
            }

            // Verbose details for duplicate code
            if (options.verbose && healthReport.details.duplicateCode.length > 0) {
                console.log(chalk.cyan('\n🔄 Duplicate Code Details:'));
                healthReport.details.duplicateCode.forEach((duplicate, index) => {
                    console.log(chalk.yellow(`\n   [Duplicate Set ${index + 1}] Found ${duplicate.duplicateCount} times:`));
                    console.log(chalk.gray('   ' + '—'.repeat(40)));
                    console.log(chalk.italic.gray(`   ${duplicate.block.replace(/\n/g, '\n   ')}`));
                    console.log(chalk.gray('   ' + '—'.repeat(40)));
                    duplicate.locations.forEach(loc => {
                        console.log(chalk.white(`   -> ${loc.file}:${loc.startLine}-${loc.endLine}`));
                    });
                });
            }

            // Recommendations
            if (healthReport.recommendations.length > 0) {
                console.log(chalk.cyan('\n💡 Recommendations:'));
                healthReport.recommendations.forEach(rec => {
                    const icon = rec.priority === 'high' ? '🚨' : 
                               rec.priority === 'medium' ? '⚠️' : '💡';
                    console.log(`   ${icon} ${rec.message}`);
                });
            }
            
            // Next steps
            if (healthReport.nextSteps.length > 0) {
                console.log(chalk.cyan('\n🎯 Recommended Next Steps:'));
                healthReport.nextSteps.forEach((step, index) => {
                    console.log(`   ${index + 1}. ${step.action}`);
                    console.log(`      Command: ${chalk.gray(step.command)}`);
                    console.log(`      ${step.description}`);
                });
            }
            
        } catch (error) {
            console.error(chalk.red(`❌ Health checkup failed: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('surgery')
    .description('🏥 Perform automated code surgery to remove unused code')
    .option('-p, --preload <path>', 'path to preload.js file', 'electron/preload.js')
    .option('-s, --source <pattern>', 'glob pattern for JS source files', '**/*.{js,jsx,ts,tsx}')
    .option('--css <pattern>', 'glob pattern for CSS files', '**/*.{css,scss,sass}')
    .option('--html <pattern>', 'glob pattern for HTML files', '**/*.{html,htm}')
    .option('-i, --ignore <patterns...>', 'glob patterns to ignore')
    .option('--no-safe-mode', 'use legacy regex-based modifications (DANGEROUS!)')
    .option('--no-backup', 'skip creating backup (DANGEROUS!)')
    .option('--no-validate-syntax', 'skip syntax validation after modifications')
    .option('--max-changes <num>', 'maximum changes per file (default: 10)', parseInt)
    .option('--conservative', 'use conservative mode - skip aggressive changes (default: true)')
    .option('--operations <ops>', 'comma-separated list of operations (unused-functions,unused-imports,unused-css-classes,dead-code-paths)')
    .option('-v, --verbose', 'show detailed output')
    .option('--dry-run', 'show what would be removed without making changes')
    .action(async (options) => {
        // Display safety warnings
        if (options.safeMode === false) {
            console.log(chalk.red('⚠️  WARNING: Running in LEGACY MODE with regex-based modifications!'));
            console.log(chalk.red('   This may cause syntax errors and break your code.'));
            console.log(chalk.yellow('   Consider using safe mode (default) for AST-based modifications.\n'));
        }
        
        if (!options.backup && !options.dryRun) {
            console.log(chalk.red('⚠️  WARNING: Running WITHOUT BACKUP!'));
            console.log(chalk.red('   You will not be able to restore your files if something goes wrong.\n'));
        }
        
        if (options.validateSyntax === false) {
            console.log(chalk.yellow('⚠️  WARNING: Syntax validation is DISABLED!'));
            console.log(chalk.yellow('   Modifications may introduce syntax errors.\n'));
        }
        
        if (options.dryRun) {
            console.log(chalk.yellow('🧪 DRY RUN MODE: No files will be modified\n'));
        } else {
            console.log(chalk.blue('🏥 Script Doctor: Preparing for surgical code cleanup...\n'));
            
            if (options.safeMode !== false) {
                console.log(chalk.green('🛡️  Using SAFE MODE with:'));
                console.log(chalk.green('   ✅ AST-based modifications'));
                console.log(chalk.green('   ✅ Syntax validation'));
                console.log(chalk.green('   ✅ Conservative changes'));
                console.log(chalk.green('   ✅ Automatic backups\n'));
            }
        }
        
        const doctor = new ChannelDoctor({
            preloadPath: options.preload,
            jsPattern: options.source,
            cssPattern: options.css,
            htmlPattern: options.html,
            ignore: options.ignore,
            verbose: options.verbose
        });
        
        try {
            const operations = options.operations ? options.operations.split(',') : [];
            
            if (options.dryRun && options.safeMode !== false) {
                // In safe mode dry run, perform the analysis with safe surgeon
                const surgeryOptions = {
                    safeMode: true,
                    dryRun: true,
                    validateSyntax: options.validateSyntax !== false,
                    conservative: options.conservative !== false,
                    maxChangesPerFile: options.maxChanges || 10,
                    operations,
                    verbose: options.verbose
                };
                
                const surgeryReport = await doctor.performCodeSurgery(surgeryOptions);
                
                if (surgeryReport.success === false && surgeryReport.message) {
                    console.log(chalk.green('\n✨ No surgical intervention needed!'));
                    console.log(surgeryReport.message);
                    return;
                }
                
                // Display what would be done
                console.log(chalk.cyan('🔍 Safe Surgery Preview:\n'));
                console.log(chalk.cyan('📊 Expected Results:'));
                console.log(`   Files to be analyzed: ${surgeryReport.statistics.filesAnalyzed}`);
                console.log(`   Files to be modified: ${surgeryReport.statistics.filesModified}`);
                console.log(`   Syntax errors prevented: ${surgeryReport.statistics.validationsFailed}`);
                console.log(`   Safety score: ${surgeryReport.summary.safetyScore}/100`);
                
                if (surgeryReport.errors && surgeryReport.errors.length > 0) {
                    console.log(chalk.yellow('\n⚠️  Potential Issues:'));
                    surgeryReport.errors.forEach(err => {
                        console.log(`   - ${err.file}: ${err.error}`);
                    });
                }
                
                console.log(chalk.cyan('\n💡 Run without --dry-run to perform actual surgery'));
                return;
            } else if (options.dryRun) {
                // Legacy mode dry run - just show the analysis
                const healthReport = await doctor.performHealthCheckup();
                
                console.log(chalk.cyan('🔍 Issues that would be surgically removed:\n'));
                
                if (healthReport.summary.unusedFunctions > 0) {
                    console.log(`🔪 ${healthReport.summary.unusedFunctions} unused functions`);
                }
                if (healthReport.summary.unusedImports > 0) {
                    console.log(`📦 ${healthReport.summary.unusedImports} unused imports`);
                }
                if (healthReport.summary.unusedCssClasses > 0) {
                    console.log(`🎨 ${healthReport.summary.unusedCssClasses} unused CSS classes`);
                }
                if (healthReport.summary.deadCodePaths > 0) {
                    console.log(`💀 ${healthReport.summary.deadCodePaths} dead code paths`);
                }
                
                console.log(chalk.cyan('\n💡 Run without --dry-run to perform actual surgery'));
                return;
            }
            
            const surgeryReport = await doctor.performCodeSurgery({
                safeMode: options.safeMode !== false,
                dryRun: options.dryRun,
                validateSyntax: options.validateSyntax !== false,
                conservative: options.conservative !== false,
                maxChangesPerFile: options.maxChanges,
                backup: options.backup !== false,
                operations,
                verbose: options.verbose
            });
            
            if (surgeryReport.success === false) {
                console.log(chalk.green('\n✨ No surgical intervention needed!'));
                console.log(surgeryReport.message);
                return;
            }
            
            // Display results based on mode
            if (surgeryReport.mode === 'SAFE' || surgeryReport.safety) {
                console.log(chalk.green('\n🎉 Safe Surgery completed successfully!\n'));
                
                console.log(chalk.cyan('📊 Surgery Statistics:'));
                console.log(`   Files Analyzed: ${surgeryReport.statistics.filesAnalyzed}`);
                console.log(`   Files Modified: ${surgeryReport.statistics.filesModified}`);
                console.log(`   Files Skipped: ${surgeryReport.statistics.filesSkipped}`);
                console.log(`   Modifications Successful: ${surgeryReport.statistics.modificationsSuccessful}`);
                console.log(`   Syntax Errors Prevented: ${surgeryReport.statistics.validationsFailed}`);
                console.log(`   Safety Score: ${surgeryReport.summary.safetyScore}/100`);
                
                if (surgeryReport.errors && surgeryReport.errors.length > 0) {
                    console.log(chalk.yellow('\n⚠️  Issues Encountered:'));
                    surgeryReport.errors.slice(0, 5).forEach(err => {
                        console.log(`   - ${err.file}: ${err.error}`);
                    });
                    if (surgeryReport.errors.length > 5) {
                        console.log(`   ... and ${surgeryReport.errors.length - 5} more`);
                    }
                }
            } else {
                // Legacy mode results
                console.log(chalk.green('\n🎉 Surgery completed!\n'));
                
                console.log(chalk.cyan('📊 Surgery Statistics:'));
                console.log(`   Files Modified: ${surgeryReport.summary.totalFilesModified}`);
                console.log(`   Lines Removed: ${surgeryReport.summary.totalLinesRemoved}`);
                console.log(`   Functions Removed: ${surgeryReport.statistics.functionsRemoved}`);
                console.log(`   Imports Removed: ${surgeryReport.statistics.importsRemoved}`);
                console.log(`   CSS Classes Removed: ${surgeryReport.statistics.cssClassesRemoved}`);
                console.log(`   Dead Code Removed: ${surgeryReport.statistics.deadCodeRemoved}`);
                console.log(`   Estimated Bundle Size Reduction: ${surgeryReport.summary.estimatedBundleSizeReduction}`);
                
                if (surgeryReport.warning) {
                    console.log(chalk.red(`\n⚠️  ${surgeryReport.warning}`));
                }
            }
            
            // Backup information (applies to both modes)
            if (surgeryReport.backup) {
                console.log(chalk.yellow('\n💾 Backup Information:'));
                console.log(`   Location: ${surgeryReport.backup.location}`);
                console.log(`   Restore: ${surgeryReport.backup.restore}`);
            }
            
            // Recommendations
            if (surgeryReport.recommendations && surgeryReport.recommendations.length > 0) {
                console.log(chalk.cyan('\n⚠️  Post-Surgery Recommendations:'));
                surgeryReport.recommendations.forEach(rec => {
                    const icon = rec.priority === 'high' ? '🚨' : '💡';
                    console.log(`   ${icon} ${rec.message}`);
                });
            }
            
        } catch (error) {
            console.error(chalk.red(`❌ Surgery failed: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('report')
    .description('📄 Generate detailed project health report')
    .option('-p, --preload <path>', 'path to preload.js file', 'electron/preload.js')
    .option('-s, --source <pattern>', 'glob pattern for JS source files', '**/*.{js,jsx,ts,tsx}')
    .option('--css <pattern>', 'glob pattern for CSS files', '**/*.{css,scss,sass}')
    .option('--html <pattern>', 'glob pattern for HTML files', '**/*.{html,htm}')
    .option('-i, --ignore <patterns...>', 'glob patterns to ignore')
    .option('-o, --output <file>', 'save report to file')
    .option('--format <type>', 'report format (json, markdown)', 'json')
    .action(async (options) => {
        console.log(chalk.blue('📄 Script Doctor: Generating comprehensive health report...\n'));
        
        const doctor = new ChannelDoctor({
            preloadPath: options.preload,
            jsPattern: options.source,
            cssPattern: options.css,
            htmlPattern: options.html,
            ignore: options.ignore
        });
        
        try {
            const healthReport = await doctor.generateHealthReport();
            
            let output;
            if (options.format === 'markdown') {
                output = generateMarkdownReport(healthReport);
            } else {
                output = JSON.stringify(healthReport, null, 2);
            }
            
            if (options.output) {
                fs.writeFileSync(options.output, output);
                console.log(chalk.green(`✅ Report saved to: ${options.output}`));
            } else {
                console.log(output);
            }
            
        } catch (error) {
            console.error(chalk.red(`❌ Report generation failed: ${error.message}`));
            process.exit(1);
        }
    });

// Helper function to generate markdown report
function generateMarkdownReport(healthReport) {
    const { healthScore, summary, recommendations, nextSteps } = healthReport;
    
    const scoreEmoji = healthScore >= 90 ? '🎉' : healthScore >= 70 ? '👍' : healthScore >= 50 ? '⚠️' : '🚨';
    
    return `# 🩺 Script Doctor Health Report

## ${scoreEmoji} Overall Health Score: ${healthScore}/100

Generated: ${new Date().toISOString()}  
Project: ${healthReport.project}

## 📊 Code Health Summary

| Metric | Count |
|--------|-------|
| Unused Functions | ${summary.unusedFunctions} |
| Unused Imports | ${summary.unusedImports} |
| Unused CSS Classes | ${summary.unusedCssClasses} |
| Dead Code Paths | ${summary.deadCodePaths} |
| Duplicate Code Blocks | ${summary.duplicateCode} |
| Complex Functions | ${summary.complexityIssues} |

## 💡 Recommendations

${recommendations.map(rec => `- ${rec.message}`).join('\n')}

## 🎯 Next Steps

${nextSteps.map((step, i) => `${i + 1}. **${step.action}**
   - Command: \`${step.command}\`
   - ${step.description}`).join('\n\n')}

---
*Report generated by electron-channel-doctor*`;
}

// Global error handler
process.on('unhandledRejection', (error) => {
    console.error(chalk.red('❌ Unhandled error:'), error.message);
    process.exit(1);
});

program.parse(); 