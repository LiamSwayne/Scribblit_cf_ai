// content.js
console.log("Scribblit content script injected.");

// Use a WeakMap to store state for each input field without causing memory leaks
const inputState = new WeakMap();

// Global request counter to track request order
let requestCounter = 0;

// Global state for the currently displayed completion overlay
let overlayElement = null;
let activeElementForOverlay = null;
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

// Removes the overlay element from the DOM and cleans up related listeners
function removeOverlay() {
    if (overlayElement) {
        // Remove text overlay if it exists
        if (overlayElement._textOverlay) {
            overlayElement._textOverlay.remove();
        }
        overlayElement.remove();
        overlayElement = null;
    }
    if (activeElementForOverlay) {
        // Remove event listeners
        activeElementForOverlay.removeEventListener('keydown', handleKeydown);
        activeElementForOverlay.removeEventListener('scroll', updateOverlayPosition);
        window.removeEventListener('resize', updateOverlayPosition);
        window.removeEventListener('scroll', updateOverlayPosition);
        activeElementForOverlay = null;
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

// Function to check if scrollbars are currently visible
function hasVisibleScrollbars(element) {
    const hasVerticalScrollbar = element.scrollHeight > element.clientHeight;
    const hasHorizontalScrollbar = element.scrollWidth > element.clientWidth;
    return { vertical: hasVerticalScrollbar, horizontal: hasHorizontalScrollbar };
}

// Function to copy all relevant styles from the original element to the overlay
function copyElementStyles(originalElement, overlayElement, isTextOverlay = false) {
    const computedStyle = window.getComputedStyle(originalElement);
    
    // Copy all relevant styles that affect positioning, sizing, and text rendering
    const propertiesToCopy = [
        'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight',
        'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
        'borderWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
        'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
        'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
        'boxSizing', 'textAlign', 'textIndent', 'textTransform', 'letterSpacing',
        'wordSpacing', 'whiteSpace', 'wordWrap', 'overflowWrap', 'textDecoration',
        'textDecorationLine', 'textDecorationStyle', 'textDecorationColor',
        'resize'
    ];
    
    propertiesToCopy.forEach(property => {
        if (computedStyle[property] !== undefined) {
            overlayElement.style[property] = computedStyle[property];
        }
    });
    
    // Handle overflow properties based on scrollbar visibility
    if (isTextOverlay) {
        // Text overlay should allow content to extend beyond bounds
        overlayElement.style.overflowY = 'visible';
        overlayElement.style.overflowX = 'visible';
        
        // Remove height constraints to allow text to extend beyond original bounds
        overlayElement.style.height = 'auto';
        overlayElement.style.maxHeight = 'none';
        overlayElement.style.minHeight = originalElement.style.minHeight || computedStyle.minHeight;
    } else {
        // Input overlay matches the original's scrollbar behavior
        const scrollbars = hasVisibleScrollbars(originalElement);
        const originalOverflowY = computedStyle.overflowY;
        const originalOverflowX = computedStyle.overflowX;
        
        // Show scrollbars only if they're currently visible in the original
        if (originalOverflowY === 'auto' || originalOverflowY === 'scroll') {
            overlayElement.style.overflowY = scrollbars.vertical ? 'auto' : 'hidden';
        } else {
            overlayElement.style.overflowY = originalOverflowY;
        }
        
        if (originalOverflowX === 'auto' || originalOverflowX === 'scroll') {
            overlayElement.style.overflowX = scrollbars.horizontal ? 'auto' : 'hidden';
        } else {
            overlayElement.style.overflowX = originalOverflowX;
        }
    }
    
    // Force transparent background
    overlayElement.style.backgroundColor = 'transparent';
    overlayElement.style.backgroundImage = 'none';
    overlayElement.style.background = 'transparent';
}

// Function to update the overlay position to match the original element
function updateOverlayPosition() {
    if (!overlayElement || !activeElementForOverlay) return;
    
    const rect = activeElementForOverlay.getBoundingClientRect();
    overlayElement.style.left = `${rect.left + window.scrollX}px`;
    overlayElement.style.top = `${rect.top + window.scrollY}px`;
    
    // Update scrollbar visibility based on current state
    const scrollbars = hasVisibleScrollbars(activeElementForOverlay);
    const computedStyle = window.getComputedStyle(activeElementForOverlay);
    
    // Update input overlay scrollbar visibility
    if (computedStyle.overflowY === 'auto' || computedStyle.overflowY === 'scroll') {
        overlayElement.style.overflowY = scrollbars.vertical ? 'auto' : 'hidden';
    }
    if (computedStyle.overflowX === 'auto' || computedStyle.overflowX === 'scroll') {
        overlayElement.style.overflowX = scrollbars.horizontal ? 'auto' : 'hidden';
    }
    
    // Sync scroll position for input overlay
    overlayElement.scrollLeft = activeElementForOverlay.scrollLeft;
    overlayElement.scrollTop = activeElementForOverlay.scrollTop;
    
    // Sync scroll position for text overlay
    if (overlayElement._textOverlay) {
        // Calculate proper positioning accounting for padding and borders
        const computedStyle = window.getComputedStyle(activeElementForOverlay);
        const paddingTop = parseFloat(computedStyle.paddingTop);
        const paddingLeft = parseFloat(computedStyle.paddingLeft);
        const borderTop = parseFloat(computedStyle.borderTopWidth);
        const borderLeft = parseFloat(computedStyle.borderLeftWidth);
        
        // Position the text overlay to align with the text content area
        const textAreaLeft = rect.left + window.scrollX + borderLeft + paddingLeft;
        const textAreaTop = rect.top + window.scrollY + borderTop + paddingTop;
        
        overlayElement._textOverlay.style.left = `${textAreaLeft}px`;
        overlayElement._textOverlay.style.top = `${textAreaTop}px`;
        
        // Apply scroll offset to position the text correctly
        const scrollOffsetY = activeElementForOverlay.scrollTop;
        const scrollOffsetX = activeElementForOverlay.scrollLeft;
        
        // Use transform to simulate scroll position for visible overflow
        overlayElement._textOverlay.style.transform = `translate(${-scrollOffsetX}px, ${-scrollOffsetY}px)`;
    }
}

// Function to create styled text content with completion
function createStyledTextContent(existingText, completion, originalElement) {
    const computedStyle = window.getComputedStyle(originalElement);
    const textColor = computedStyle.color;
    
    // Create container for the text
    const container = document.createElement('div');
    container.style.whiteSpace = 'pre-wrap';
    container.style.wordWrap = 'break-word';
    container.style.overflowWrap = 'break-word';
    
    // Add existing text with normal styling
    if (existingText) {
        const existingSpan = document.createElement('span');
        existingSpan.textContent = existingText;
        existingSpan.style.color = textColor;
        container.appendChild(existingSpan);
    }
    
    // Add completion text with reduced opacity
    if (completion) {
        const completionSpan = document.createElement('span');
        completionSpan.textContent = completion;
        completionSpan.style.color = textColor;
        completionSpan.style.opacity = '0.5';
        container.appendChild(completionSpan);
    }
    
    return container;
}

// Function to show completion as overlay duplicate
function showCompletion(element, completion) {
    removeOverlay(); // Clear any previous overlay

    const state = inputState.get(element);
    const textForRequest = state ? state.lastRequestText : '';
    const currentText = element.value.substring(0, element.selectionEnd);

    // If the text changed since we requested the completion, we need to adjust.
    if (textForRequest && currentText.startsWith(textForRequest)) {
        const rect = element.getBoundingClientRect();
        
        // Create the overlay element as the same type as the original
        const isTextarea = element.tagName.toLowerCase() === 'textarea';
        overlayElement = document.createElement(isTextarea ? 'textarea' : 'input');
        
        // If it's an input, set the type to match
        if (!isTextarea && element.type) {
            overlayElement.type = element.type;
        }
        
                 // Copy all styles from the original element
         copyElementStyles(element, overlayElement, false); // false indicates this is an input overlay
        
        // Position the overlay
        overlayElement.style.position = 'absolute';
        overlayElement.style.left = `${rect.left + window.scrollX}px`;
        overlayElement.style.top = `${rect.top + window.scrollY}px`;
        overlayElement.style.zIndex = '2000000000'; // 2 billion as requested
        overlayElement.style.pointerEvents = 'none'; // Cannot be interacted with
        overlayElement.style.backgroundColor = 'transparent';
        overlayElement.style.backgroundImage = 'none';
        overlayElement.style.background = 'transparent';
        overlayElement.style.border = 'none';
        overlayElement.style.outline = 'none';
        overlayElement.style.resize = 'none';
        overlayElement.style.cursor = 'default';
        
        // Set the content with both existing text and completion
        const fullText = currentText + completion;
        overlayElement.value = fullText;
        overlayElement.readOnly = true;
        overlayElement.disabled = false; // Keep enabled for scroll sync to work
        overlayElement.tabIndex = -1; // Remove from tab order
        
        // Apply text styling with completion having reduced opacity
        // We'll use a different approach with spans for better opacity control
        overlayElement.style.color = 'transparent'; // Make the actual text transparent
        
                          // Create text overlay that can extend beyond textarea bounds
         const textOverlay = document.createElement('div');
         textOverlay.style.position = 'absolute';
         textOverlay.style.zIndex = '2000000001'; // Just above the input overlay
         textOverlay.style.pointerEvents = 'none';
         
         // Copy text-related styles but allow overflow to extend beyond bounds
         copyElementStyles(element, textOverlay, true); // true indicates this is a text overlay
         textOverlay.style.backgroundColor = 'transparent';
         textOverlay.style.backgroundImage = 'none';
         textOverlay.style.background = 'transparent';
         textOverlay.style.border = 'none';
         textOverlay.style.outline = 'none';
         
         // Add the styled text content
         const styledContent = createStyledTextContent(currentText, completion, element);
         textOverlay.appendChild(styledContent);
         
         // Add to DOM first
         document.body.appendChild(overlayElement);
         document.body.appendChild(textOverlay);
         
         // Store reference to text overlay for cleanup
         overlayElement._textOverlay = textOverlay;
         
         // Sync scroll position for both overlays AFTER adding to DOM
         overlayElement.scrollLeft = element.scrollLeft;
         overlayElement.scrollTop = element.scrollTop;
         
         // For text overlay, position it to align with the visible content
         // We need to account for the padding and border of the original element
         const computedStyle = window.getComputedStyle(element);
         const paddingTop = parseFloat(computedStyle.paddingTop);
         const paddingLeft = parseFloat(computedStyle.paddingLeft);
         const borderTop = parseFloat(computedStyle.borderTopWidth);
         const borderLeft = parseFloat(computedStyle.borderLeftWidth);
         
         // Position the text overlay to align with the text content area
         const textAreaLeft = rect.left + window.scrollX + borderLeft + paddingLeft;
         const textAreaTop = rect.top + window.scrollY + borderTop + paddingTop;
         
         textOverlay.style.left = `${textAreaLeft}px`;
         textOverlay.style.top = `${textAreaTop}px`;
         
         // Apply scroll offset to position the text correctly
         const scrollOffsetY = element.scrollTop;
         const scrollOffsetX = element.scrollLeft;
         textOverlay.style.transform = `translate(${-scrollOffsetX}px, ${-scrollOffsetY}px)`;

        // Set global state for accepting the completion
        currentCompletion = completion;
        currentInput = currentText;
        activeElementForOverlay = element;
        
        // Add event listeners
        element.addEventListener('keydown', handleKeydown, { once: true, capture: true });
        element.addEventListener('scroll', updateOverlayPosition);
        
        // Update position on window resize/scroll
        window.addEventListener('resize', updateOverlayPosition);
        window.addEventListener('scroll', updateOverlayPosition);
    }
}

// Accepts the current completion
function acceptCompletion() {
    if (activeElementForOverlay && currentCompletion) {
        const el = activeElementForOverlay;
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
    removeOverlay();
}

// Enhanced removeOverlay function to handle text overlay cleanup
function removeOverlay() {
    if (overlayElement) {
        // Remove text overlay if it exists
        if (overlayElement._textOverlay) {
            overlayElement._textOverlay.remove();
        }
        overlayElement.remove();
        overlayElement = null;
    }
    if (activeElementForOverlay) {
        // Remove event listeners
        activeElementForOverlay.removeEventListener('keydown', handleKeydown);
        activeElementForOverlay.removeEventListener('scroll', updateOverlayPosition);
        window.removeEventListener('resize', updateOverlayPosition);
        window.removeEventListener('scroll', updateOverlayPosition);
        activeElementForOverlay = null;
    }
    currentCompletion = '';
    currentInput = '';
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
        
        removeOverlay();
    }
    // For any other key, we let the 'input' event in handleInput clear the overlay.
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
        removeOverlay();
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
    removeOverlay();

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
        // Remove overlay if user clicks away
        element.addEventListener('blur', removeOverlay); 
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