const fs = require('fs');
const { parse } = require('@babel/parser');

/**
 * Parses a JavaScript file and returns its Abstract Syntax Tree (AST).
 *
 * @param {string} filePath The absolute or relative path to the JavaScript file.
 * @returns {{ast: import('@babel/types').File, code: string} | null} The AST representation of the file and its source code, or null if parsing fails.
 */
function getAstFromFile(filePath) {
  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    const ast = parse(code, {
      sourceType: 'module',
      plugins: [
        'jsx', // if you need to support JSX syntax
        'typescript', // if you need to support TypeScript
      ],
      errorRecovery: true, // Attempt to parse through errors
    });
    return { ast, code };
  } catch (error) {
    console.error(`Failed to parse AST for ${filePath}:`, error);
    return null;
  }
}

module.exports = {
  getAstFromFile,
}; 