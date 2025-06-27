const fs = require('fs');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

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

class ASTParser {
    /**
     * Parses preload.js content to find the `validInvokeChannels` array.
     * @param {string} content - The content of preload.js
     * @returns {string[]} - An array of whitelisted channel names.
     */
    static getPreloadChannels(content) {
        const channels = [];
        try {
            const ast = parse(content, {
                sourceType: 'module',
                plugins: ['estree'], // Use a plugin compatible with modern JS
            });

            traverse(ast, {
                VariableDeclarator(path) {
                    if (path.node.id.name === 'validInvokeChannels') {
                        if (path.node.init.type === 'ArrayExpression') {
                            path.node.init.elements.forEach((element, idx) => {
                                if (element.type === 'StringLiteral' || element.type === 'Literal') {
                                    channels.push(element.value);
                                }
                            });
                        }
                    }
                },
            });
        } catch (error) {
            console.error('Failed to parse preload script:', error);
            // Fallback or re-throw, depending on desired strictness
        }
        return channels.sort();
    }

    /**
     * Finds all `electronAPI.invoke` calls in a given code string.
     * @param {string} content - The JavaScript code to parse.
     * @returns {string[]} - An array of found invoke channel names.
     */
    static findInvokeChannels(content) {
        const channels = new Set();
        try {
            const ast = parse(content, {
                sourceType: 'module',
                plugins: [
                    'jsx', // Enable JSX parsing
                    'typescript', // Enable TypeScript
                    'estree',
                ],
                errorRecovery: true, // Attempt to parse despite errors
            });

            traverse(ast, {
                CallExpression(path) {
                    const callee = path.get('callee');

                    // Check for electronAPI.invoke('channel')
                    let isInvokeCall = false;
                    if (callee.isMemberExpression() && !callee.node.computed) {
                        const object = callee.get('object');
                        const property = callee.get('property');

                        // This handles `anything.electronAPI.invoke`
                        if (property.isIdentifier({ name: 'invoke' })) {
                             if (object.isMemberExpression()) {
                                if(object.get('property').isIdentifier({name: 'electronAPI'})) {
                                    isInvokeCall = true;
                                }
                             } else if (object.isIdentifier({ name: 'electronAPI' })) {
                                isInvokeCall = true;
                             }
                        }
                    }


                    if (isInvokeCall) {
                        const args = path.get('arguments');
                        if (args.length > 0) {
                            const firstArg = args[0];
                            if (firstArg.isStringLiteral() || (firstArg.node.type === 'Literal' && typeof firstArg.node.value === 'string')) {
                                channels.add(firstArg.node.value);
                            }
                        }
                    }
                },
            });
        } catch (error) {
            // It's common for individual files to fail parsing in a large project.
            // We'll log it if verbose, but won't halt the whole process.
            // console.warn(`Could not parse file for invoke channels: ${error.message}`);
        }
        return Array.from(channels).sort();
    }
}

module.exports = {
  getAstFromFile,
  ASTParser,
}; 