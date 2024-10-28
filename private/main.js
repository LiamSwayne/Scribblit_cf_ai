function SEND(data, status = 200, contentType = 'json', headers = {}) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    const defaultHeaders = {
        ...corsHeaders,
        ...headers,
    };
    if (contentType === 'json') {
        defaultHeaders['Content-Type'] = 'application/json';
        data = JSON.stringify(data);
    } else if (contentType === 'text') {
        defaultHeaders['Content-Type'] = 'text/plain';
    } else if (contentType === 'none' || contentType === 'text-no-content-type') {
        // do not add content type header
    } else {
        data['SEND_function_error'] = 'SEND function on back-end received an invalid content type.';
        status = 451; // each error has an arbitrary unique identifier
    }
    if (data === null) {
        data = '';
    } else if (contentType === 'json') {
        data = JSON.stringify(data);
    }
    return new Response(data, {
        status,
        headers: defaultHeaders,
    });
}

export default {
    async fetch(request, env) {
        if (request.method !== 'POST') {
            return SEND({ error: 'Send a POST request with the input text' }, 405);
        }

        const input = await request.text();

        // Parse the input to get the date, time, dayOfWeek, and actual input
        const firstCommaIndex = input.indexOf(',');
        const secondCommaIndex = input.indexOf(',', firstCommaIndex + 1);
        const thirdCommaIndex = input.indexOf(',', secondCommaIndex + 1);
        const date = input.slice(0, firstCommaIndex);
        const time = input.slice(firstCommaIndex + 1, secondCommaIndex);
        const dayOfWeek = input.slice(secondCommaIndex + 1, thirdCommaIndex);
        const actualInput = input.slice(thirdCommaIndex + 1);

        const systemPrompt = `You are a task parsing AI. You will receive a list of tasks and/or events, potentially messy or informal. Your job is to format and structure this information.

Respond with a JSON array. Each item should have these properties:
- kind: "task" or "event". a task is anything that must be completed by a date but can be started at any time. an event is something that starts at a specific time, and may or may not have an end time.
- name: The name formatted to use sentence case, not title case. The input you are given is written very hastily, so expand shorthand like "HW" to the full term like "Homework". Don't expand acronyms. Remove words from the name that provide no value, like "due". The name you produce shouldn't remove any details from the input.
- date: If a date like "october 17th" is found put in YYYY-MM-DD format. If a day of the week is found like "this monday" return that day as a string like "monday". If a relative time like "tomorrow" or "today" is given, return "tomorrow" or "today" If no date is specified, assume it's today. If a day phrase relative to the span of a week like "next monday" is given, return "monday+1". this extends to phrases like "2 mondays from now" or "next next monday" or others, which should return "monday+2". The date may contain typos.
- startTime: In HH:mm format (24-hour). Only for events. Use reasoning and context of the current time to guess if the user means AM or PM when not explicitly stated. If a start time cannot be inferred do not include this field. Do not use the current time as a default start time for an event unless the user says it is starting now.
- endTime: In HH:mm format (24-hour). The end of an event or the due date of a task. If an end time cannot be inferred omit this field. Never use 23:59 as a default endTime for a task.

Give me a JSON response and nothing else.`;

        const requestBody = {
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 8192,
            system: [
                {
                    type: "text",
                    text: systemPrompt,
                    cache_control: { type: "ephemeral" }
                }
            ],
            messages: [
                {
                    role: "user",
                    content: `The date is ${date} (${dayOfWeek}) and the time is ${time}.\n\n${actualInput}`
                }
            ]
        };

        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': env.ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                    'anthropic-beta': 'prompt-caching-2024-07-31'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error(`Error in anthropic API! status: ${response.status}, body: ${errorBody}`);
                return SEND({ error: errorBody }, 562);
            }

            const result = await response.json();
            console.log(result);
            return SEND(result.content[0].text, 200, 'text-no-content-type');
        } catch (error) {
            console.error('Error processing input:', error);
            return SEND({ error: 'Failed to process input' }, 563);
        }
    }
}