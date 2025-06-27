const { ChannelDoctor } = require('../lib/index.js');
const fs = require('fs');
const path = require('path');

// Mock fs for testing
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    promises: {
        readFile: jest.fn(),
        writeFile: jest.fn(),
        copyFile: jest.fn(),
    },
}));
jest.mock('glob');

describe('ChannelDoctor', () => {
    let mockFsPromises;
    let mockGlob;
    
    beforeEach(() => {
        mockFsPromises = require('fs').promises;
        mockGlob = require('glob');
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        test('should initialize with default options', () => {
            const doctor = new ChannelDoctor();
            expect(doctor.options.preloadPath).toBe('electron/preload.js');
            expect(doctor.options.jsSource).toBe('public/js/**/*.js');
        });

        test('should accept custom options', () => {
            const options = {
                preloadPath: 'custom/preload.js',
                jsSource: 'src/**/*.js',
                verbose: true
            };
            const doctor = new ChannelDoctor(options);
            expect(doctor.options.preloadPath).toBe('custom/preload.js');
            expect(doctor.options.jsSource).toBe('src/**/*.js');
            expect(doctor.options.verbose).toBe(true);
        });
    });

    describe('getCurrentWhitelist', () => {
        test('should parse validInvokeChannels from preload.js', async () => {
            const mockPreloadContent = `
const validInvokeChannels = [
    'channel-1',
    'channel-2',
    'channel-3'
];
            `;
            
            mockFsPromises.readFile.mockResolvedValue(mockPreloadContent);
            
            const doctor = new ChannelDoctor();
            const channels = await doctor.getCurrentWhitelist();
            
            expect(channels).toEqual(['channel-1', 'channel-2', 'channel-3']);
        });

        test('should throw error if preload file does not exist', async () => {
            mockFsPromises.readFile.mockRejectedValue({ code: 'ENOENT' });
            
            const doctor = new ChannelDoctor();
            
            await expect(doctor.getCurrentWhitelist()).rejects.toThrow('Preload file not found');
        });

        test('should return an empty array if validInvokeChannels not found', async () => {
            const mockPreloadContent = 'const someOtherArray = [];';
            
            mockFsPromises.readFile.mockResolvedValue(mockPreloadContent);
            
            const doctor = new ChannelDoctor();
            const channels = await doctor.getCurrentWhitelist();
            
            expect(channels).toEqual([]);
        });
    });

    describe('scanForInvokeCalls', () => {
        test('should find electronAPI.invoke calls in files', async () => {
            const mockFiles = ['file1.js', 'file2.js'];
            const mockContent1 = `
                electronAPI.invoke('test-channel-1', data);
                window.electronAPI.invoke('test-channel-2');
            `;
            const mockContent2 = `
                await electronAPI.invoke('test-channel-3', params);
            `;
            
            mockGlob.glob.mockResolvedValue(mockFiles);
            mockFsPromises.readFile.mockImplementation(filePath => {
                if (filePath === 'file1.js') return Promise.resolve(mockContent1);
                if (filePath === 'file2.js') return Promise.resolve(mockContent2);
                return Promise.reject(new Error('File not found'));
            });
            
            const doctor = new ChannelDoctor();
            const channels = await doctor.scanForInvokeCalls();
            
            expect(channels).toEqual(['test-channel-1', 'test-channel-2', 'test-channel-3']);
        });

        test('should handle file read errors gracefully', async () => {
            const mockFiles = ['file1.js'];
            
            mockGlob.glob.mockResolvedValue(mockFiles);
            mockFsPromises.readFile.mockImplementation(() => {
                throw new Error('File read error');
            });
            
            const doctor = new ChannelDoctor();
            const channels = await doctor.scanForInvokeCalls();
            
            expect(channels).toEqual([]);
        });
    });

    describe('analyze', () => {
        test('should return analysis results', async () => {
            const mockPreloadContent = `
const validInvokeChannels = [
    'channel-1',
    'channel-2',
    'unused-channel'
];
            `;
            const mockJsContent = `
                electronAPI.invoke('channel-1', data);
                electronAPI.invoke('missing-channel', data);
            `;
            
            const doctor = new ChannelDoctor({
                preloadPath: 'electron/preload.js',
                jsSource: 'src/test.js',
            });

            mockGlob.glob.mockResolvedValue([path.join(doctor.options.projectRoot, 'src/test.js')]);

            mockFsPromises.readFile.mockImplementation(filePath => {
                if (filePath.endsWith('preload.js')) {
                    return Promise.resolve(mockPreloadContent);
                }
                if (filePath.endsWith('test.js')) {
                    return Promise.resolve(mockJsContent);
                }
                return Promise.reject(new Error(`Unknown file: ${filePath}`));
            });
            
            const result = await doctor.analyze();
            
            expect(result.success).toBe(true);
            expect(result.channels.found).toEqual(['channel-1', 'missing-channel']);
            expect(result.channels.missing).toEqual(['missing-channel']);
            expect(result.channels.unused).toEqual(['channel-2', 'unused-channel']);
        });

        test('should handle errors gracefully', async () => {
            mockFsPromises.readFile.mockRejectedValue({ code: 'ENOENT' });
            
            const doctor = new ChannelDoctor();
            const result = await doctor.analyze();
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('Preload file not found');
        });
    });
}); 