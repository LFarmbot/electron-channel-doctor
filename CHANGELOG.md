# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- ESLint plugin for real-time validation
- VS Code extension integration
- TypeScript support
- Workflow visualization
- Auto-documentation generation
- Framework-specific templates

## [2.3.0] - 2024-01-15

### 🚨 CRITICAL: Major Safety Improvements

This release addresses **catastrophic code destruction issues** reported by users where the tool was introducing syntax errors across entire codebases. The regex-based code modification system has been completely replaced with a safe, AST-based approach.

### Added
- **🛡️ Safe Mode (Default)** - Complete rewrite using AST-based code modifications
  - Proper JavaScript parsing with Babel AST
  - Syntax validation after every modification
  - Conservative mode to prevent aggressive changes
  - Per-file change limits (default: 10 modifications)
  - Detailed error reporting and safety scoring
  - Dry run preview with expected results

- **New CLI Options for Surgery Command:**
  - `--no-safe-mode` - Use legacy regex mode (dangerous)
  - `--no-validate-syntax` - Skip syntax validation
  - `--max-changes <num>` - Set maximum changes per file
  - `--conservative` - Enable conservative mode (default: true)

- **New SafeCodeSurgeon Class** - AST-based code surgeon for programmatic use
- **Babel dependencies** moved to production dependencies for AST parsing

### Fixed
- **Critical: Missing closing parentheses** in require() statements
- **Critical: Destroyed semicolons** causing syntax errors
- **Critical: Line merging** creating unreadable code
- **Critical: Try-catch blocks** being corrupted
- **Critical: Function calls** being mangled
- **Critical: Missing 'k' variable** in formatBytes function
- **Critical: Incorrect string escaping** in regex replacements (\\n vs \n)

### Changed
- **Surgery now uses Safe Mode by default** - Legacy mode requires explicit flag
- **Added multiple safety warnings** when using dangerous options
- **Improved backup system** with detailed restoration scripts
- **Better error handling** with graceful degradation

### Security
- All code modifications now validate syntax before saving
- Automatic rollback on syntax errors
- Conservative limits prevent runaway modifications

### Migration Guide

**For most users, no changes needed!** The tool now defaults to safe mode.

If you absolutely need the old behavior (not recommended):
```bash
# ⚠️ DANGEROUS - May break your code
electron-channel-doctor surgery --no-safe-mode
```

We strongly recommend using the new safe mode:
```bash
# Safe mode is default
electron-channel-doctor surgery

# With explicit safety options
electron-channel-doctor surgery --conservative --max-changes 5
```

### Developer Notes

The new `SafeCodeSurgeon` class is available for programmatic use:
```javascript
const { SafeCodeSurgeon } = require('electron-channel-doctor');

const surgeon = new SafeCodeSurgeon({
  validateSyntax: true,
  conservative: true,
  maxChangesPerFile: 10
});
```

## [2.2.1] - 2024-05-24

### Fixed
- Resolved a series of cascading errors in the `health` command that originated from an `Invalid regular expression` bug in the complexity analysis.
- Stabilized file scanning by converting all `glob` calls to `glob.sync` across `unused-code-detector.js`, `security-analyzer.js`, and `architecture-analyzer.js`, eliminating "path must be a string" errors.
- Corrected faulty regex construction in the `calculateComplexity` method.
- Fixed AST parser to handle both `StringLiteral` and `Literal` node types for better compatibility with different Babel configurations.

### Improved
- **Enhanced Testability**: Introduced dependency injection pattern for file system operations, making the codebase more testable and maintainable.
- **New MockFileSystem**: Added comprehensive mock file system for unit testing with proper glob pattern support.
- **Better Architecture**: Refactored core classes to accept `fs` parameter, enabling better separation of concerns and easier testing.
- **Improved Test Coverage**: Fixed all unit tests to work with the new dependency injection pattern.

### Developer Experience
- Tests now run reliably with proper mocking of file system operations.
- Easier to test custom file system scenarios.
- Better separation between file system operations and business logic.
- All tests pass consistently, enabling reliable CI/CD publishing.

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