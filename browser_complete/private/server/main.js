let error_code = 478;

function SEND(data, status = 200, headers = {}) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    return new Response(data, {
        status,
        headers: {
            ...corsHeaders,
            'Content-Type': 'text/plain',
            ...headers
        },
    });
}

const MODELS = {
    CEREBRAS_MODELS: {
        qwen3: 'qwen-3-32b', // reasoning; smartest model
        llama_scout: 'llama-4-scout-17b-16e-instruct' // no reasoning; fastest model
    }
};

async function callCerebrasModel(modelName, userPrompt, env, system_prompt, chat) {
    if (typeof chat !== 'boolean') {
        return SEND("chat must be a boolean", error_code);
    }
    if (!Object.values(MODELS.CEREBRAS_MODELS).includes(modelName)) {
        return SEND("Unsupported Cerebras model: " + modelName, error_code);
    }
    try {
        let cerebrasRequest;
        let url;

        if (chat) {
            url = 'https://api.cerebras.ai/v1/chat/completions';
            cerebrasRequest = {
                model: modelName,
                messages: [
                    { role: 'system', content: system_prompt },
                    { role: 'user', content: userPrompt },
                ],
                max_tokens: 8192,
                stream: false,
            };
        } else {
            url = 'https://api.cerebras.ai/v1/completions';
            cerebrasRequest = {
                model: modelName,
                prompt: userPrompt,
                max_tokens: 20,
                stream: false,
            };
        }

        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${env.CEREBRAS_API_KEY}`,
            },
            body: JSON.stringify(cerebrasRequest),
        });
        const result = await resp.json();
        console.log("Cerebras model response:")
        console.log(result);

        if (chat) {
            return result.choices?.[0]?.message?.content || '';
        } else {
            return result.choices?.[0]?.text || '';
        }
    } catch (err) {
        console.error('Cerebras model error:', err);
        // empty response triggers reroute to another model
        return SEND("Failed to process completion request.", error_code);
    }
}

function createPrompt(url, precedingChars) {
    return `The user is currently visiting ${url} and they are typing in a text field. Predict what the user will type next in the text field. You are trying to predidct the rest of the sentence, and nothing after the sentence. Predicting the rest of the sentence is extremely hard. 99% of the time you should return NULL because you don't have enough information. If you have no clue what the rest of the sentence is but the user is in the middle of typing a word, you may return a completion for just the rest of that word. The user may be in the middle of typing a word, and if so you should return the rest of the word, and the content that follows if applicable. Exclude the part of the content that the user has already typed.
    
    Example:
    {
        user: "I missed my flig"
        completion: "I missed my flight"
    }
    
    RESPOND WITH ABSOLUTELY NOTHING BUT THE COMPLETION. The last 100 characters they typed are: ${precedingChars}`;
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return SEND(null, 204);
        }

        switch (url.pathname) {
            case '/complete':
                {
                    if (request.method !== 'POST') {
                        return SEND('Method not allowed', 405);
                    }

                    try {
                        // text instead of json to avoid preflight
                        const userPrompt = await request.text();

                        if (!userPrompt || userPrompt.trim().length === 0) {
                            return SEND('Empty prompt', error_code);
                        }

                        let index = userPrompt.indexOf(' ');
                        let precedingChars = userPrompt.slice(index + 1);
                        let url = userPrompt.slice(0, index);

                        let prompt = createPrompt(url, precedingChars);

                        const content = await callCerebrasModel(MODELS.CEREBRAS_MODELS.qwen3, prompt, env, '', true);

                        console.log("Completion response:")
                        console.log(content);
                        return SEND(content, 200);

                    } catch (err) {
                        console.error('Completion error:', err);
                        return SEND('Failed to process completion request.', error_code);
                    }
                }

            default:
                return SEND('Endpoint not found', 404);
        }
    },
};