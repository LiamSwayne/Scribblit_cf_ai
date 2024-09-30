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
    } else if (contentType === 'none') {
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
        const currentDate = new Date().toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format

        const systemPrompt = `You are a task parsing AI. You will receive a list of tasks and/or events, potentially messy or informal. Your job is to format and structure this information.

        For each task/event:
        1. Apply proper formatting and capitalization.
        2. Infer the date. If no date is specified, assume it's for today (${currentDate}). If "tomorrow" or a day of the week is mentioned, calculate the actual date.
        3. Determine the time, if applicable. If it's past noon and only a number is given (e.g., "at 3"), assume PM. Use reasoning to guess AM/PM when not explicitly stated. Do not assume the end time of events unless it can be figured out from the input. Some have a flexible end time, so they should just not be given an end time.

        Respond with a JSON array. Each item should have these properties:
        - kind: "task" or "event". generally a task is anything that must be done by a certain date but can be started at any time. an event is something that starts at a specific time, and may or may not have an end time.
        - name: The formatted task name
        - date: If a date like "october 17th" is found put in YYYY-MM-DD format. If a day of the week is found like "this monday" return that day as a string like "monday". If a relative time like "tomorrow" or "today" is given, return "tomorrow" or "today". if a day phrase relative to the span of a week like "next monday" is given, return "monday+1". this extends to phrases like "2 mondays from now" or "next next monday" or others, which should return "monday+2"
        - startTime: In HH:mm format (24-hour) (only for events)
        - endTime: In HH:mm format (24-hour) (the end of an event or the due date of a task)
        If a field cannot be inferred, instead of giving a null value just omit it completely. For example: if not time is given, don't provide the startTime or endTime fields. Never use 23:59 as a default due date for a task.
        
        The input you are given is written very quickly and hastily, so you should expand parts where they meant a word but just typed a few characters. Like "HW" should be expanded to "Homework". This doesn't mean you should expand acronyms. Also remove words from the name that provide no value, like "due". So "slideshow due for Bio" should be "Slideshow for Bio". Omit trailing commas in the JSON. Generally do not shorten or abbreviate task names and never remove information from them.

        Give me a JSON response and nothing else.`;

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: input }
        ];

        try {
            const response = await env.AI.run("@cf/meta/llama-3-8b-instruct-awq", { messages });
            
            // Parse the JSON to ensure it's valid
            const parsedData = JSON.parse(response.response);
            return SEND(parsedData);
        } catch (error) {
            console.error('Error processing input:', error);
            return SEND({ error: 'Failed to process input' }, 500);
        }
    }
}