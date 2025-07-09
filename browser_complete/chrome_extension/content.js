// content.js
console.log("Scribblit content script injected.");

// Use a WeakMap to store state for each input field without causing memory leaks
const inputState = new WeakMap();

// Global request counter to track request order
let requestCounter = 0;

// Global state for the currently displayed ghost text suggestion
let ghostElement = null;
let activeElementForGhost = null;
let currentCompletion = '';
let currentInput = '';

// Domain-based caching and rejection system
let completionsCache = new Map(); // input -> completion (for current domain)
let rejectedCompletions = new Set(); // Set of "input|completion" strings (for current domain)
const retryAttempts = new Map(); // input -> attempt count

// IndexedDB setup
const DB_NAME = 'ScribblitCache';
const DB_VERSION = 1;
const COMPLETIONS_STORE = 'completions';
const REJECTIONS_STORE = 'rejections';

let db = null;
let currentDomain = '';

// Initialize IndexedDB
async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Create completions store
            if (!db.objectStoreNames.contains(COMPLETIONS_STORE)) {
                const completionsStore = db.createObjectStore(COMPLETIONS_STORE, { keyPath: 'domain' });
                completionsStore.createIndex('domain', 'domain', { unique: true });
            }
            
            // Create rejections store
            if (!db.objectStoreNames.contains(REJECTIONS_STORE)) {
                const rejectionsStore = db.createObjectStore(REJECTIONS_STORE, { keyPath: 'domain' });
                rejectionsStore.createIndex('domain', 'domain', { unique: true });
            }
        };
    });
}

// Extract main domain from URL (handles subdomains)
function extractMainDomain(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        
        // Handle localhost and IP addresses
        if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
            return hostname;
        }
        
        // Split by dots and get the main domain (last two parts for most cases)
        const parts = hostname.split('.');
        if (parts.length >= 2) {
            return parts.slice(-2).join('.');
        }
        
        return hostname;
    } catch (e) {
        console.error('Error extracting domain:', e);
        return 'unknown';
    }
}

