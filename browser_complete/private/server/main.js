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

                        let prompt = "The user is currently visiting " + url + " and they are typing in a text field. Predict what the user will type next in the text field. Maxiumum of 10 words. If you are not very confident that you can predict the next 10 words, just return NULL. The last 100 characters they typed are: " + precedingChars;

                        const content = await callCerebrasModel(MODELS.CEREBRAS_MODELS.qwen3, prompt, env, '', false);

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