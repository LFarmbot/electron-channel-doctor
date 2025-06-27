# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2024-01-15

### 🔒 Major Security Update

#### Added
- **Security Vulnerability Detection** - Comprehensive Electron IPC security analysis
  - Detects context isolation bypasses
  - Finds dangerous Node.js API exposure
  - Identifies unvalidated IPC handlers
  - Catches insecure Electron configurations (nodeIntegration, webSecurity)
  - Detects sensitive data exposure in IPC channels
  - Validates sender/frame verification (CVE-2022-29247 pattern)
- **Security Score** - 0-100 scoring based on vulnerability severity
- **CLI Command** - `electron-channel-doctor security` with full reporting
- **CVE-based Detection** - Based on real 2024 security research and CVEs
- **Actionable Recommendations** - Clear fixes for each vulnerability type

#### Enhanced
- Health scoring now includes security vulnerabilities (highest impact)
- Comprehensive health reports now include security analysis
- Added security-specific npm scripts for CI/CD integration

## [2.0.0] - 2024-01-10

### Added
- 🎉 Initial release of Electron Channel Doctor
- 🔍 **Channel Analysis** - Scan codebase for `electronAPI.invoke()` calls
- ✅ **Whitelist Validation** - Compare against preload.js whitelist
- 🔧 **Auto-fix** - Automatically update preload.js with missing channels
- 📋 **Channel Listing** - List all used, unused, and missing channels
- 🛠️ **CLI Interface** - Full command-line interface with multiple commands
- 📚 **API Library** - Programmatic access via Node.js API
- ⚙️ **Configuration** - Support for config files and custom paths
- 🔄 **CI/CD Integration** - Exit codes for automated workflows
- 🎨 **Beautiful Output** - Colorized console output with emojis
- 📖 **Comprehensive Documentation** - Full README with examples
- 🧪 **Example Project** - Working example to demonstrate functionality

### Commands
- `check` - Analyze project for channel mismatches (default)
- `fix` - Auto-fix missing channels in preload.js
- `list` - List all channels with status
- `init` - Create configuration file

### Features
- **Smart Backup** - Automatic backup before making changes
- **Dry Run** - Preview changes before applying
- **Verbose Mode** - Detailed output for debugging
- **JSON Output** - Machine-readable results
- **Glob Patterns** - Flexible file matching
- **Infrastructure Preservation** - Keep essential system channels
- **Multiple Project Structures** - Works with various Electron setups

### API
- `ChannelDoctor` class for advanced usage
- `analyze()` function for simple analysis
- `fix()` function for automated fixing
- Configurable options for all functions

### Documentation
- Complete README with usage examples
- API documentation
- CI/CD integration guides
- Troubleshooting section
- Contribution guidelines
- MIT License

## [Unreleased]

### Planned
- ESLint plugin for real-time validation
- VS Code extension integration
- TypeScript support
- Workflow visualization
- Auto-documentation generation
- Framework-specific templates 