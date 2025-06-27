# 🔧 Electron Channel Doctor

> Automate Electron IPC invoke channel management and prevent "Invalid invoke channel" errors

[![npm version](https://badge.fury.io/js/electron-channel-doctor.svg)](https://badge.fury.io/js/electron-channel-doctor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ What is this?

When building Electron apps, you use `window.electronAPI.invoke('channel-name')` to communicate between renderer and main processes. For security, these channels must be whitelisted in your `preload.js` file. If you forget to add a channel, you get this error:

```
❌ Invalid invoke channel: my-new-channel
```

**Electron Channel Doctor** automatically:
- 🔍 **Scans** your codebase for all `electronAPI.invoke()` calls
- ✅ **Compares** them with your preload.js whitelist  
- 🚨 **Alerts** you about missing or unused channels
- 🔧 **Auto-fixes** your preload.js (with backup!)

## 📦 Installation

```bash
# Global installation (recommended)
npm install -g electron-channel-doctor

# Or use with npx (no installation)
npx electron-channel-doctor
```

## 🚀 Quick Start

```bash
# Check your project for channel issues
electron-channel-doctor

# Auto-fix missing channels
electron-channel-doctor fix

# See all available commands
electron-channel-doctor --help
```

## 📖 Usage

### Basic Commands

```bash
# Check for issues (default command)
electron-channel-doctor check

# Fix missing channels automatically
electron-channel-doctor fix

# List all channels
electron-channel-doctor list

# Show what would be fixed (dry run)
electron-channel-doctor fix --dry-run
```

### Custom Paths

```bash
# Custom preload.js location
electron-channel-doctor --preload src/preload.js

# Custom source code pattern  
electron-channel-doctor --source "renderer/**/*.js"

# Both custom paths
electron-channel-doctor --preload main/preload.js --source "app/**/*.js"
```

### Example Output

```bash
🔍 Electron Channel Doctor - Checking invoke channels...

📊 Results:
   Found 23 unique invoke channels in use
   Currently whitelisted: 25 channels
   Missing from whitelist: 2
   Unused in whitelist: 4

❌ Missing channels (add these to preload.js):
   'get-signed-video-url',
   'upload-file-to-cloud',

⚠️  Unused channels (consider removing):
   'old-feature-channel',
   'deprecated-method',

💡 Tip: Run electron-channel-doctor fix to automatically fix missing channels
```

## 🔧 Commands

### `check` (default)
Analyzes your project and reports channel mismatches.

**Options:**
- `-p, --preload <path>` - Path to preload.js (default: `electron/preload.js`)  
- `-s, --source <pattern>` - Glob pattern for JS files (default: `public/js/**/*.js`)
- `-v, --verbose` - Show detailed output
- `--json` - Output results as JSON

**Examples:**
```bash
electron-channel-doctor check
electron-channel-doctor check --preload src/preload.js --verbose
electron-channel-doctor check --json > channels.json
```

### `fix`
Automatically fixes missing channels in preload.js.

**Options:**
- `-p, --preload <path>` - Path to preload.js
- `-s, --source <pattern>` - Glob pattern for JS files  
- `-v, --verbose` - Show detailed output
- `--dry-run` - Show changes without applying them

**Examples:**
```bash
electron-channel-doctor fix
electron-channel-doctor fix --dry-run
electron-channel-doctor fix --preload main/preload.js
```

### `list`
Lists all found invoke channels with their status.

**Options:**
- `--used-only` - Only show channels actually used in code
- `--unused-only` - Only show channels that are unused

**Examples:**
```bash
electron-channel-doctor list
electron-channel-doctor list --used-only
electron-channel-doctor list --unused-only  
```

### `init`
Creates a configuration file for your project.

```bash
electron-channel-doctor init
```

Creates `.channel-doctor.json`:
```json
{
  "preloadPath": "electron/preload.js",
  "jsSource": "src/**/*.js",
  "ignore": [
    "**/node_modules/**",
    "**/dist/**", 
    "**/build/**"
  ]
}
```

## 🔍 How It Works

### 1. **Code Scanning**
Searches for patterns like:
```javascript
// These are automatically detected:
window.electronAPI.invoke('my-channel', data)
electronAPI.invoke('another-channel', params)
await electronAPI.invoke('async-channel')
```

### 2. **Preload Analysis**  
Parses your preload.js and finds the `validInvokeChannels` array:
```javascript
const validInvokeChannels = [
    'get-user-data',
    'save-file',
    'my-channel'  // ← Checks against this list
];
```

### 3. **Intelligent Fixing**
- 🔒 **Preserves infrastructure channels** (like `get-platform`)
- 📝 **Creates automatic backups** before making changes
- 🎯 **Only adds missing channels** that are actually used
- 🧹 **Optionally removes unused channels**

## 📁 Project Structure Support

Works with common Electron project structures:

```
my-electron-app/
├── electron/
│   ├── main.js
│   └── preload.js          ← Whitelist location
├── src/
│   ├── renderer/
│   │   ├── components/
│   │   └── utils/          ← Scanned for invoke() calls
├── public/
└── dist/
```

```
another-structure/
├── main/
│   └── preload.js          ← Custom preload location
├── renderer/
│   └── js/                 ← Custom source location
└── build/
```

## ⚙️ Configuration

### Option 1: Configuration File
Create `.channel-doctor.json` in your project root:

```json
{
  "preloadPath": "main/preload.js",
  "jsSource": "renderer/**/*.js", 
  "ignore": [
    "**/test/**",
    "**/spec/**"
  ]
}
```

### Option 2: Command Line Options
```bash
electron-channel-doctor --preload main/preload.js --source "renderer/**/*.js"
```

### Option 3: package.json
Add configuration to your package.json:

```json
{
  "electronChannelDoctor": {
    "preloadPath": "build/preload.js",
    "jsSource": "src/**/*.{js,ts}"
  }
}
```

## 🔄 CI/CD Integration

### GitHub Actions

```yaml
name: Channel Check
on: [push, pull_request]

jobs:
  channel-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install -g electron-channel-doctor
      - run: electron-channel-doctor check
```

### npm scripts

```json
{
  "scripts": {
    "check-channels": "electron-channel-doctor check",
    "fix-channels": "electron-channel-doctor fix",
    "pretest": "electron-channel-doctor check"
  }
}
```

## 🛠️ API Usage

Use programmatically in your Node.js scripts:

```javascript
const { ChannelDoctor, analyze, fix } = require('electron-channel-doctor');

// Simple analysis
const result = analyze({
  preloadPath: 'electron/preload.js',
  jsSource: 'src/**/*.js'
});

console.log(`Found ${result.summary.foundChannels} channels`);
console.log(`Missing: ${result.channels.missing.join(', ')}`);

// Advanced usage
const doctor = new ChannelDoctor({
  preloadPath: 'main/preload.js',
  jsSource: 'renderer/**/*.js',
  verbose: true
});

const analysis = doctor.analyze();
if (analysis.channels.missing.length > 0) {
  console.log('Fixing missing channels...');
  doctor.fix();
}
```

## 🐛 Troubleshooting

### "Preload file not found"
Make sure the path to your preload.js is correct:
```bash
electron-channel-doctor --preload path/to/your/preload.js
```

### "No invoke calls found"
Check your source pattern:
```bash
electron-channel-doctor --source "your-source-dir/**/*.js" --verbose
```

### "Could not find validInvokeChannels array"
Your preload.js needs this structure:
```javascript
const validInvokeChannels = [
    'channel-1',
    'channel-2'
];
```

### False Positives
If you have dynamic channel names, you may need to manually verify:
```javascript
// This won't be detected automatically:
const channelName = 'dynamic-' + suffix;
electronAPI.invoke(channelName);
```

## 🏗️ Common Electron Patterns

### Basic Setup
```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, ...args) => {
    const validInvokeChannels = [
      'get-app-version',
      'save-user-data',
      'load-file'
    ];
    
    if (validInvokeChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    
    return Promise.reject(new Error(`Invalid invoke channel: ${channel}`));
  }
});
```

### Renderer Usage
```javascript
// renderer.js
async function saveData() {
  try {
    await window.electronAPI.invoke('save-user-data', userData);
  } catch (error) {
    console.error('Failed to save:', error);
  }
}
```

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/electron-channel-doctor.git`
3. **Install** dependencies: `npm install`
4. **Make** your changes
5. **Test** your changes: `npm test`
6. **Submit** a pull request

### Development Setup

```bash
git clone https://github.com/YOUR_USERNAME/electron-channel-doctor.git
cd electron-channel-doctor
npm install
npm link  # Makes electron-channel-doctor available globally for testing
```

### Running Tests

```bash
npm test
npm run lint
```

## 📋 Roadmap

- [ ] **ESLint Plugin** - Real-time channel validation in your editor
- [ ] **VS Code Extension** - Integrated channel management
- [ ] **TypeScript Support** - Better parsing for .ts files  
- [ ] **Workflow Visualization** - Visual mapping of channel usage
- [ ] **Auto-documentation** - Generate channel documentation
- [ ] **Framework Integration** - Support for Electron frameworks

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## ❤️ Acknowledgments

- **Electron Team** - For creating an amazing framework
- **Doyensec** - For Electronegativity, which inspired security-focused tooling
- **Community** - For feedback and contributions

---

**Made with ❤️ for the Electron community**

Found this helpful? ⭐ Star the repo and share with other Electron developers! 