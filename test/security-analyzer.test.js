const { SecurityAnalyzer } = require('../lib/security-analyzer');
const { MockFileSystem } = require('../lib/file-system');
const path = require('path');

describe('SecurityAnalyzer', () => {
    let analyzer;
    const mockProjectRoot = '/test/project';

    describe('Security Vulnerability Detection', () => {
        test('detects nodeIntegration: true as critical vulnerability', async () => {
            const mainPath = path.join(mockProjectRoot, 'main.js');
            const mockFiles = {
                [mainPath]: `
                    const { BrowserWindow } = require('electron');
                    const win = new BrowserWindow({
                        webPreferences: { nodeIntegration: true, contextIsolation: false }
                    });
                `
            };
            analyzer = new SecurityAnalyzer({
                projectRoot: mockProjectRoot,
                mainProcess: ['main.js'],
                fs: new MockFileSystem(mockFiles)
            });

            const result = await analyzer.analyze();
            
            expect(result.summary.critical).toBeGreaterThanOrEqual(2);
            
            const nodeIntegrationVuln = result.vulnerabilities.critical.find(v => v.type === 'insecure-node-integration');
            expect(nodeIntegrationVuln).toBeDefined();
            
            const contextIsolationVuln = result.vulnerabilities.critical.find(v => v.type === 'disabled-context-isolation');
            expect(contextIsolationVuln).toBeDefined();
        });

        test('detects unvalidated IPC handlers', async () => {
            const mainPath = path.join(mockProjectRoot, 'main.js');
            const mockFiles = {
                [mainPath]: `
                    const { ipcMain } = require('electron');
                    ipcMain.handle('dangerous-channel', async (event, data) => {
                        const fs = require('fs');
                        return fs.readFileSync(data.path, 'utf8');
                    });
                `
            };
            analyzer = new SecurityAnalyzer({
                projectRoot: mockProjectRoot,
                mainProcess: ['main.js'],
                fs: new MockFileSystem(mockFiles)
            });

            const result = await analyzer.analyze();

            expect(result.summary.critical).toBeGreaterThan(0);
            expect(result.summary.high).toBeGreaterThan(0);
        });

        test('detects missing contextBridge in preload', async () => {
            const preloadPath = path.join(mockProjectRoot, 'preload.js');
            const mockFiles = {
                [preloadPath]: `window.electronAPI = {};`
            };
            analyzer = new SecurityAnalyzer({
                projectRoot: mockProjectRoot,
                preloadScripts: ['preload.js'],
                fs: new MockFileSystem(mockFiles)
            });

            const result = await analyzer.analyze();
            
            const issue = result.vulnerabilities.critical.find(v => v.type === 'missing-context-bridge');
            expect(issue).toBeDefined();
        });

        test('detects synchronous IPC usage', async () => {
            const rendererContent = `
                const result = ipcRenderer.sendSync('get-data', params);
                console.log(result);
            `;

            const rendererPath = path.join(mockProjectRoot, 'renderer.js');
            const mockFiles = {
                [rendererPath]: rendererContent
            };
            analyzer = new SecurityAnalyzer({
                projectRoot: mockProjectRoot,
                rendererProcess: ['renderer.js'],
                fs: new MockFileSystem(mockFiles)
            });

            const result = await analyzer.analyze();

            const syncIPC = result.vulnerabilities.medium.find(
                v => v.type === 'synchronous-ipc'
            );
            expect(syncIPC).toBeDefined();
            expect(syncIPC.message).toContain('Synchronous IPC');
        });

        test('detects sensitive data exposure', async () => {
            const mainPath = path.join(mockProjectRoot, 'main.js');
            const mockFiles = {
                [mainPath]: `
                    const { ipcMain } = require('electron');
                    ipcMain.handle('get-user-data', async (event) => {
                        return {
                            password: user.password,
                            apiKey: process.env.API_KEY,
                            sessionToken: generateToken()
                        };
                    });
                `
            };
            analyzer = new SecurityAnalyzer({
                projectRoot: mockProjectRoot,
                mainProcess: ['main.js'],
                fs: new MockFileSystem(mockFiles)
            });

            const result = await analyzer.analyze();

            const sensitiveData = result.vulnerabilities.high.find(
                v => v.type === 'sensitive-data-exposure'
            );
            expect(sensitiveData).toBeDefined();
        });
    });

    describe('Security Score Calculation', () => {
        test('calculates perfect score for secure app', async () => {
            const secureMain = 'const a = 1;';
            const securePreload = `
                const { contextBridge } = require('electron');
                contextBridge.exposeInMainWorld('electronAPI', {});
                const validChannels = [];
            `;
            const mockFiles = {
                [path.join(mockProjectRoot, 'main.js')]: secureMain,
                [path.join(mockProjectRoot, 'preload.js')]: securePreload
            };
            analyzer = new SecurityAnalyzer({
                projectRoot: mockProjectRoot,
                mainProcess: ['main.js'],
                preloadScripts: ['preload.js'],
                fs: new MockFileSystem(mockFiles)
            });
            
            const result = await analyzer.analyze();
            
            expect(result.securityScore).toBe(100);
            expect(result.summary.total).toBe(0);
        });

        test('reduces score based on vulnerability severity', () => {
            const vulnerabilities = {
                critical: [{ severity: 'critical' }],
                high: [{ severity: 'high' }, { severity: 'high' }],
                medium: Array(5).fill({ severity: 'medium' }),
                low: Array(10).fill({ severity: 'low' })
            };

            const score = analyzer.calculateSecurityScore(vulnerabilities);
            
            // 100 - (1*25) - (2*15) - (5*5) - (10*2) = 100 - 25 - 30 - 25 - 20 = 0
            expect(score).toBe(0);
        });
    });

    describe('Recommendations Generation', () => {
        test('generates appropriate recommendations', () => {
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