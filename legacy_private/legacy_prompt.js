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

        // Handle file upload endpoint
        if (request.url.endsWith('/process-file')) {
            try {
                // Parse form data
                const formData = await request.formData();
                const file = formData.get('file');
                const date = formData.get('date');
                const time = formData.get('time');
                const dayOfWeek = formData.get('dayOfWeek');
                
                if (!file) {
                    return SEND({ error: 'No file uploaded' }, 400);
                }
                
                // Get file content as ArrayBuffer
                const buffer = await file.arrayBuffer();
                const base64Data = bufferToBase64(buffer);
                
                // Get the file type
                const fileType = file.type;
                const fileName = file.name;
                
                // Prepare the system prompt
                const systemPrompt = `You are a task parsing AI. You will receive a file containing tasks, events, or schedule information. 
Your job is to extract and format this information into structured data.

The file type is: ${fileType}
The file name is: ${fileName}

Respond with a JSON array. Each item should have these properties:
- kind: "task" or "event". a task is anything that must be completed by a date but can be started at any time. an event is something that starts at a specific time, and may or may not have an end time.
- name: The input you are given is written very hastily, so expand shorthand like "HW" to the full term like "Homework". Don't expand acronyms. Remove words from the name that provide no value, like "due". The name you produce shouldn't remove any details from the input. Format the name to use sentence case, not title case.
- date: If a date like "october 17th" is found put in YYYY-MM-DD format. If a relative time like "tomorrow" or "today" is given, return "tomorrow" or "today" If no date is specified, assume it's today. If a day of the week is found like "this monday" return that day as a string like "monday". If a day phrase relative to the span of a week like "next monday" is given, return "monday+1". This extends to phrases like "2 mondays from now" or "next next monday" or others, which should return "monday+2". The date may contain typos. If a task is overdue you should put the overdue date, not the current date.
- startTime: In HH:mm format (24-hour). Only for events. If a time is stated but doesn't state AM or PM use reasoning to infer AM or PM. If the start time cannot be figured out omit this field rather than making a guess. Never assign a "default" start time like the current time or 0:00, just omit the field instead.
- endTime: In HH:mm format (24-hour). The end of an event or the due date of a task. If an end time cannot be inferred omit this field. Never use 23:59 as a default endTime for a task.
- recurPattern: If a task or event is recurring like "every monday" or "every 2 weeks" make this field's value "daily" or "weekly" or "biweekly" or "monthly" or "yearly". If the task is not recurring or the recurrence pattern is unclear omit this field. For specific days of the week like "every monday and tuesday" return the days like "monday,tuesday". If it's a weekend day like "every weekend" return "saturday,sunday". If the recurrence pattern has a different time for specific recurrences like "every monday at 3pm and every tuesday at 4pm" return the days and times like "monday@15:00,tuesday@16:00". For every n'th week return "weekly+n" like "weekly+7" for every 7 weeks. For the first day, monday, etc of the month return "monthly_first_day" or "monthly_first_monday" etc. You can have multiple recurrence patterns in the same string like "weekly+7,monthly_first_monday".

FOR THE TIME BEING, JUST CREATE MULTIPLE TASKS/EVENTS FOR RECURRING TASKS/EVENTS INSTEAD OF CREATING PATTERNS. IF SOMETHING RECURS MANY TIMES, DO IT TO A MAX OF SIX TIMES.

Extract as many tasks and events as you can find in the document.
Analyze the content thoroughly to identify all task and event information.
Give me a JSON response and nothing else.`;

                // Prepare request body for Anthropic API
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
                            content: [
                                {
                                    type: "text",
                                    text: `The date is ${date} (${dayOfWeek}) and the time is ${time}. Please extract all tasks and events from the attached file.`
                                },
                                {
                                    type: "image",
                                    source: {
                                        type: "base64",
                                        media_type: fileType,
                                        data: base64Data
                                    }
                                }
                            ]
                        }
                    ]
                }; 

                // Call Anthropic API with the file content
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
                console.error('Error processing file:', error);
                return SEND({ error: 'Failed to process file: ' + error.message }, 563);
            }
        }

        // Handle regular text input
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
- date: If a date like "october 17th" is found put in YYYY-MM-DD format. If a relative time like "tomorrow" or "today" is given, return "tomorrow" or "today" If no date is specified, assume it's today. If a day of the week is found like "this monday" return that day as a string like "monday". If a day phrase relative to the span of a week like "next monday" is given, return "monday+1". This extends to phrases like "2 mondays from now" or "next next monday" or others, which should return "monday+2". The date may contain typos. If a task is overdue you should put the overdue date, not the current date.
- startTime: In HH:mm format (24-hour). Only for events. If a time is stated but doesn't state AM or PM use reasoning to infer AM or PM. If the start time cannot be figured out omit this field rather than making a guess. Never assign a "default" start time like the current time or 0:00, just omit the field instead.
- endTime: In HH:mm format (24-hour). The end of an event or the due date of a task. If an end time cannot be inferred omit this field. Never use 23:59 as a default endTime for a task.
- recurPattern: If a task or event is recurring like "every monday" or "every 2 weeks" make this field's value "daily" or "weekly" or "biweekly" or "monthly" or "yearly". If the task is not recurring or the recurrence pattern is unclear omit this field. For specific days of the week like "every monday and tuesday" return the days like "monday,tuesday". If it's a weekend day like "every weekend" return "saturday,sunday". If the recurrence pattern has a different time for specific recurrences like "every monday at 3pm and every tuesday at 4pm" return the days and times like "monday@15:00,tuesday@16:00". For every n'th week return "weekly+n" like "weekly+7" for every 7 weeks. For the first day, monday, etc of the month return "monthly_first_day" or "monthly_first_monday" etc. You can have multiple recurrence patterns in the same string like "weekly+7,monthly_first_monday".

FOR THE TIME BEING, JUST CREATE MULTIPLE TASKS/EVENTS FOR RECURRING TASKS/EVENTS INSTEAD OF CREATING PATTERNS. IF SOMETHING RECURS MANY TIMES, DO IT TO A MAX OF SIX TIMES.

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

// Helper function to convert ArrayBuffer to Base64
function bufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}