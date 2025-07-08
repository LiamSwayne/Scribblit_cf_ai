// background.js
console.log("Background script started.");

// the user never sees this url, so it's ok  to be the raw cloudflare worker
// for other stuff, use browser-complete.scribbl.it
const WORKER_DOMAIN = 'browser-complete.unrono.workers.dev';

// Function to inject content script into a tab
function injectContentScript(tabId) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
    }).then(() => {
        console.log(`Injected content script into tab ${tabId}`);
    }).catch(err => console.log(`Error injecting script into tab ${tabId}:`, err)); // Ignore errors on pages like chrome://
}

// Inject content script into all existing tabs when the extension is installed/updated
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed/updated.");
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            if (tab.url && (tab.url.startsWith('http') || tab.url.startsWith('file'))) {
                 injectContentScript(tab.id);
            }
        });
    });
});


// Track visited URLs and inject content script on new navigations
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && (tab.url.startsWith('http') || tab.url.startsWith('https'))) {
        console.log(`Tab ${tabId} updated to URL: ${tab.url}`);
        // Inject content script
        injectContentScript(tabId);
    }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Received message from content script:", request);
    if (request.action === 'getCompletion') {
        handleGetCompletion(request.text)
            .then(completion => {
                sendResponse({ completion });
            })
            .catch(error => {
                console.error('Error getting completion:', error);
                sendResponse({ completion: '' }); // Send empty completion on error
            });
        return true; // Indicates that the response is sent asynchronously
    }
    return false;
});

function parseCompletion(fullText, completionResponse) {
    // Extract precedingChars from the full text sent to API
    // Format is: url + ' ' + precedingChars
    const spaceIndex = fullText.indexOf(' ');
    let precedingChars = '';
    if (spaceIndex !== -1) {
        precedingChars = fullText.slice(spaceIndex + 1);
    } else {
        return '';
    }
    
    let completion = completionResponse;
    const thinkTag = '</think>';
    while (completion.indexOf(thinkTag) !== -1) {
        // remove all think tags
        completion = completion.substring(completion.indexOf(thinkTag) + thinkTag.length);
    }

    // remove leading newlines
    while (completion.startsWith('\n')) {
        completion = completion.substring(1);
    }

    // change double spaces to single spaces
    completion = completion.replace(/  /g, ' ');

    // remove trailing spaces from the end only
    completion = completion.trimEnd();

    if (completion.length == 0) {
        return '';
    }

    if (completion.includes('NULL')) {
        return '';
    }

    // the model sometimes refers to the user as "the user", indicating that their output doesn't fit what we're looking for
    if (completion.includes('the user')) {
        return '';
    }

    // if punctuation is in the middle, the model generated more than one sentence, which is not what we want
    for (const char of ['.', '!', '?']) {
        if (completion.startsWith(char + ' ')) {
            return '';
        }
    }

    // the model likely just copied the last sentence with no changes
    if (completion.length > 50 && fullText.includes(completion)) {
        return '';
    }

    // sometimes the model returns: "word " is thing they're trying to type
    if (completion.startsWith('"')) {
        completion = completion.substring(1);
    }

    if (completion.endsWith('"')) {
        completion = completion.substring(0, completion.length - 1);
        completion = completion.trimEnd();
    }

    if (completion.length === 0) {
        return '';
    }

    console.log("Response before overlap analysis: " + completion);

    // Find the longest common prefix between what user typed and the completion
    // This handles the case where the model returns the entire sentence
    let overlapLength = 0;
    
    // Try to find the longest suffix of precedingChars that matches a prefix of completion
    // This handles cases where the model returns the complete sentence
    for (let i = 0; i < precedingChars.length; i++) {
        const suffix = precedingChars.slice(i);
        if (completion.toLowerCase().startsWith(suffix.toLowerCase())) {
            overlapLength = suffix.length;
            break;
        }
    }
    
    // If no suffix match found, try character-by-character from the beginning
    if (overlapLength === 0) {
        const maxLength = Math.min(precedingChars.length, completion.length);
        for (let i = 0; i < maxLength; i++) {
            if (precedingChars[i].toLowerCase() === completion[i].toLowerCase()) {
                overlapLength = i + 1;
            } else {
                break;
            }
        }
    }

    // Extract the remaining part after the overlap
    let remaining = completion.slice(overlapLength);
    
    // If the remaining part starts with a space, keep it; otherwise add one if needed
    if (remaining.length > 0 && precedingChars.length > 0 && !remaining.startsWith(' ') && !precedingChars.endsWith(' ')) {
        // Check if we're completing a word (no space needed) or starting a new word (space needed)
        const lastChar = precedingChars[precedingChars.length - 1];
        if (lastChar !== ' ' && remaining[0] !== ' ') {
            // We're likely completing a word, don't add space
            remaining = remaining.trimStart();
        }
    } else {
        remaining = remaining.trimStart();
    }

    if (remaining.length === 0 || remaining.includes('NULL')) {
        return '';
    }

    return remaining;
}

async function handleGetCompletion(text) {
    console.log("Handling getCompletion with prompt:", text);

    const fullUrl = 'https://' + WORKER_DOMAIN + '/complete';
    console.log("Fetching from URL:", fullUrl);

    try {
        const response = await fetch(fullUrl, {
            method: 'POST',
            body: text, // The 'text' from content.js is now the full prompt
            headers: {
                'Content-Type': 'text/plain'
            }
        });

        if (!response.ok) {
            console.error(`API request failed with status ${response.status}`);
            throw new Error(`API request failed with status ${response.status}`);
        }

        const completionResponse = await response.text();
        console.log("Sent: " + text);
        const completion = parseCompletion(text, completionResponse);
        if (completion.length == 0) {
            console.log("No completion received");
        } else {
            console.log("Received:" + completion);
        }
        return completion;
    } catch (error) {
        console.error('Failed to fetch completion:', error);
        return ''; // Return empty string on failure
    }
}