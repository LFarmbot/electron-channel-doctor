const { ChannelDoctor } = require('../lib/index.js');
const fs = require('fs');
const path = require('path');

// Mock fs for testing
jest.mock('fs');
jest.mock('glob');

describe('ChannelDoctor', () => {
    let mockFs;
    let mockGlob;
    
    beforeEach(() => {
        mockFs = require('fs');
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
        test('should parse validInvokeChannels from preload.js', () => {
            const mockPreloadContent = `
const validInvokeChannels = [
    'channel-1',
    'channel-2',
    'channel-3'
];
            `;
            
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(mockPreloadContent);
            
            const doctor = new ChannelDoctor();
            const channels = doctor.getCurrentWhitelist();
            
            expect(channels).toEqual(['channel-1', 'channel-2', 'channel-3']);
        });

        test('should throw error if preload file does not exist', () => {
            mockFs.existsSync.mockReturnValue(false);
            
            const doctor = new ChannelDoctor();
            
            expect(() => doctor.getCurrentWhitelist()).toThrow('Preload file not found');
        });

        test('should throw error if validInvokeChannels not found', () => {
            const mockPreloadContent = 'const someOtherArray = [];';
            
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(mockPreloadContent);
            
            const doctor = new ChannelDoctor();
            
            expect(() => doctor.getCurrentWhitelist()).toThrow('Could not find validInvokeChannels array');
        });
    });

    describe('scanForInvokeCalls', () => {
        test('should find electronAPI.invoke calls in files', () => {
            const mockFiles = ['file1.js', 'file2.js'];
            const mockContent1 = `
                electronAPI.invoke('test-channel-1', data);
                window.electronAPI.invoke('test-channel-2');
            `;
            const mockContent2 = `
                await electronAPI.invoke('test-channel-3', params);
            `;
            
            mockGlob.sync.mockReturnValue(mockFiles);
            mockFs.readFileSync
                .mockReturnValueOnce(mockContent1)
                .mockReturnValueOnce(mockContent2);
            
            const doctor = new ChannelDoctor();
            const channels = doctor.scanForInvokeCalls();
            
            expect(channels).toEqual(['test-channel-1', 'test-channel-2', 'test-channel-3']);
        });

        test('should handle file read errors gracefully', () => {
            const mockFiles = ['file1.js'];
            
            mockGlob.sync.mockReturnValue(mockFiles);
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('File read error');
            });
            
            const doctor = new ChannelDoctor();
            const channels = doctor.scanForInvokeCalls();
            
            expect(channels).toEqual([]);
        });
    });

    describe('analyze', () => {
        test('should return analysis results', () => {
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
            
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(mockPreloadContent);
            mockGlob.sync.mockReturnValue(['test.js']);
            mockFs.readFileSync.mockReturnValueOnce(mockPreloadContent).mockReturnValueOnce(mockJsContent);
            
            const doctor = new ChannelDoctor();
            const result = doctor.analyze();
            
            expect(result.success).toBe(true);
            expect(result.channels.found).toEqual(['channel-1', 'missing-channel']);
            expect(result.channels.missing).toEqual(['missing-channel']);
            expect(result.channels.unused).toEqual(['channel-2', 'unused-channel']);
        });

        test('should handle errors gracefully', () => {
            mockFs.existsSync.mockReturnValue(false);
            
            const doctor = new ChannelDoctor();
            const result = doctor.analyze();
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('Preload file not found');
        });
    });
}); 