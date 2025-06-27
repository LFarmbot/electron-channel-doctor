const { SecurityAnalyzer } = require('../lib/security-analyzer');
const { getAstFromFile } = require('../lib/ast-parser');
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// Mock modules
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    promises: {
        readFile: jest.fn(),
    },
}));
jest.mock('glob');
jest.mock('../lib/ast-parser.js');

describe('SecurityAnalyzer', () => {
    let analyzer;
    const mockProjectRoot = '/test/project';
    let mockFsPromises;

    beforeEach(() => {
        analyzer = new SecurityAnalyzer({
            projectRoot: mockProjectRoot,
            verbose: false,
            // Provide explicit paths to avoid globbing in tests
            mainProcess: ['main.js'],
            preloadScripts: ['preload.js'],
            rendererProcess: ['renderer.js'],
        });
        
        // Reset mocks
        jest.clearAllMocks();
        mockFsPromises = require('fs').promises;
        mockFsPromises.readFile.mockResolvedValue(''); // Default mock
        require('glob').glob.mockImplementation(pattern => {
            if (analyzer.options.mainProcess.some(p => pattern.includes(p))) {
                return Promise.resolve(analyzer.options.mainProcess);
            }
            if (analyzer.options.preloadScripts.some(p => pattern.includes(p))) {
                return Promise.resolve(analyzer.options.preloadScripts);
            }
            if (analyzer.options.rendererProcess.some(p => pattern.includes(p))) {
                return Promise.resolve(analyzer.options.rendererProcess);
            }
            return Promise.resolve([]);
        });
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
            const ast = require('@babel/parser').parse(mainContent, { sourceType: 'module' });

            getAstFromFile.mockReturnValue({ ast, code: mainContent });

            const result = await analyzer.analyze();

            expect(result.success).toBe(true);
            expect(result.summary.critical).toBeGreaterThan(0);
            
            const nodeIntegrationIssue = result.vulnerabilities.critical.find(
                v => v.type === 'insecure-nodeintegration'
            );
            expect(nodeIntegrationIssue).toBeDefined();
            expect(nodeIntegrationIssue.message).toContain('nodeIntegration enabled');

            const contextIsolationIssue = result.vulnerabilities.critical.find(
                v => v.type === 'disabled-context-isolation'
            );
            expect(contextIsolationIssue).toBeDefined();
            expect(contextIsolationIssue.message).toContain('contextIsolation disabled');
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
            const ast = require('@babel/parser').parse(mainContent, { sourceType: 'module' });

            getAstFromFile.mockReturnValue({ ast, code: mainContent });

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
            
            mockFsPromises.readFile.mockResolvedValue(preloadContent);

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

            mockFsPromises.readFile.mockResolvedValue(rendererContent);

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
            const ast = require('@babel/parser').parse(mainContent, { sourceType: 'module' });

            getAstFromFile.mockReturnValue({ ast, code: mainContent });

            const result = await analyzer.analyze();

            const sensitiveData = result.vulnerabilities.high.find(
                v => v.type === 'sensitive-data-exposure'
            );
            expect(sensitiveData).toBeDefined();
        });
    });

    describe('Security Score Calculation', () => {
        test('calculates perfect score for secure app', async () => {
            require('glob').glob.mockResolvedValue([]);
            getAstFromFile.mockReturnValue(null);
            
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