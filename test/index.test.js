const { ChannelDoctor } = require('../lib/index.js');
const { MockFileSystem } = require('../lib/file-system');
const path = require('path');

describe('ChannelDoctor', () => {
    const mockProjectRoot = '/test/project';

    describe('constructor', () => {
        test('should initialize with default options', () => {
            const doctor = new ChannelDoctor();
            expect(doctor.options.preloadPath).toBe('electron/preload.js');
        });
    });

    describe('getCurrentWhitelist', () => {
        test('should parse validInvokeChannels from preload.js', async () => {
            const preloadPath = path.join(mockProjectRoot, 'electron/preload.js');
            const mockFiles = {
                [preloadPath]: `const validInvokeChannels = ['ch1', 'ch2'];`
            };
            const doctor = new ChannelDoctor({ projectRoot: mockProjectRoot, fs: new MockFileSystem(mockFiles) });
            const channels = await doctor.getCurrentWhitelist();
            expect(channels).toEqual(['ch1', 'ch2']);
        });

        test('should return an empty array if validInvokeChannels not found', async () => {
            const preloadPath = path.join(mockProjectRoot, 'electron/preload.js');
            const mockFiles = {
                [preloadPath]: `// No validInvokeChannels array here`
            };
            const doctor = new ChannelDoctor({ projectRoot: mockProjectRoot, fs: new MockFileSystem(mockFiles) });
            const channels = await doctor.getCurrentWhitelist();
            expect(channels).toEqual([]);
        });
    });

    describe('scanForInvokeCalls', () => {
        test('should find electronAPI.invoke calls in files', async () => {
            const jsSource = 'src/**/*.js';
            const file1 = path.join(mockProjectRoot, 'src/file1.js');
            const file2 = path.join(mockProjectRoot, 'src/file2.js');
            const mockFiles = {
                [file1]: `electronAPI.invoke('ch1');`,
                [file2]: `electronAPI.invoke('ch2'); electronAPI.invoke('ch3');`
            };
            const doctor = new ChannelDoctor({
                projectRoot: mockProjectRoot,
                jsSource,
                fs: new MockFileSystem(mockFiles),
            });
            const channels = await doctor.scanForInvokeCalls();
            expect(channels).toEqual(['ch1', 'ch2', 'ch3'].sort());
        });
    });

    describe('analyze', () => {
        test('should return analysis results', async () => {
            const preloadPath = path.join(mockProjectRoot, 'electron/preload.js');
            const jsPath = path.join(mockProjectRoot, 'src/app.js');
            const mockFiles = {
                [preloadPath]: `const validInvokeChannels = ['ch1', 'unused'];`,
                [jsPath]: `electronAPI.invoke('ch1'); electronAPI.invoke('ch-missing');`,
            };
            const doctor = new ChannelDoctor({
                projectRoot: mockProjectRoot,
                preloadPath: 'electron/preload.js',
                jsSource: 'src/app.js',
                fs: new MockFileSystem(mockFiles)
            });

            const result = await doctor.analyze();
            expect(result.success).toBe(true);
            expect(result.channels.found.sort()).toEqual(['ch-missing', 'ch1'].sort());
            expect(result.channels.missing).toEqual(['ch-missing']);
            expect(result.channels.unused).toEqual(['unused']);
        });
    });
}); 