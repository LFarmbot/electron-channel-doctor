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

// Global error handler
process.on('unhandledRejection', (error) => {
    console.error(chalk.red('❌ Unhandled error:'), error.message);
    process.exit(1);
});

program.parse(); 