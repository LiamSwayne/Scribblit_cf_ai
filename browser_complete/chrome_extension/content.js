// content.js
console.log("Scribblit content script injected.");

// Use a WeakMap to store state for each input field without causing memory leaks
const inputState = new WeakMap();

// Global state for the currently displayed ghost text suggestion
let ghostElement = null;
let activeElementForGhost = null;
let currentCompletion = '';

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
}

// Function to get completion from the background script
async function getCompletion(prompt) {
    console.log("Sending prompt to background script:", prompt);
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'getCompletion',
            text: prompt // The prompt is now pre-formatted
        });

        if (chrome.runtime.lastError) {
            console.error("sendMessage failed:", chrome.runtime.lastError.message);
            return '';
        }
        return response?.completion || '';
    } catch (error) {
        console.error('Error sending message to background script:', error);
        return '';
    }
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

    const textBeforeCursor = element.value.substring(0, element.selectionEnd);
    const textWidth = measureTextWidth(element, textBeforeCursor);
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    // Create the ghost element and style it to match the input
    ghostElement = document.createElement('span');
    ghostElement.textContent = completion;
    ghostElement.style.position = 'absolute';
    ghostElement.style.pointerEvents = 'none'; // Click through the ghost text
    ghostElement.style.color = 'grey';
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
    currentCompletion = completion;
    activeElementForGhost = element;
    element.addEventListener('keydown', handleKeydown, { once: true });
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
    }
    removeGhostText();
}

// Handles keyboard events to accept or dismiss the completion
function handleKeydown(e) {
    if (e.key === 'Tab') {
        e.preventDefault(); // Prevent focus from changing
        e.stopPropagation(); // Stop other listeners
        acceptCompletion();
    }
    // For any other key, we let the 'input' event in handleInput clear the ghost text.
}

const debouncedGetCompletion = debounce(async (element) => {
    // We only want completions if the user's cursor is at the end of the text.
    if (element.selectionStart !== element.value.length) {
        return;
    }

    const textBeforeCursor = element.value.substring(0, element.selectionStart);
    if (textBeforeCursor.length === 0) {
        return;
    }

    // Construct the prompt: current URL + space + last 1000 chars of text
    const prompt = `${window.location.href} ${textBeforeCursor.slice(-1000)}`;
    const completion = await getCompletion(prompt);

    if (completion) {
        // Ensure the element is still focused before showing completion
        if (document.activeElement === element) {
            showCompletion(element, completion);
        }
    }
}, 200); // 200ms debounce delay

function handleInput(event) {
    // On any input, the old suggestion is invalid.
    removeGhostText();

    const element = event.target;
    let state = inputState.get(element);
    const now = Date.now();

    // Reset character count if it's a new element or user paused for > 3 seconds
    if (!state || (now - state.lastTypedTimestamp) > 3000) {
        state = { charCount: 1, lastTypedTimestamp: now };
    } else {
        state.charCount++;
        state.lastTypedTimestamp = now;
    }
    inputState.set(element, state);
    
    // Trigger completion check if at least 4 chars have been typed in the current session
    if (state.charCount >= 4) {
        debouncedGetCompletion(element);
    }
}

function attachListeners() {
    document.querySelectorAll('textarea, input[type="text"], input:not([type])').forEach(element => {
        if (element.dataset.scribblitListener) return;
        element.dataset.scribblitListener = 'true';
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

console.log("Scribblit content script loaded and observer started."); 