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

function parseCompletion(precedingChars, completionResponse) {
    let completion = completionResponse;
    const thinkTag = '</think>';
    const thinkTagIndex = completion.indexOf(thinkTag);
    if (thinkTagIndex !== -1) {
        completion = completion.substring(thinkTagIndex + thinkTag.length);
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

    // sometimes the model returns: "word " is thing they're trying to type
    if (completion.startsWith('"')) {
        completion = completion.substring(1);
    }

    if (completion.endsWith('"')) {
        completion = completion.substring(0, completion.length - 1);
        completion = completion.trimEnd();
    }

    // 3. The remaining part is the suggestion we want to surface.
    let remaining = completion.slice(overlapLength).trimStart();

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