### **Project:** `electron-channel-doctor` Improvement Initiative - Phase 3

**Core Objective:** Evolve the `electron-channel-doctor` into a world-class analysis platform by integrating up-to-date intelligence on security, performance, and architecture best practices.

**Current State:**
*   **Phase:** Phase 3: Intelligence Augmentation
*   **Last Action:** Completed Phase 3, Task 3. Enhanced `ArchitectureAnalyzer` to advise on deprecations and modernization, including checks for outdated Electron versions and deprecated API usage.

---

### **The Master Plan: Phase 3 - Intelligence Augmentation**

This phase moves beyond foundational checks to provide deep, actionable insights based on patterns seen in modern, high-performance, and secure Electron applications.

*   **Task 1: Advanced Security Analysis. (✅ COMPLETE)**
    *   **Goal:** Proactively detect common, high-impact security vulnerabilities before they become a threat.
    *   **Action:** Enhance `security-analyzer.js` to detect and report on:
        1.  **Insecure `shell.openExternal` Usage:** Flag calls to `shell.openExternal` that use non-literal string arguments, which could be controlled by user input.
        2.  **Missing IPC Sender Validation:** Identify `ipcMain.on` or `ipcMain.handle` listeners that do not appear to validate `event.senderFrame`, a critical defense against renderer spoofing.
        3.  **Deprecated/Insecure Configurations:** Warn about the use of `webviewTag: true` in `webPreferences`, recommending modern alternatives like `BrowserView` or `WebContentsView`.

*   **Task 2: Performance & Architecture Linter. (✅ COMPLETE)**
    *   **Goal:** Guide developers away from common performance pitfalls and toward modern architectural patterns.
    *   **Action:** Create a new `architecture-analyzer.js` module that will:
        1.  **Detect Synchronous IPC:** Scan for `ipcRenderer.sendSync` and recommend asynchronous patterns to avoid blocking the main process.
        2.  **Promote Code-Splitting:** Identify large, common libraries being loaded synchronously and recommend using dynamic `import()` for better startup performance.
        3.  **Encourage Bundling:** Check `package.json` for the absence of a modern bundler (`webpack`, `vite`, `esbuild`) and recommend its adoption.

*   **Task 3: Deprecation & Modernization Advisor. (✅ COMPLETE)**
    *   **Goal:** Automate the process of keeping an Electron app aligned with the latest API best practices.
    *   **Action:** Enhance the analysis pipeline to:
        1.  **Flag Deprecated APIs:** Scan for usage of recently deprecated APIs (e.g., `BrowserView`, `app.runningUnderRosettaTranslation`) based on the official "Breaking Changes" documentation.
        2.  **Verify Electron Version:** Check the project's Electron version against the officially supported releases and warn if it has fallen out of the support window.

---

### **Your Directive:**

You are the AI entity responsible for executing this plan. Your memory is this document.

**Your immediate task is to begin `Phase 3, Task 3: Deprecation & Modernization Advisor`.**

1.  Enhance `lib/architecture-analyzer.js` to perform the new checks.
2.  Implement logic to read the project's `package.json`, check its Electron version against the latest supported versions, and warn if it's outdated.
3.  Implement a scanner that searches for a list of known deprecated APIs (e.g., `BrowserView`, `app.runningUnderRosettaTranslation`) across the codebase.
4.  Ensure the results from these new checks are integrated into the analyzer's report and displayed clearly in the CLI output.
5.  Upon successful completion, update this document's "Current State" to signify the completion of Phase 3.
6.  Then, you will halt and await the user's command for the next mission. 