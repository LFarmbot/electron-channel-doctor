const { SecurityAnalyzer } = require('../lib/security-analyzer');
const fs = require('fs');
const path = require('path');

// Mock file system
jest.mock('fs');
jest.mock('glob');

describe('SecurityAnalyzer', () => {
    let analyzer;
    const mockProjectRoot = '/test/project';

    beforeEach(() => {
        analyzer = new SecurityAnalyzer({
            projectRoot: mockProjectRoot,
            verbose: false
        });
        
        // Reset mocks
        jest.clearAllMocks();
    });

    describe('Security Vulnerability Detection', () => {
        test('detects nodeIntegration: true as critical vulnerability', async () => {
            const mainContent = `
                const { BrowserWindow } = require('electron');
                
                const win = new BrowserWindow({
                    width: 800,
                    height: 600,
                    webPreferences: {
                        nodeIntegration: true,
                        contextIsolation: false
                    }
                });
            `;

            require('glob').sync.mockReturnValue(['/test/project/main.js']);
            fs.readFileSync.mockReturnValue(mainContent);

            const result = await analyzer.analyze();

            expect(result.success).toBe(true);
            expect(result.summary.critical).toBeGreaterThan(0);
            
            const nodeIntegrationIssue = result.vulnerabilities.critical.find(
                v => v.type === 'insecure-node-integration'
            );
            expect(nodeIntegrationIssue).toBeDefined();
            expect(nodeIntegrationIssue.message).toContain('nodeIntegration enabled');
        });

        test('detects unvalidated IPC handlers', async () => {
            const mainContent = `
                const { ipcMain } = require('electron');
                
                ipcMain.handle('dangerous-channel', async (event, data) => {
                    // No validation!
                    const fs = require('fs');
                    return fs.readFileSync(data.path, 'utf8');
                });
            `;

            require('glob').sync.mockReturnValue(['/test/project/main.js']);
            fs.readFileSync.mockReturnValue(mainContent);

            const result = await analyzer.analyze();

            expect(result.summary.critical).toBeGreaterThan(0);
            expect(result.summary.high).toBeGreaterThan(0);
            
            const dangerousAPI = result.vulnerabilities.critical.find(
                v => v.type === 'dangerous-api-exposure'
            );
            expect(dangerousAPI).toBeDefined();
            expect(dangerousAPI.api).toBe('fs');
        });

        test('detects missing contextBridge in preload', async () => {
            const preloadContent = `
                const { ipcRenderer } = require('electron');
                
                // Bad practice - directly exposing to window
                window.electronAPI = {
                    sendMessage: (channel, data) => ipcRenderer.send(channel, data)
                };
            `;

            require('glob').sync.mockReturnValue(['/test/project/preload.js']);
            fs.readFileSync.mockReturnValue(preloadContent);

            const result = await analyzer.analyze();

            const missingContextBridge = result.vulnerabilities.critical.find(
                v => v.type === 'missing-context-bridge'
            );
            expect(missingContextBridge).toBeDefined();
        });

        test('detects synchronous IPC usage', async () => {
            const rendererContent = `
                const result = ipcRenderer.sendSync('get-data', params);
                console.log(result);
            `;

            require('glob').sync.mockReturnValue(['/test/project/renderer.js']);
            fs.readFileSync.mockReturnValue(rendererContent);

            const result = await analyzer.analyze();

            const syncIPC = result.vulnerabilities.medium.find(
                v => v.type === 'synchronous-ipc'
            );
            expect(syncIPC).toBeDefined();
            expect(syncIPC.message).toContain('Synchronous IPC');
        });

        test('detects sensitive data exposure', async () => {
            const mainContent = `
                ipcMain.handle('get-user-data', async (event) => {
                    return {
                        password: user.password,
                        apiKey: process.env.API_KEY,
                        sessionToken: generateToken()
                    };
                });
            `;

            require('glob').sync.mockReturnValue(['/test/project/main.js']);
            fs.readFileSync.mockReturnValue(mainContent);

            const result = await analyzer.analyze();

            const sensitiveData = result.vulnerabilities.high.find(
                v => v.type === 'sensitive-data-exposure'
            );
            expect(sensitiveData).toBeDefined();
        });
    });

    describe('Security Score Calculation', () => {
        test('calculates perfect score for secure app', async () => {
            require('glob').sync.mockReturnValue([]);
            
            const result = await analyzer.analyze();
            
            expect(result.securityScore).toBe(100);
            expect(result.summary.total).toBe(0);
        });

        test('reduces score based on vulnerability severity', async () => {
            const vulnerabilities = {
                critical: [{ severity: 'critical' }],
                high: [{ severity: 'high' }, { severity: 'high' }],
                medium: Array(5).fill({ severity: 'medium' }),
                low: Array(10).fill({ severity: 'low' })
            };

            const score = analyzer.calculateSecurityScore(vulnerabilities);
            
            // 100 - 25 (critical) - 30 (high) - 25 (medium) - 20 (low) = 0
            expect(score).toBe(0);
        });
    });

    describe('Recommendations Generation', () => {
        test('generates appropriate recommendations', async () => {
            const analysis = {
                securityScore: 25,
                vulnerabilities: {
                    critical: [
                        { type: 'insecure-node-integration' },
                        { type: 'dangerous-api-exposure' }
                    ],
                    high: [],
                    medium: [],
                    low: []
                }
            };

            const recommendations = analyzer.generateRecommendations(analysis);

            expect(recommendations).toContainEqual(
                expect.objectContaining({
                    priority: 'CRITICAL',
                    action: 'Disable nodeIntegration and enable contextIsolation'
                })
            );

            expect(recommendations).toContainEqual(
                expect.objectContaining({
                    priority: 'HIGH',
                    action: 'Conduct security audit'
                })
            );
        });
    });
}); 