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
- name: The input you are given is written very hastily, so expand shorthand like "HW" to the full term like "Homework". Don't expand acronyms. Remove words from the name that provide no value, like "due". The name you produce shouldn't remove any details from the input. Format the name to use sentence case, not title case.
- date: Each event has one or more dates. Tasks have 0 or more. You list each date in a separate block and indent it's properties. You can also list an endTime for tasks (time it is due). Use "RECUR=" for recurring startDate for events and endDate for tasks. If they say every 7 mondays use RECUR=monday*7. endDate for event is only included if it runs 24/7 from startDate,startTime to endDate,endTime each time it occurs. For events, only startDate is mandatory, but if endTime is included, startDate must be included. Tasks have endDate and endTime, both optional. For tasks, startDate and startTime are when they become visible. Never include startDate or startTime for tasks unless the user asks to hide the task until a certain date. You can recur 5 times with recurCount:5. You can bound recurring with recurStart and recurEnd dates. You can recur every # of days with RECUR=day*#. Weekly is just RECUR=day*7. Annually is RECUR=day*365. You can recur on the 3rd of the month with RECUR=day3. If not specified, recurStart is today and recurEnd is indefinite.

Examples with all fields but date omitted:
Event example: Class every Monday at 3pm to 5pm and this Thursday at 4pm. Today is Friday, August 12th. Semester ends December 18th.
"date": [
    {
        "startDate": "RECUR=monday",
        "startTime": "15:00",
        "endTime": "17:00",
        "recurStart": "2024-8-12",
        "recurEnd": "2024-12-18"
    },
    {
        "startDate": "thursday",
        "startTime": "16:00"
    }

Event example: Theme park open from every 2nd friday at 9pm to sunday at 6pm. Today is Friday, August 12th.
"date": {
    "startDate": "RECUR=friday*2",
    "startTime": "21:00",
    "endDate": "sunday",
    "endTime": "18:00"
}

Task example: HW due every Monday at 5pm. Today is Friday, August 12th.
"date": {
    "endDate": "RECUR=monday",
    "endTime": "17:00"
}

Task example: Fill out daily progress by 9pm. I only want to see this task 3 hrs before. Today is Friday, August 12th.
"date": {
    "startDate": "2024-8-12",
    "startTime": "18:00",
    "endDate": "2024-8-12",
    "endTime": "21:00"
}

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