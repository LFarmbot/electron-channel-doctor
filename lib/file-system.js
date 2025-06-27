const fs = require('fs').promises;
const glob = require('glob');
const path = require('path');

class FileSystem {
    async readFile(filePath) {
        return fs.readFile(filePath, 'utf8');
    }

    findFiles(patterns, rootDir, ignore) {
        const patternArray = Array.isArray(patterns) ? patterns : [patterns];
        let allFiles = [];

        for (const pattern of patternArray) {
            const files = glob.sync(pattern, {
                cwd: rootDir,
                ignore: ignore,
                absolute: true,
            });
            allFiles.push(...files);
        }

        return [...new Set(allFiles)];
    }
}

class MockFileSystem {
    constructor(files = {}) {
        this.files = files;
    }

    async readFile(filePath) {
        if (this.files[filePath]) {
            return Promise.resolve(this.files[filePath]);
        }
        return Promise.reject(new Error(`File not found in mock: ${filePath}`));
    }

    findFiles(patterns, rootDir, ignore) {
        // Convert patterns to array if needed
        const patternArray = Array.isArray(patterns) ? patterns : [patterns];
        
        // Get all file paths from the mock
        const allFiles = Object.keys(this.files);
        
        // Filter files that match any of the patterns
        const matchingFiles = allFiles.filter(filePath => {
            // Check if file matches any pattern
            const matches = patternArray.some(pattern => {
                // For test purposes, we'll do a simple match:
                // - If pattern contains **, match any directory depth
                // - If pattern ends with *.js, match JS files
                // - Otherwise, exact match
                
                if (pattern.includes('**')) {
                    // Extract the file extension if present
                    const extMatch = pattern.match(/\*\.(\w+)$/);
                    if (extMatch) {
                        const ext = extMatch[1];
                        const matchesExt = filePath.endsWith(`.${ext}`);
                        return matchesExt;
                    }
                    // Just match any file in the pattern's base directory
                    const baseDir = pattern.split('**')[0].replace(/\/$/, '');
                    const matchesBase = filePath.includes(baseDir);
                    return matchesBase;
                } else if (pattern === filePath) {
                    // Exact match
                    return true;
                } else {
                    // Simple pattern match for single files
                    const fullPath = path.join(rootDir, pattern);
                    const matchesFull = filePath === fullPath;
                    return matchesFull;
                }
            });
            
            return matches;
        });
        
        return matchingFiles;
    }
}

module.exports = { FileSystem, MockFileSystem }; 