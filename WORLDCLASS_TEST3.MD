### **Project:** `electron-channel-doctor` Improvement Initiative - Phase 4

**Core Objective:** Massively upgrade the intelligence and accuracy of all analysis modules by migrating from regex-based scanning to Abstract Syntax Tree (AST) parsing.

**Current State:**
*   **Phase:** Phase 4: Smart Code Analysis
*   **Last Action:** Completed Phase 4, Task 4. Refactored `unused-code-detector.js` to use ASTs.

---

### **The Master Plan: Phase 4 - Smart Code Analysis**

This phase represents a quantum leap in our analytical capabilities. By understanding the structure of the code, not just its text, we can eliminate false positives, detect far more nuanced issues, and provide more precise and actionable advice.

*   **Task 1: Integrate AST Parser. (✅ COMPLETE)**
    *   **Goal:** Add a robust JavaScript parser to the project to enable AST-based analysis.
    *   **Action:**
        1.  Add `@babel/parser` to the project's `devDependencies`. It is powerful, well-maintained, and supports modern JavaScript syntax.
        2.  Create a utility function or class that can take a file path, read its content, and return its AST.

*   **Task 2: Refactor `security-analyzer.js` with ASTs. (✅ COMPLETE)**
    *   **Goal:** Re-implement the existing security checks using AST traversal for superior accuracy.
    *   **Action:**
        1.  **Insecure `shell.openExternal` Usage:** Traverse the AST to find `CallExpression` nodes where the callee is `shell.openExternal`. Analyze the arguments to determine if they are non-literal values (e.g., variables, function calls), which is a high-risk pattern.
        2.  **Missing IPC Sender Validation:** For `ipcMain.on` or `ipcMain.handle` listeners, inspect the function body to verify that `event.senderFrame` or `event.sender` is accessed and its properties (like `url`) are validated before sensitive operations are performed. This is nearly impossible with regex.
        3.  **Insecure `webPreferences`:** Parse the main process entry point to find `new BrowserWindow()` expressions. Inspect the `webPreferences` object to flag insecure settings like `contextIsolation: false` or `nodeIntegration: true`.

*   **Task 3: Refactor `architecture-analyzer.js` with ASTs. (✅ COMPLETE)**
    *   **Goal:** Improve architectural analysis by understanding code relationships.
    *   **Action:**
        1.  **Detect Synchronous IPC:** Find `ipcRenderer.sendSync` calls and flag them. ASTs make this trivial and accurate.
        2.  **Flag Deprecated APIs:** Create a list of deprecated API call patterns (e.g., `app.runningUnderRosettaTranslation`). Traverse the AST to find and report any usage.

*   **Task 4: Refactor `unused-code-detector.js` with ASTs. (✅ COMPLETE)**
    *   **Goal:** Dramatically improve the accuracy of unused code detection.
    *   **Action:**
        1.  Parse all relevant source files to build a complete map of all exported and invoked IPC channels (`ipcMain.handle` and `ipcRenderer.invoke`).
        2.  Compare the sets of defined handlers vs. invoked channels to accurately identify handlers that are defined but never called.

---

### **Your Directive:**

You are the AI entity responsible for executing this plan. Your memory is this document.

**Your immediate task is complete. Await further instructions.** 