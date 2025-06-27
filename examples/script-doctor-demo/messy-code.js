// This is a messy file with LOTS of issues for Script Doctor to find and fix!

 // UNUSED IMPORT - never used anywhere
import { useState, useEffect } from 'react'; // PARTIALLY UNUSED - useState used, useEffect not
import moment from 'moment'; // UNUSED IMPORT - imported but never called
 // MIXED USAGE - only debounce used

const fs = require('fs'); // UNUSED IMPORT - CommonJS style, never used
 // PARTIALLY UNUSED - only join used

// UNUSED FUNCTION - never called anywhere
function calculateTax(amount, rate = 0.1) {
    return amount * rate;
}

// UNUSED FUNCTION - defined but never invoked
function formatCurrency(value) {
    return '$' + value.toFixed(2);
}

// UNUSED ARROW FUNCTION - created but never used
;

// COMPLEX FUNCTION - high cyclomatic complexity (>10)
function processUserData(user, settings, permissions, context, flags) {
    if (!user) {
        return null;
    }
    
    if (user.isActive && user.isVerified && settings.enabled) {
        if (permissions.canRead && permissions.canWrite) {
            if (context.environment === 'production') {
                if (flags.featureA && flags.featureB) {
                    if (user.role === 'admin' || user.role === 'moderator') {
                        if (settings.advancedMode) {
                            for (let i = 0; i < user.items.length; i++) {
                                if (user.items[i].active) {
                                    if (user.items[i].type === 'premium') {
                                        // Complex nested logic
                                        return user.items[i];
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    return user;
}

// Function with DEAD CODE after return
function getUserInfo(userId) {
    if (!userId) {
        return null;
    }
    
    const user = database.getUser(userId);
    return user;
    
    // DEAD CODE - unreachable after returnconst extraData = fetchExtraData(userId);
    return { ...user, ...extraData };
}

// Function with DEAD CODE after throw
function validateConfig(config) {
    if (!config) {
        throw new Error('Config is required');
        
        // DEAD CODE - unreachable after throwconst defaultConfig = getDefaultConfig();
    }
    
    return config;
}

// DUPLICATE CODE BLOCK #1 - this exact pattern appears in multiple places
function showLoadingSpinner() {
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.innerHTML = '<div class="spinner-icon"></div>';
    document.body.appendChild(spinner);
}

// Actually used function
function processOrder(order) {
    const [user, setUser] = useState(null); // useState is used
    
    // This function is actually called, so it should stay
    const debouncedSearch = debounce((query) => {
        console.log('Searching for:', query);
    }, 300);
    
    // DUPLICATE CODE BLOCK #2 - same pattern as above
    const loadingElement = document.createElement('div');
    loadingElement.className = 'loading-spinner';
    loadingElement.innerHTML = '<div class="spinner-icon"></div>';
    document.body.appendChild(loadingElement);
    
    return order.total;
}

// Another function with DUPLICATE CODE BLOCK #3
function handleSubmit() {
    // Same loading pattern again - should be extracted to reusable function
    const loader = document.createElement('div');
    loader.className = 'loading-spinner';
    loader.innerHTML = '<div class="spinner-icon"></div>';
    document.body.appendChild(loader);
    
    console.log('Form submitted');
}

// UNUSED FUNCTION - complex but never called
function calculateShippingCost(weight, distance, priority) {
    let baseCost = 10;
    
    if (weight > 50) {
        baseCost += weight * 0.5;
    } else if (weight > 20) {
        baseCost += weight * 0.3;
    } else {
        baseCost += weight * 0.1;
    }
    
    if (distance > 1000) {
        baseCost *= 1.5;
    } else if (distance > 500) {
        baseCost *= 1.3;
    }
    
    if (priority === 'express') {
        baseCost *= 2;
    } else if (priority === 'overnight') {
        baseCost *= 3;
    }
    
    return baseCost;
}

// USED FUNCTION - this one is actually called so should be kept
function initializeApp() {
    console.log('App initializing...');
    processOrder({ total: 100 });
}

// Call the used function so it's detected as used
initializeApp(); 