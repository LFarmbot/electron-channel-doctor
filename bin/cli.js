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
    .option('-v, --verbose', 'verbose output')
    .option('--json', 'output results as JSON')
    .action(async (options) => {
        console.log(chalk.blue('🔍 Electron Channel Doctor - Checking invoke channels...\n'));

        const doctor = new ChannelDoctor({
            preloadPath: options.preload,
            jsSource: options.source,
            verbose: options.verbose
        });

        const result = doctor.analyze();

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
    .option('-v, --verbose', 'verbose output')
    .option('--dry-run', 'show what would be changed without making changes')
    .action(async (options) => {
        console.log(chalk.blue('🔧 Electron Channel Doctor - Fixing invoke channels...\n'));

        const doctor = new ChannelDoctor({
            preloadPath: options.preload,
            jsSource: options.source,
            verbose: options.verbose
        });

        try {
            if (options.dryRun) {
                const fixed = doctor.generateFixedPreload();
                console.log(chalk.yellow('🔍 Dry run - showing what would be changed:\n'));
                console.log(chalk.green(`✅ Would keep ${fixed.channels.length} channels`));
                if (fixed.removed.length > 0) {
                    console.log(chalk.red(`❌ Would remove ${fixed.removed.length} unused channels:`));
                    fixed.removed.forEach(ch => console.log(chalk.gray(`   '${ch}'`)));
                }
                console.log(chalk.blue('\n💡 Run without --dry-run to apply changes'));
                return;
            }

            const result = doctor.fix();
            
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
    .option('--used-only', 'only show channels that are actually used')
    .option('--unused-only', 'only show channels that are unused')
    .action(async (options) => {
        const doctor = new ChannelDoctor({
            preloadPath: options.preload,
            jsSource: options.source
        });

        const result = doctor.analyze();

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
    .command('health')
    .description('🩺 Perform comprehensive code health checkup')
    .option('-p, --preload <path>', 'path to preload.js file', 'electron/preload.js')
    .option('-s, --source <pattern>', 'glob pattern for JS source files', '**/*.{js,jsx,ts,tsx}')
    .option('--css <pattern>', 'glob pattern for CSS files', '**/*.{css,scss,sass}')
    .option('--html <pattern>', 'glob pattern for HTML files', '**/*.{html,htm}')
    .option('-v, --verbose', 'show detailed output')
    .option('--json', 'output as JSON')
    .action(async (options) => {
        console.log(chalk.blue('🩺 Script Doctor: Performing comprehensive health checkup...\n'));
        
        const doctor = new ChannelDoctor({
            preloadPath: options.preload,
            jsPattern: options.source,
            cssPattern: options.css,
            htmlPattern: options.html,
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
    .option('--no-backup', 'skip creating backup (DANGEROUS!)')
    .option('--operations <ops>', 'comma-separated list of operations (unused-functions,unused-imports,unused-css-classes,dead-code-paths)')
    .option('-v, --verbose', 'show detailed output')
    .option('--dry-run', 'show what would be removed without making changes')
    .action(async (options) => {
        if (options.dryRun) {
            console.log(chalk.yellow('🧪 DRY RUN MODE: No files will be modified\n'));
        } else {
            console.log(chalk.blue('🏥 Script Doctor: Preparing for surgical code cleanup...\n'));
        }
        
        const doctor = new ChannelDoctor({
            preloadPath: options.preload,
            jsPattern: options.source,
            cssPattern: options.css,
            htmlPattern: options.html,
            verbose: options.verbose
        });
        
        try {
            const operations = options.operations ? options.operations.split(',') : [];
            
            if (options.dryRun) {
                // Just show the analysis
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
                safeMode: options.backup,
                operations,
                verbose: options.verbose
            });
            
            if (surgeryReport.success === false) {
                console.log(chalk.green('\n✨ No surgical intervention needed!'));
                console.log(surgeryReport.message);
                return;
            }
            
            // Display results
            console.log(chalk.green('\n🎉 Surgery completed successfully!\n'));
            
            console.log(chalk.cyan('📊 Surgery Statistics:'));
            console.log(`   Files Modified: ${surgeryReport.summary.totalFilesModified}`);
            console.log(`   Lines Removed: ${surgeryReport.summary.totalLinesRemoved}`);
            console.log(`   Functions Removed: ${surgeryReport.statistics.functionsRemoved}`);
            console.log(`   Imports Removed: ${surgeryReport.statistics.importsRemoved}`);
            console.log(`   CSS Classes Removed: ${surgeryReport.statistics.cssClassesRemoved}`);
            console.log(`   Dead Code Removed: ${surgeryReport.statistics.deadCodeRemoved}`);
            console.log(`   Estimated Bundle Size Reduction: ${surgeryReport.summary.estimatedBundleSizeReduction}`);
            
            if (surgeryReport.backup) {
                console.log(chalk.yellow('\n💾 Backup Information:'));
                console.log(`   Location: ${surgeryReport.backup.location}`);
                console.log(`   Restore: ${surgeryReport.backup.restore}`);
            }
            
            // Recommendations
            if (surgeryReport.recommendations.length > 0) {
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
    .option('-o, --output <file>', 'save report to file')
    .option('--format <type>', 'report format (json, markdown)', 'json')
    .action(async (options) => {
        console.log(chalk.blue('📄 Script Doctor: Generating comprehensive health report...\n'));
        
        const doctor = new ChannelDoctor({
            preloadPath: options.preload,
            jsPattern: options.source,
            cssPattern: options.css,
            htmlPattern: options.html
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
*Report generated by electron-channel-doctor*
`;
}

// Global error handler
process.on('unhandledRejection', (error) => {
    console.error(chalk.red('❌ Unhandled error:'), error.message);
    process.exit(1);
});

program.parse(); 