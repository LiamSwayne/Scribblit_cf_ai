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
        const cerebrasRequest = {
            model: modelName,
            messages: [
                { role: 'system', content: system_prompt },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: 8192,
            stream: false,
        };
        let url;
        if (chat) {
            url = 'https://api.cerebras.ai/v1/chat/completions';
        } else {
            url = 'https://api.cerebras.ai/v1/completions';
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
        return result.choices?.[0]?.message?.content || '';
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

                        let [url1, url2, url3, url4, url5, ...last1000chars] = userPrompt.split(' ');

                        last1000chars = last1000chars.join(' ');

                        let system_prompt = "You are trying to predict what the user will type next in their browser. Past 4 urls: " + url1 + "," + url2 + "," + url3 + "," + url4 + ". Current url: " + url5

                        const content = await callCerebrasModel(MODELS.CEREBRAS_MODELS.qwen3, last1000chars, env, system_prompt, false);

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