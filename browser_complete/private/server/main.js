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

const system_prompt = `The user is using their browser and they are typing in a text field. Predict what the user will type next in the text field. You are trying to predict the rest of the sentence they are currently working on, and nothing before or after the sentence. Predicting the rest of the sentence is extremely hard. 99% of the time you should return NULL because you don't have enough information. If you have no clue what the rest of the sentence is but the user is in the middle of typing a word, you may return a completion for just the rest of that word, but if you are still unsure just return NULL. The user may be in the middle of typing a word, and if so you should return the rest of the word, and the content that follows if applicable. Exclude the part of the content that the user has already typed. If the user is done with their current word and you think the sentence is incomplete, you should put a space at the beginning of your response.
    
Example: the user typed "I missed my fli" and you return "I missed my flight"
Example: the user typed "than" and you return "thank you"
Example: the user typed "If I'm late to the airport I'll m" and you return "If I'm late to the airport I'll miss my flight."
Example: the user typed "This has been a hard time! Thank your for sti" and you return "Thank you for sticking with me."
Example: the user typed "What have you been up to?" and you return "What have you been up to?"

RESPOND WITH ABSOLUTELY NOTHING BUT THE COMPLETION. Remember that it is better to return NULL than to return a completion that is not the rest of the sentence.`

// almost the same, but is allowed to make corrections to the part of the sentence that the user has already typed
const system_prompt_allowing_corrections = `The user is using their browser and they are typing in a text field. Predict what the user will type next in the text field. You are trying to predict the rest of the sentence they are currently working on, and nothing before or after the sentence. Predicting the rest of the sentence is extremely hard. 99% of the time you should return NULL because you don't have enough information. If you have no clue what the rest of the sentence is but the user is in the middle of typing a word, you may return a completion for just the rest of that word, but if you are still unsure just return NULL. The user may be in the middle of typing a word, and if so you should return the rest of the word, and the content that follows if applicable. Exclude the part of the content that the user has already typed. If the user is done with their current word and you think the sentence is incomplete, you should put a space at the beginning of your response.
    
Example: the user typed "I missed my fli" and you return "I missed my flight"
Example: the user typed "than" and you return "thank you"
Example: the user typed "If I'm late to the airport I'll m" and you return "If I'm late to the airport I'll miss my flight."
Example: the user typed "This has been a hard time! Thank your for sti" and you return "Thank you for sticking with me."
Example: the user typed "What have you been up to?" and you return "What have you been up to?"
Example: the user typed "I'm going to the " and you return "NULL" because you don't have enough information to predict the rest of the sentence

If you need to correct any typos in the part of the sentence that the user has already typed, you must use "CORRECTION: " at the beginning of your response.

RESPOND WITH ABSOLUTELY NOTHING BUT THE COMPLETION.`

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

                        let prompt = `Context: The user is currently visiting ${url}. The last 100 characters they typed are: ${precedingChars}`;

                        const content = await callCerebrasModel(MODELS.CEREBRAS_MODELS.qwen3, prompt, env, system_prompt, true);

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