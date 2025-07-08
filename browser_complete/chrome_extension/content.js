// content.js

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

let lastActiveElement = null;

// Function to get completion from the background script
async function getCompletion(text) {
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'getCompletion',
            text: text.slice(-1000) // Send the last 1000 characters
        });
        return response.completion || '';
    } catch (error) {
        console.error('Error sending message to background script:', error);
        return '';
    }
}

// Function to show completion as ghost text
function showCompletion(element, completion) {
    // Basic ghost text implementation.
    // A more robust solution would create a separate element and position it.
    if (!element.value.endsWith(completion)) {
        // This is a simplified approach. It might not work well with all inputs.
        // For a real product, you'd want a more sophisticated way to show ghost text
        // that doesn't modify the actual input value until the user accepts it.
        const originalValue = element.value;
        element.style.color = 'gray';
        element.value = originalValue + completion;
        
        // When the user types next, we want to remove the ghost text and restore the original value.
        const onInputOnce = () => {
            element.value = originalValue;
            element.style.color = '';
            element.removeEventListener('input', onInputOnce);
        };
        element.addEventListener('input', onInputOnce);

        // Accept completion with Tab key
        const onKeydown = (e) => {
             if (e.key === 'Tab') {
                e.preventDefault();
                element.style.color = '';
                // The value is already there, so we just remove the event listeners.
                element.removeEventListener('input', onInputOnce);
                element.removeEventListener('keydown', onKeydown);
            }
        };
        element.addEventListener('keydown', onKeydown);
    }
}

const debouncedGetCompletion = debounce(async (element) => {
    const text = element.value;
    if (text.length > 0) {
        const completion = await getCompletion(text);
        if (completion && lastActiveElement === element) {
            showCompletion(element, completion);
        }
    }
}, 500); // 500ms debounce delay


function handleInput(event) {
    lastActiveElement = event.target;
    debouncedGetCompletion(event.target);
}


function attachListeners() {
    // Find all textareas and text inputs
    document.querySelectorAll('textarea, input[type="text"], input:not([type])').forEach(element => {
        // Avoid attaching multiple listeners
        if (element.dataset.scribblitListener) return;
        element.dataset.scribblitListener = 'true';

        element.addEventListener('input', handleInput);
    });

    // Handle contentEditable elements
    document.querySelectorAll('[contenteditable="true"]').forEach(element => {
        if (element.dataset.scribblitListener) return;
        element.dataset.scribblitListener = 'true';
        // The logic for contenteditable would be different and more complex
        // This is a placeholder for future implementation
        // element.addEventListener('input', handleContentEditableInput);
    });
}

// Initial attachment
attachListeners();

// The DOM can change, so we need to periodically check for new input fields
const observer = new MutationObserver((mutations) => {
    // A simple approach is to just re-run attachListeners on any DOM change.
    // This is not super efficient, but it's robust for dynamic pages.
    attachListeners();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

console.log("Scribblit content script loaded."); 