// Load cache data for current domain
async function loadCacheForDomain(domain) {
    if (!db) return;
    
    try {
        // Load completions
        const completionsResult = await new Promise((resolve, reject) => {
            const transaction = db.transaction([COMPLETIONS_STORE], 'readonly');
            const store = transaction.objectStore(COMPLETIONS_STORE);
            const request = store.get(domain);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        
        if (completionsResult && completionsResult.data) {
            completionsCache = new Map(Object.entries(completionsResult.data));
            console.log(`Loaded ${completionsCache.size} completions for domain: ${domain}`);
        } else {
            completionsCache = new Map();
        }
        
        // Load rejections
        const rejectionsResult = await new Promise((resolve, reject) => {
            const transaction = db.transaction([REJECTIONS_STORE], 'readonly');
            const store = transaction.objectStore(REJECTIONS_STORE);
            const request = store.get(domain);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        
        if (rejectionsResult && rejectionsResult.data) {
            rejectedCompletions = new Set(rejectionsResult.data);
            console.log(`Loaded ${rejectedCompletions.size} rejections for domain: ${domain}`);
        } else {
            rejectedCompletions = new Set();
        }
    } catch (error) {
        console.error('Error loading cache for domain:', error);
        completionsCache = new Map();
        rejectedCompletions = new Set();
    }
}

// Save completions cache to IndexedDB
async function saveCompletionsCache() {
    if (!db || !currentDomain) return;
    
    try {
        await new Promise((resolve, reject) => {
            const transaction = db.transaction([COMPLETIONS_STORE], 'readwrite');
            const store = transaction.objectStore(COMPLETIONS_STORE);
            
            const data = {
                domain: currentDomain,
                data: Object.fromEntries(completionsCache.entries()),
                lastUpdated: Date.now()
            };
            
            const request = store.put(data);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
        
        console.log(`Saved ${completionsCache.size} completions for domain: ${currentDomain}`);
    } catch (error) {
        console.error('Error saving completions cache:', error);
    }
}

// Save rejections to IndexedDB
async function saveRejectionsCache() {
    if (!db || !currentDomain) return;
    
    try {
        await new Promise((resolve, reject) => {
            const transaction = db.transaction([REJECTIONS_STORE], 'readwrite');
            const store = transaction.objectStore(REJECTIONS_STORE);
            
            const data = {
                domain: currentDomain,
                data: Array.from(rejectedCompletions),
                lastUpdated: Date.now()
            };
            
            const request = store.put(data);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
        
        console.log(`Saved ${rejectedCompletions.size} rejections for domain: ${currentDomain}`);
    } catch (error) {
        console.error('Error saving rejections cache:', error);
    }
}

// Initialize domain-specific cache
async function initializeDomainCache() {
    const newDomain = extractMainDomain(window.location.href);
    
    if (newDomain !== currentDomain) {
        currentDomain = newDomain;
        console.log(`Initializing cache for domain: ${currentDomain}`);
        
        // Load cache for this domain
        await loadCacheForDomain(currentDomain);
    }
}

// Debounce function to limit how often a function is called
function debounce(func, delay) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

// Debounced save functions to prevent excessive IndexedDB writes
const debouncedSaveCompletions = debounce(saveCompletionsCache, 1000);
const debouncedSaveRejections = debounce(saveRejectionsCache, 1000);

// Helper function to create rejection key
function createRejectionKey(input, completion) {
    return `${input}|${completion}`;
}

// Removes the ghost text from the DOM and cleans up related listeners
function removeGhostText() {
    if (ghostElement) {
        ghostElement.remove();
        ghostElement = null;
    }
    if (activeElementForGhost) {
        // Remove the specific listener we added
        activeElementForGhost.removeEventListener('keydown', handleKeydown);
        activeElementForGhost = null;
    }
    currentCompletion = '';
    currentInput = '';
}

// Function to get completion from the background script
async function getCompletion(prompt, element) {
    console.log("Sending prompt to background script:", prompt);

    // Generate a unique request ID for this request
    const requestId = ++requestCounter;
    
    // Store the request ID and text for which we are requesting the completion
    const textForRequest = element.value.substring(0, element.selectionEnd);
    const state = inputState.get(element) || {};
    state.lastRequestText = textForRequest;
    state.currentRequestId = requestId;
    inputState.set(element, state);
    
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'getCompletion',
            text: prompt // The prompt is now pre-formatted
        });

        if (chrome.runtime.lastError) {
            console.error("sendMessage failed:", chrome.runtime.lastError.message);
            return { completion: '', requestId };
        }
        
        return { 
            completion: response?.completion || '', 
            requestId 
        };
    } catch (error) {
        console.error('Error sending message to background script:', error);
        return { completion: '', requestId };
    }
}

// Function to check if a completion should be rejected
function shouldRejectCompletion(input, completion) {
    const rejectionKey = createRejectionKey(input, completion);
    return rejectedCompletions.has(rejectionKey);
}

// Function to add a completion to the rejection set
function addToRejections(input, completion) {
    const rejectionKey = createRejectionKey(input, completion);
    rejectedCompletions.add(rejectionKey);
    
    // Remove from cache if it exists
    if (completionsCache.has(input)) {
        completionsCache.delete(input);
        debouncedSaveCompletions(); // Save updated cache
    }
    
    console.log(`Added to rejections: ${rejectionKey}`);
    debouncedSaveRejections(); // Save updated rejections
}

/**
 * Creates a visually hidden span to accurately measure the width of the text
 * inside an input, using the input's own computed font styles.
 * @param {HTMLInputElement|HTMLTextAreaElement} element The input element
 * @param {string} text The text to measure
 * @returns {number} The width of the text in pixels
 */
function measureTextWidth(element, text) {
    const measurer = document.createElement('span');
    measurer.style.visibility = 'hidden';
    measurer.style.position = 'absolute';
    measurer.style.whiteSpace = 'pre'; // Preserve spaces for accurate measurement
    
    const style = window.getComputedStyle(element);
    // Copy all relevant font styles from the input to our measurer
    [
        'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 
        'letterSpacing', 'textTransform', 'wordSpacing'
    ].forEach(prop => {
        measurer.style[prop] = style[prop];
    });

    measurer.textContent = text;
    document.body.appendChild(measurer);
    const width = measurer.getBoundingClientRect().width;
    document.body.removeChild(measurer);
    return width;
}

// Function to show completion as ghost text by overlaying a styled span
function showCompletion(element, completion) {
    removeGhostText(); // Clear any previous suggestion

    const state = inputState.get(element);
    const textForRequest = state ? state.lastRequestText : '';
    const currentText = element.value.substring(0, element.selectionEnd);

    // If the text changed since we requested the completion, we need to adjust.
    if (textForRequest && currentText.startsWith(textForRequest)) {
        const remainingCompletion = completion; // The full completion is what we want to show
        const textBeforeCursor = currentText;

        const textWidth = measureTextWidth(element, textBeforeCursor);
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        // Create the ghost element and style it to match the input
        ghostElement = document.createElement('span');
        ghostElement.textContent = remainingCompletion;
        ghostElement.style.position = 'absolute';
        ghostElement.style.pointerEvents = 'none'; // Click through the ghost text
        ghostElement.style.zIndex = '2147483647'; // Maximum z-index to ensure it's always on top
        
        // Set color to match input field but with half opacity
        const inputColor = style.color;
        const inputOpacity = parseFloat(style.opacity) || 1;
        const ghostOpacity = inputOpacity * 0.5;
        
        // Parse the color and apply the new opacity
        if (inputColor.startsWith('rgba')) {
            // Replace existing alpha with new opacity
            ghostElement.style.color = inputColor.replace(/rgba\(([^)]+),\s*[^)]+\)/, `rgba($1, ${ghostOpacity})`);
        } else if (inputColor.startsWith('rgb')) {
            // Convert rgb to rgba with new opacity
            ghostElement.style.color = inputColor.replace('rgb', 'rgba').replace(')', `, ${ghostOpacity})`);
        } else {
            // For other color formats, use the color with opacity property
            ghostElement.style.color = inputColor;
            ghostElement.style.opacity = ghostOpacity.toString();
        }
        
        ghostElement.style.boxSizing = style.boxSizing;

        // Copy styles that affect positioning and appearance
        [
            'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight',
            'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
            'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'
        ].forEach(prop => {
            ghostElement.style[prop] = style[prop];
        });
        
        // Calculate precise top/left position
        const top = rect.top + window.scrollY + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
        const left = rect.left + window.scrollX + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) + textWidth;

        ghostElement.style.top = `${top}px`;
        ghostElement.style.left = `${left}px`;
        
        document.body.appendChild(ghostElement);

        // Set global state for accepting the completion
        currentCompletion = remainingCompletion;
        currentInput = textBeforeCursor;
        activeElementForGhost = element;
        element.addEventListener('keydown', handleKeydown, { once: true, capture: true });
    }
}

// Accepts the current completion
function acceptCompletion() {
    if (activeElementForGhost && currentCompletion) {
        const el = activeElementForGhost;
        const textBefore = el.value.substring(0, el.selectionStart);
        const textAfter = el.value.substring(el.selectionEnd);
        
        // Insert the completion text and move the cursor to the end of it
        el.value = textBefore + currentCompletion + textAfter;
        el.selectionStart = el.selectionEnd = (textBefore + currentCompletion).length;
        
        // Manually dispatch an input event so the host page can react to the change
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        
        // Add to cache for future use
        if (currentInput && currentCompletion) {
            completionsCache.set(currentInput, currentCompletion);
            debouncedSaveCompletions(); // Save updated cache
        }
    }
    removeGhostText();
}

// Handles keyboard events to accept or dismiss the completion
function handleKeydown(e) {
    if (e.key === 'Tab') {
        e.preventDefault(); // Prevent focus from changing
        e.stopPropagation(); // Stop other listeners
        acceptCompletion();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        
        // Add current completion to rejections
        if (currentInput && currentCompletion) {
            addToRejections(currentInput, currentCompletion);
        }
        
        removeGhostText();
    }
    // For any other key, we let the 'input' event in handleInput clear the ghost text.
}

// Function to handle completion request with retry logic
async function handleCompletionRequest(element, input, attempt = 1) {
    const maxAttempts = 3;
    
    // Construct the prompt: current URL + space + last 1000 chars of text
    const prompt = `${window.location.href} ${input.slice(-1000)}`;
    const { completion, requestId } = await getCompletion(prompt, element);

    if (!completion) {
        console.log("No completion received from backend");
        return;
    }

    // Check if this request is still valid (user hasn't typed since)
    if (document.activeElement !== element) {
        console.log("Element no longer focused, ignoring completion");
        return;
    }

    const currentState = inputState.get(element);
    if (!currentState || currentState.currentRequestId !== requestId) {
        console.log(`Request invalidated. Current request ID: ${currentState?.currentRequestId}, Response ID: ${requestId}`);
        return;
    }

    const currentText = element.value.substring(0, element.selectionEnd);
    const textForRequest = currentState.lastRequestText;

    if (!currentText.startsWith(textForRequest)) {
        console.log("Text changed since request, ignoring completion");
        return;
    }

    // Check if this completion is in the rejection set
    if (shouldRejectCompletion(input, completion)) {
        console.log(`Completion rejected (attempt ${attempt}): ${completion}`);
        
        if (attempt < maxAttempts) {
            console.log(`Retrying completion request (attempt ${attempt + 1})`);
            setTimeout(() => {
                handleCompletionRequest(element, input, attempt + 1);
            }, 100); // Small delay before retry
        } else {
            console.log(`Max attempts reached for input: ${input}`);
            retryAttempts.set(input, maxAttempts);
        }
        return;
    }

    // Valid completion, show it and cache it
    showCompletion(element, completion);
    completionsCache.set(input, completion);
    debouncedSaveCompletions(); // Save updated cache
    
    // Reset retry attempts for this input
    retryAttempts.delete(input);
}

const debouncedGetCompletion = debounce(async (element) => {
    // We only want completions if the user's cursor is at the end of the text.
    if (element.selectionStart !== element.value.length) {
        removeGhostText();
        return;
    }

    const state = inputState.get(element);
    if (!state || !state.typedSinceFocus) {
        return;
    }

    const textBeforeCursor = element.value.substring(0, element.selectionEnd);
    if (textBeforeCursor.length < 20) {
        return;
    }

    // First, check if we have a cached completion for this input
    if (completionsCache.has(textBeforeCursor)) {
        const cachedCompletion = completionsCache.get(textBeforeCursor);
        console.log(`Using cached completion: ${cachedCompletion}`);
        showCompletion(element, cachedCompletion);
        return;
    }

    // Check if we've hit max retry attempts for this input
    if (retryAttempts.has(textBeforeCursor) && retryAttempts.get(textBeforeCursor) >= 3) {
        console.log(`Max retry attempts reached for input: ${textBeforeCursor}`);
        return;
    }

    // No cached completion, request from backend
    handleCompletionRequest(element, textBeforeCursor);
}, 200); // 200ms debounce delay

function handleFocus(event) {
    const element = event.target;
    let state = inputState.get(element) || {};
    state.typedSinceFocus = false;
    inputState.set(element, state);
}

function handleInput(event) {
    // On any input, the old suggestion is invalid and pending requests become invalid
    removeGhostText();

    const element = event.target;
    let state = inputState.get(element);
    
    if (!state) { // Initialized on focus, but as a fallback.
        state = { typedSinceFocus: true };
    } else {
        state.typedSinceFocus = true;
    }
    
    // Invalidate any pending requests by updating the request ID
    state.currentRequestId = ++requestCounter;
    inputState.set(element, state);
    
    // Check if domain changed (for SPA navigation)
    initializeDomainCache();
    
    debouncedGetCompletion(element);
}

function attachListeners() {
    document.querySelectorAll('textarea, input[type="text"], input:not([type])').forEach(element => {
        if (element.dataset.scribblitListener) return;
        element.dataset.scribblitListener = 'true';
        element.addEventListener('focus', handleFocus);
        element.addEventListener('input', handleInput);
        // Remove ghost text if user clicks away
        element.addEventListener('blur', removeGhostText); 
    });

    // Note: contentEditable support is more complex and is not handled here.
    document.querySelectorAll('[contenteditable="true"]').forEach(element => {
        if (element.dataset.scribblitListener) return;
        element.dataset.scribblitListener = 'true';
        // The current logic is not designed for contentEditable elements.
    });
}

// Initial attachment
attachListeners();

// Use MutationObserver to attach listeners to new elements added to the DOM
const observer = new MutationObserver(() => {
    attachListeners();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Initialize IndexedDB and domain cache
(async function initialize() {
    try {
        await initDB();
        await initializeDomainCache();
        console.log("Scribblit content script loaded with IndexedDB support.");
    } catch (error) {
        console.error("Error initializing Scribblit:", error);
        console.log("Scribblit content script loaded without IndexedDB support.");
    }
})(); 