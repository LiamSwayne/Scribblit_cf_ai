// content.js
console.log("Scribblit content script injected.");

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
    console.log("Sending text to background script:", text.slice(-1000));
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'getCompletion',
            text: text.slice(-1000) // Send the last 1000 characters
        });

        if (chrome.runtime.lastError) {
            console.error("sendMessage failed:", chrome.runtime.lastError.message);
            return '';
        }

        if (response) {
            return response.completion || '';
        } else {
            console.error("Received an undefined or null response from background script. This indicates the background script did not send a reply.");
            return '';
        }
    } catch (error) {
        console.error('Error sending message to background script. The background script might have crashed or is not responding.', error);
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
    const text = element.value || element.innerText; // Handle contenteditable
    if (text.length > 0) {
        console.log("Debounced function triggered for element:", element);
        const completion = await getCompletion(text);
        if (completion) {
            console.log("Received completion from background:", completion);
            if (lastActiveElement === element) {
                showCompletion(element, completion);
            }
        } else {
            console.log("No completion received or completion was empty.");
        }
    }
}, 500); // 500ms debounce delay


function handleInput(event) {
    console.log("Input detected in:", event.target);
    lastActiveElement = event.target;
    debouncedGetCompletion(event.target);
}


function attachListeners() {
    console.log("Attaching listeners to text fields and contenteditables...");
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
        console.log("Attaching listener to contenteditable:", element);
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

console.log("Scribblit content script loaded and observer started."); 