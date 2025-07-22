import { AlarmManager } from './alarm-manager.js';

const NULL = Symbol('NULL');

const SERVER_DOMAIN_OLD = 'scribblit-production.unrono.workers.dev';
const SERVER_DOMAIN = 'app.scribbl.it';
const OLD_PAGES_DOMAIN = 'scribblit2.pages.dev';
const PAGES_DOMAIN = 'scribbl.it';
const FREE_PLAN_USAGE_LIMIT = 100;

let MODELS = {
    GEMINI_MODELS: {
        flash: 'gemini-2.5-flash',
        flash_lite: 'gemini-2.5-flash-lite-preview-06-17'
    },
    
    ANTHROPIC_MODELS: {
        haiku: 'claude-3-5-haiku-20241022',
        sonnet: 'claude-sonnet-4-20250514'
    },
    
    GROQ_MODELS: {
        qwen3: 'qwen/qwen3-32b'
    },
    
    CEREBRAS_MODELS: {
        qwen3: 'qwen-3-32b'
    },
    
    XAI_MODELS: {
        grok4: 'grok-4',
    }
}

function SEND(data, status = 200, headers = {}) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (typeof data === 'object' && data !== null) {
        data = JSON.stringify(data);
        if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
    }

    return new Response(data, {
        status,
        headers: {
            ...corsHeaders,
            ...headers
        },
    });
}

async function hash(password, salt = "") {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

async function verifyToken(token, secret_key) {
    try {
        const [payloadBase64, signatureBase64] = token.split('.');
        const payload = JSON.parse(atob(payloadBase64));

        if (payload.exp && Date.now() / 1000 > payload.exp) {
            return null; // Token expired
        }

        const signature = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret_key), {
                name: 'HMAC',
                hash: 'SHA-256'
            },
            false,
            ['verify']
        );
        const data = encoder.encode(JSON.stringify(payload));
        const isValid = await crypto.subtle.verify('HMAC', key, signature, data);
        if (!isValid) {
            return null;
        }
        return payload.email;
    } catch (err) {
        return null;
    }
}

async function generateToken(email, secret_key) {
    const payload = {
        email,
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 30) // 30 days
    };
    const payloadBase64 = btoa(JSON.stringify(payload));
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret_key), {
            name: 'HMAC',
            hash: 'SHA-256'
        },
        false,
        ['sign']
    );
    const data = encoder.encode(JSON.stringify(payload));
    const signature = await crypto.subtle.sign('HMAC', key, data);
    const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
    return `${payloadBase64}.${signatureBase64}`;
}

let datePatternTypesPrompt = `// 5 options
                {
					"type": "weekly_pattern"
                    "every_n_weeks": // integer
					"day_of_week": // string like "monday". if you choose this pattern, you must include a "range" field with a start date.
				}
                {
					"type": "every_n_days_pattern"
					"initial_date": "YYYY-MM-DD"
					"n": // integer
				}
				{
					"type": "monthly_pattern"
					"day": // integer 1-31 for nth day of month, or -1 for last day of each month
					"months": // array of 12 booleans. each boolean is true if that month is enabled. if the user doesn't specify which months are enabled, assume all of them are enabled
				}
				{
					"type": "annually_pattern"
					"month": // integer 1-12
					"day": // integer 1-31
				}
				{
					"type": "nth_weekday_of_months_pattern" // only use this pattern when weekly_pattern is not appropriate.
					"day_of_week": // integer 1-7
					"weeks_of_month": // "last" for last appearance of that weekday in the month. or an array of 4 booleans where each boolean represents if the pattern triggers on that week of the month. "2nd and 3rd friday of each month" would be [false, true, true, false].
					"months": // array of 12 booleans for if the pattern is enabled for that month.
				}`;

const constructEntitiesPrompt = `You are an AI that takes in user input and converts it to tasks, events, and reminders JSON. If something has to be done *by* a certain date/time but can be done before then, it is a task. If something has to be done at a specific date/time and cannot be done before then, it is an event. It is possible for an event to have only a start time if the end time is unknown. A reminder is a special case of something insignificant to be reminded of at a specific time and date. Only include OPTIONAL fields if the user specified the information needed for that field.

Task JSON:
{
    "type": "task"
    "name": // use sentence case  
    "instances": [ // 2 options
	    {
		    "type": "due_date_instance"
		    "date": "YYYY-MM-DD" // OPTIONAL. if a time a is given then assume the due date is today
		    "time": "HH:MM"// OPTIONAL
	    }
	    {
		    "type": "due_date_pattern"
		    "pattern": ${datePatternTypesPrompt}
		    "time": "HH:MM" // OPTIONAL
		    "range": // "YYYY-MM-DD:YYYY-MM-DD" bounds for when the pattern should start and end, or if no bounds are given assume starts today and has no end so its "YYYY-MM-DD:null", or give an integer for n times total across this instance.
	    }
	]
	"work_sessions": [ // OPTIONAL
		// array of objects with types "event_instance" and "event_pattern"
		// times when the user has said they want to work on the task
	]
}

Event JSON:
{
	"type": "event"
	"name": // use sentence case
	"instances": [ // 2 options
		{
			"type": "event_instance"
			"start_date": "YYYY-MM-DD", must be included if an end time is given
			"start_time": "HH:MM" // OPTIONAL, include if the start time is explictly known
			"end_time": "HH:MM" // OPTIONAL, include if the end time is explictly known
			"different_end_date": "YYYY-MM-DD" // OPTIONAL, include if the event runs 24/7 and ends on a different date than the start date
		}
		{
			"type": "event_pattern"
			"start_date_pattern": // object with type weekly_pattern, every_n_days_pattern, monthly_pattern, annually_pattern, or nth_weekday_of_months_pattern 
			"start_time": "HH:MM" // OPTIONAL
			"end_time": "HH:MM" // OPTIONAL
			"different_end_date_offset": // OPTIONAL, integer for how many days each occurrence of the event ends after it starts. only include if the event ends on a different day than it starts. can only be included if end_time is also given
			"range": // "YYYY-MM-DD:YYYY-MM-DD" or "YYYY-MM-DD:null" or integer number of times
		}
	]
}

Reminder JSON:
{
	"type": "reminder"
	"name": // use sentence case
	"instances": [
		{
			"type": "reminder_instance"
			"date": "YYYY-MM-DD"
		    "time": "HH:MM"
		}
		{
			"type": "reminder_pattern"
			"date_pattern": // object with type weekly_pattern, every_n_days_pattern, monthly_pattern, annually_pattern, or nth_weekday_of_months_pattern 
		    "time": "HH:MM"
		    "range": // "YYYY-MM-DD:YYYY-MM-DD" or "YYYY-MM-DD:null" or integer number of times
		}
	]
}

Don't forget to have commas in the JSON. You will return nothing but an array of objects of type task, event, or reminder. IF THE USER SPECIFIES HOUR OF DAY BUT NOT AM OR PM, AND IT IS PAST THE AM HOUR, YOU MUST ASSUME IT IS PM. FOR EXAMPLE, IF IT IS 11 AM AND THE USER SAYS "thing at 9", YOU MUST ASSUME IT IS 9 PM.`

let filesOnlyExtractSimplifiedEntitiesPrompt = `You are an AI that takes in the user's files and converts them to tasks, events, and reminders JSON. If something has to be done *by* a certain date/time but can be done before then, it is a task. If something has to be done at a specific date/time and cannot be done before then, it is an event. It is possible for an event to have only a start time if the end time is unknown. A reminder is a special case of something insignificant to be reminded of at a specific time and date. Only include OPTIONAL fields if the user specified the information needed for that field. Even events that are optional (things to just be aware of) should be included.

There is also a "work session", which is a time when the user has specified they should be working on a specific task. Work sessions are extremely rare. If you see a work session, make an "event": "WORK_SESSION: {task name}".

Format:
[
    {
        "task": "name in sentence case"
    },
    {
        "event": "name in sentence case",
    },
    {
        "reminder": "name in sentence case",
    }
    ...
]

A file may contain many things or just a few. If nothing can be extracted, just return an empty array.

If a task/event/reminder happens multiple times, you only create one of it, even if it is recurring. For example, a task that happens every Tuesday morning and every Friday afternoon should only be one task. Even if an event/task/reminder is in the past, you should still include it. Above all other rules do what the user wants. The user submitted this document for conversion, so it is highly likely that they want something returned. Return nothing but the array.`;

let filesOnlyExpandSimplifiedTaskPrompt = `You are an AI that takes in a simplified task JSON and expands it to include all the fields. A task is something that has to be done *by* a certain date/time but can be done before then. The task was found in the attached files that the user expects us to convert to tasks/events/reminders. You are only handling a single task. Here is the task spec:

Task JSON:
{
    "instances": [ // 2 options
	    {
		    "type": "due_date_instance"
		    "date": "YYYY-MM-DD" // OPTIONAL
		    "time": "HH:MM"// OPTIONAL. if it's due today and the current time is past noon assume numbers below 12 are pm.
	    }
	    {
		    "type": "due_date_pattern"
		    "pattern": ${datePatternTypesPrompt}
		    "time": "HH:MM" // OPTIONAL
		    "range": // "YYYY-MM-DD:YYYY-MM-DD" bounds for when the pattern should start and end, or if no bounds are given assume starts today and has no end so its "YYYY-MM-DD:null", or give an integer for n times total across this instance.
	    }
	]
}

If you cannot find a date you have to consider 2 options: if it's a task that seems like it has a deadline, assume it's due today. If it's a task that doesn't seems like it has a deadline, omit the field.

Never assume what time a task is due. If you can't find a time, or something that heavily suggests a time, omit the time field.

If something is due by today without a specific time, you can just omit the time and the user will just be notified that it's due today. It is better to omit the time than to assume it's a time that's not specified.

You have to capture all of the times this task occurs as one object, using a combination of patterns and individual instances if needed. There is no maximum number of instances.

You only job is to return the json object. Return nothing but the json object.`;

let filesOnlyExpandSimplifiedTaskWithWorkSessionsPrompt = `You are an AI that takes in a simplified task JSON and expands it to include all the fields. A task is something that has to be done *by* a certain date/time but can be done before then. The task was found in the attached files that the user expects us to convert to tasks/events/reminders. You are only handling a single task. Here is the task spec:

Task JSON:
{
    "instances": [ // 2 options
	    {
		    "type": "due_date_instance"
		    "date": "YYYY-MM-DD" // OPTIONAL
		    "time": "HH:MM"// OPTIONAL. if it's due today and the current time is past noon assume numbers below 12 are pm.
	    }
	    {
		    "type": "due_date_pattern"
		    "pattern": ${datePatternTypesPrompt}
		    "time": "HH:MM" // OPTIONAL
		    "range": // "YYYY-MM-DD:YYYY-MM-DD" bounds for when the pattern should start and end, or if no bounds are given assume starts today and has no end so its "YYYY-MM-DD:null", or give an integer for n times total across this instance.
	    }
	]
	"work_sessions": [ // OPTIONAL
		// array of objects with types "event_instance" and "event_pattern"
		// times when the user has said they want to work on the task
        {
			"type": "event_instance"
			"start_date": "YYYY-MM-DD", must be included if an end time is given
			"start_time": "HH:MM" // OPTIONAL, include if the start time is explictly known
			"end_time": "HH:MM" // OPTIONAL, include if the end time is explictly known
			"different_end_date": "YYYY-MM-DD" // OPTIONAL, include if the event runs 24/7 and ends on a different date than the start date
		}
		{
			"type": "event_pattern"
			"start_date_pattern": // object with type weekly_pattern, every_n_days_pattern, monthly_pattern, annually_pattern, or nth_weekday_of_months_pattern 
			"start_time": "HH:MM" // OPTIONAL
			"end_time": "HH:MM" // OPTIONAL
			"different_end_date_offset": // OPTIONAL, integer for how many days each occurrence of the event ends after it starts. only include if the event ends on a different day than it starts. can only be included if end_time is also given
			"range": // "YYYY-MM-DD:YYYY-MM-DD" or "YYYY-MM-DD:null" or integer number of times
		}
	]
}

Work sessions are very rare, but the ai has detected that this task may have work sessions. Work sessions are times when the user has explicitly said (or indicated in their files) that they want to work on the task. However the ai may have been wrong and there are no work sessions. Just remember to look for them.

If you cannot find a date you have to consider 2 options: if it's a task that seems like it has a deadline, assume it's due today. If it's a task that doesn't seems like it has a deadline, omit the field.

Never assume what time a task is due. If you can't find a time, or something that heavily suggests a time, omit the time field.

If something is due by today without a specific time, you can just omit the time and the user will just be notified that it's due today. It is better to omit the time than to assume it's a time that's not specified.

You have to capture all of the times this task occurs as one object, using a combination of patterns and individual instances if needed. There is no maximum number of instances.

You only job is to return the json object. Return nothing but the json object.`;

let filesOnlyExpandSimplifiedEventPrompt = `You are an AI that takes in a simplified event JSON and expands it to include all the fields. An event is something that has to be done at a specific date/time and cannot be done before then. The event was found in the attached files that the user expects us to convert to tasks/events/reminders. You are only handling a single event. Here is the event spec:

Event JSON:
{
	"instances": [ // 2 options
		{
			"type": "event_instance"
			"start_date": "YYYY-MM-DD", must be included if an end time is given
			"start_time": "HH:MM" // OPTIONAL, include if the start time is explictly known
			"end_time": "HH:MM" // OPTIONAL, include if the end time is explictly known
			"different_end_date": "YYYY-MM-DD" // OPTIONAL, include if the event runs 24/7 and ends on a different date than the start date
		}
		{
			"type": "event_pattern"
			"start_date_pattern": ${datePatternTypesPrompt}
			"start_time": "HH:MM" // OPTIONAL
			"end_time": "HH:MM" // OPTIONAL
			"different_end_date_offset": // OPTIONAL, integer for how many days each occurrence of the event ends after it starts. only include if the event ends on a different day than it starts. can only be included if end_time is also given
			"range": // "YYYY-MM-DD:YYYY-MM-DD" bounds for when the pattern should start and end, or if no bounds are given assume starts today and has no end so its "YYYY-MM-DD:null", or give an integer for n times total across this instance.
		}
	]
}

If the time an event starts and ends in not specified, you can just omit start and end time. If only the start time is specified, you can just omit the end time. If the event lasts multiple days, you use different_end_date or different_end_date_offset to make the event last multiple days. For example, a sleepover from 9pm to 10am the next day would have different_end_date_offset=1.

You have to capture all of the times this event occurs as one object, using a combination of patterns and individual instances if needed. There is no maximum number of instances.

You only job is to return the json object. Return nothing but the json object.`;

let filesOnlyExpandSimplifiedReminderPrompt = `You are an AI that takes in a simplified reminder JSON and expands it to include all the fields. A reminder is something insignificant to be reminded of at a specific time. The reminder was found in the attached files that the user expects us to convert to tasks/events/reminders. You are only handling a single reminder. Here is the reminder spec:

Reminder JSON:
{
	"instances": [
		{
			"type": "reminder_instance"
			"date": "YYYY-MM-DD"
		    "time": "HH:MM"
		}
		{
			"type": "reminder_pattern"
			"date_pattern": ${datePatternTypesPrompt}
		    "time": "HH:MM"
		    "range": // "YYYY-MM-DD:YYYY-MM-DD" bounds for when the pattern should start and end, or if no bounds are given assume starts today and has no end so its "YYYY-MM-DD:null", or give an integer for n times total across this instance.
		}
	]
}

You have to capture all of the times this reminder occurs as one object, using a combination of patterns and individual instances if needed. There is no maximum number of instances.

You only job is to return the json object. Return nothing but the json object.`;

let fileDescriptionPrompt = `You are an AI that takes in files and describes them with as much detail as possible. Do not include your comments, only the description. Use as much detail as possible, especially regarding dates and times. If the file contains text, extract 100% of the text. A different AI handles the user's prompt, but it may be helpful context for you. Your job is not to handle the user's request, only to describe the files.`;

let titleFormatterPromptNoFiles = `You are an AI that takes in a title of tasks, events, and reminders, and formats them to fix mistakes made by another AI. YOU SHOULD CORRECT ALL TITLES TO BE CAPITALIZED LIKE A REGULAR SENTENCE IN A BOOK. Remove unhelpful words like "!!!" or "due" that don't add to the meaning of the title. Instead of saying "Complete reading 8.1", just say "Reading 8.1" because the word "complete" is already implied by the fact that it's a task. Titles are often already correct and don't need to be changed. Do not include your comments, only the formatted titles in a JSON array.`;

let titleFormatterPromptWithFiles = `You are an AI that takes in a title of tasks, events, and reminders, and formats them to fix mistakes made by another AI. Remove unhelpful words like "!!!" or "due" that don't add to the meaning of the title. Instead of saying "Complete reading 8.1", just say "Reading 8.1" because the word "complete" is already implied by the fact that it's a task. Titles are often already correct and don't need to be changed.

These titles are being added to the user's personal task manager and calendar, and will be seen in the context of many other tasks, events, and reminders. Make sure that the titles provide enough context to not be confused with other tasks, events, and reminders. For example, if the user has tasks for a class, they may have multiple classes, so you may want to prefix the title with the class name or number. There is not a lot of space to write titles, but you should try to provide enough context to not be confused with other tasks, events, and reminders.

YOU SHOULD CORRECT ALL TITLES TO BE CAPITALIZED LIKE A REGULAR SENTENCE IN A BOOK. Do not include your comments, only the formatted titles in a JSON array.`;

async function draftEntities(userPrompt, env) {
    if (!userPrompt || userPrompt.trim().length === 0) {
        return SEND({ error: 'userPrompt is required' }, 475);
    }

    try {
        let startTime = Date.now();
        // Use Cerebras for quick draft
        let content = await callCerebrasModel(MODELS.CEREBRAS_MODELS.qwen3, userPrompt, env, constructEntitiesPrompt);
        console.log("Draft content: ");
        console.log(content);
        
        if (content && content.trim() !== '') {
            let chain = [{ thinking_request: {
                model: MODELS.CEREBRAS_MODELS.qwen3,
                typeOfPrompt: 'draft_convert_text_to_entities',
                response: content,
                startTime,
                endTime: Date.now(),
                userPrompt: userPrompt
            }}]
            // Return raw response for frontend parsing
            return { aiOutput: content, chain};
        } else {
            console.log("Failed to generate draft: Cerebras returned empty response");
            return SEND({ error: 'Failed to generate draft' }, 475);
        }
    } catch (error) {
        console.log('Error generating draft:', error);
        return SEND({ error: 'Failed to generate draft: ' + error.message }, 475);
    }
}

// must provide either a fileArray or a descriptionOfFiles
async function formatTitles(titlesObject, descriptionOfFiles, fileArray, env) {
    // titlesObject is like {"task-abc123": "Complete homework", "event-def456": "Meeting with John", ...}
    if (!titlesObject || typeof titlesObject !== 'object' || Object.keys(titlesObject).length === 0) {
        return SEND({ error: 'titlesObject is required and must be a non-empty object' }, 475);
    }

    const entries = Object.entries(titlesObject);
    const titles = entries.map(([key, title]) => title);
    
    let userPrompt;
    // first choice is to use files, but if not use description of files, and if neither are provided just use the titles
    if (fileArray && fileArray.length > 0) {
        // just use the normal prompt, and the files will be attached
        userPrompt = `Here are the titles to format: ${JSON.stringify(titles)}.`;
    } else if (descriptionOfFiles && descriptionOfFiles.trim()) {
        userPrompt = `Here's a description of some files the user attached to their prompt: ${descriptionOfFiles}\n\nHere are the titles to format: ${JSON.stringify(titles)}`;
    } else {
        userPrompt = `Here are the titles to format: ${JSON.stringify(titles)}.`;
    }

    let includesFiles = (fileArray && fileArray.length > 0) || (descriptionOfFiles && descriptionOfFiles.trim());

    let systemPrompt;
    if (includesFiles) {
        systemPrompt = titleFormatterPromptWithFiles;
    } else {
        systemPrompt = titleFormatterPromptNoFiles;
    }
    
    if (fileArray && fileArray.length > 0) {
        // gemini
        const geminiResult = await callGeminiModel(MODELS.GEMINI_MODELS.flash, userPrompt, env, fileArray, systemPrompt, true);
        content = geminiResult.response;
        
        if (content && content.trim() !== '') {
            // Return raw response for frontend parsing
            return { aiOutput: content, titlesObject };
        } else {
            console.log("Failed to format titles: Gemini 2.5 Flash returned empty response");
            return SEND({ error: 'Failed to format titles' }, 475);
        }
    } else {
        try {
            // 1st choice – xAI Grok-4
            let content = await callXaiModel(MODELS.XAI_MODELS.grok4, userPrompt, env, [], systemPrompt);
            console.log("content: ");
            console.log(content);
            
            if (content && content.trim() !== '') {
                // Return raw response for frontend parsing
                return { aiOutput: content, titlesObject };
            } else {
                console.log("xAI Grok-4 failed, falling back to Gemini 2.5 Flash");
                // 2nd choice – Gemini 2.5 Flash
                const geminiResult = await callGeminiModel(MODELS.GEMINI_MODELS.flash, userPrompt, env, fileArray, systemPrompt, true);
                content = geminiResult.response;
                
                if (content && content.trim() !== '') {
                    // Return raw response for frontend parsing
                    return { aiOutput: content, titlesObject };
                } else {
                    console.log("Failed to format titles: both models returned empty response");
                    return SEND({ error: 'Failed to format titles' }, 475);
                }
            }
        } catch (error) {
            console.log('Error formatting titles:', error);
            return SEND({ error: 'Failed to format titles' }, 475);
        }
    }
}

function createPromptWithFileDescription(userPrompt='', descriptionOfFiles) {
    if (!userPrompt || userPrompt.trim() === '') {
        return SEND({ error: 'Missing prompt in createPromptWithFileDescription.' }, 478);
    }

    return `The user provided some files as context for their prompt. Here is a description of the files:
${descriptionOfFiles}

User prompt:
${userPrompt}`;
}

async function callGeminiModel(modelName, userPrompt, env, fileArray=[], system_prompt, reasoning) {
    if (!Object.values(MODELS.GEMINI_MODELS).includes(modelName)) {
        throw new Error('Unsupported Gemini model: ' + modelName);
    }
    try {
        const parts = [{ text: userPrompt }];
        
        // Add files to the parts array
        if (fileArray && fileArray.length > 0) {
            for (const file of fileArray) {
                const base64Data = file.data;
                const mediaType = file.mimeType || 'application/octet-stream';
                const fileName = file.name;
                
                if (mediaType.startsWith('image/')) {
                    // Add image using inline data
                    parts.push({
                        inlineData: {
                            mimeType: mediaType,
                            data: base64Data
                        }
                    });
                } else if (mediaType.startsWith('text/')) {
                    try {
                        // Decode text file and add as text
                        const textContent = atob(base64Data);
                        parts.push({
                            text: `File: ${fileName}\nContent:\n${textContent}`
                        });
                    } catch (err) {
                        console.log('Error decoding base64 text file:', err);
                        return SEND({ error: 'Error decoding base64 text file: ' + err }, 475);
                    }
                } else if (mediaType.startsWith('application/pdf')) {
                    // Add PDF using inline data
                    parts.push({
                        inlineData: {
                            mimeType: mediaType,
                            data: base64Data
                        }
                    });
                } else {
                    console.log("Unsupported media type for Gemini: " + mediaType);
                }
            }
        }
        
        const body = {
            model: modelName,
            system_instruction: { parts: [{ text: system_prompt }] },
            contents: [{ parts }],
        };

        if (reasoning) {
            body.generation_config = {
                thinking_config: {
                    thinking_budget: -1, // let the model decide how long to think for
                    include_thoughts: true
                }
            }
        } else {
            body.generation_config = {
                thinking_config: {
                    thinking_budget: 0 // no thinking
                }
            }
        }

        const genRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const genJson = await genRes.json();
        const outParts = genJson?.candidates?.[0]?.content?.parts || [];

        let thoughts = [];
        let response = [];

        for (const part of outParts) {
            // boolean
            if (part.thought) {
                thoughts.push(part.text);
            } else {
                response.push(part.text);
            }
        }

        return {
            response: response.join(''),
            thoughts: thoughts.join('')
        };
    } catch (err) {
        console.log('Gemini model error:', err);
        // empty response triggers reroute to another model
        return { response: '', thoughts: '' };
    }
}

async function callCerebrasModel(modelName, userPrompt, env, system_prompt) {
    if (modelName !== 'qwen-3-32b') {
        throw new Error('Unsupported Cerebras model: ' + modelName);
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
        const resp = await fetch('https://api.cerebras.ai/v1/chat/completions', {
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
        console.log('Cerebras model error:', err);
        // empty response triggers reroute to another model
        return '';
    }
}

async function callAnthropicModel(modelName, userPrompt, env, fileArray=[], system_prompt=constructEntitiesPrompt) {
    if (!Object.values(MODELS.ANTHROPIC_MODELS).includes(modelName)) {
        throw new Error('Unsupported Anthropic model: ' + modelName);
    }

    // Prepare the content array
    const content = [
        {
            type: 'text',
            text: userPrompt
        }
    ];

    // Add files as base64 encoded content
    if (fileArray && fileArray.length > 0) {
        for (const file of fileArray) {
            // Files are already base64 encoded from frontend
            const base64Data = file.data;
            const mediaType = file.mimeType || 'application/octet-stream';
            const fileName = file.name;
            // Only add images for now (following the test.sh pattern)
            if (mediaType.startsWith('image/')) {
                content.push({
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: mediaType,
                        data: base64Data
                    }
                });
            } else if (mediaType.startsWith('text/')) {
                try {
                    const textContent = atob(base64Data);
                    content.push({
                        type: 'text',
                        text: `File: ${fileName}\nContent:\n${textContent}`
                    });
                } catch (err) {
                    console.log('Error decoding base64 text file:', err);
                    return SEND({ error: 'Error decoding base64 text file: ' + err }, 475);
                }
            } else if (mediaType.startsWith('application/pdf')) {
                content.push({
                    type: 'document',
                    source: {
                        type: 'base64',
                        media_type: mediaType,
                        data: base64Data
                    }
                });
            } else {
                console.log("Unsupported media type: " + mediaType);
            }
        }
    }

    // Make the API call
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model: modelName,
            max_tokens: 1024,
            system: system_prompt,
            messages: [
                {
                    role: 'user',
                    content: content
                }
            ]
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        return SEND({ error: 'Anthropic API error: ' + errorText }, 475);
    }

    const result = await response.json();
    
    // Handle the response structure: result.content is an array of content objects
    if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        // Find the first text content block
        const textContent = result.content.find(item => item.type === 'text');
        if (textContent && textContent.text) {
            return textContent.text;
        }
    }
    
    return '';
}

async function callGroqModel(modelName, userPrompt, env, fileArray=[], system_prompt) {
    if (modelName === 'qwen/qwen3-32b') {
        if (fileArray && fileArray.length > 0) {
            // add files to prompt
            return SEND({
                error: 'Groq qwen3-32b does not support files.'
            }, 473);
        }
        try {
            const groqRequest = {
                model: modelName,
                messages: [
                    { role: 'system', content: system_prompt },
                    { role: 'user', content: userPrompt },
                ],
                max_tokens: 8192,
                stream: false,
                reasoning_format: 'raw' // includes thoughts in <think> tags in the response
            };

            const groqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${env.GROQ_API_KEY}`,
                },
                body: JSON.stringify(groqRequest),
            });
            const groqResult = await groqResp.json();
            return groqResult.choices?.[0]?.message?.content || '';
        } catch (err) {
            console.log('Groq model error:', err);
            return SEND({ error: 'Groq model error: ' + err }, 475);
        }
    } else if (modelName === 'meta-llama/llama-4-maverick-17b-128e-instruct') {
        // TODO: implement Maverick
        return SEND({
            error: 'Maverick is not implemented yet.'
        }, 474);
    } else {
        return SEND({
            error: 'Unsupported Groq model: ' + modelName
        }, 474);
    }
}

async function callXaiModel(modelName, userPrompt, env, fileArray=[], system_prompt) {
    if (!Object.values(MODELS.XAI_MODELS).includes(modelName)) {
        console.log("Unsupported xAI model: " + modelName);
        return SEND({ error: 'Unsupported xAI model: ' + modelName }, 474);
    }
    
    try {
        const messages = [
            { role: 'system', content: system_prompt },
            { role: 'user', content: userPrompt }
        ];
        
        // Handle files for vision models and text files
        if (fileArray && fileArray.length > 0) {
            // Check if this is a vision model
            if (modelName.includes('vision')) {
                // For vision models, create content array with text and images
                const content = [{ type: 'text', text: userPrompt }];
                
                for (const file of fileArray) {
                    const base64Data = file.data;
                    const mediaType = file.mimeType || 'application/octet-stream';
                    const fileName = file.name;
                    
                    if (mediaType.startsWith('image/')) {
                        content.push({
                            type: 'image_url',
                            image_url: {
                                url: `data:${mediaType};base64,${base64Data}`
                            }
                        });
                    } else if (mediaType.startsWith('text/')) {
                        try {
                            const textContent = atob(base64Data);
                            content[0].text += `\n\nFile: ${fileName}\nContent:\n${textContent}`;
                        } catch (err) {
                            console.log('Error decoding base64 text file:', err);
                            return SEND({ error: 'Error decoding base64 text file: ' + err }, 475);
                        }
                    }
                }
                
                messages[1].content = content;
            } else if (modelName === MODELS.XAI_MODELS.grok4) {
                // For Grok-4, only allow text files
                for (const file of fileArray) {
                    const mediaType = file.mimeType || 'application/octet-stream';
                    if (!mediaType.startsWith('text/')) {
                        console.log("Grok-4 does not support non-text file types.");
                        SEND({ error: 'Grok-4 does not support non-text file types.' }, 475); // Return an error if non-text file is detected
                    }
                    try {
                        const textContent = atob(file.data);
                        messages[1].content += `\n\nFile: ${file.name}\nContent:\n${textContent}`;
                    } catch (err) {
                        console.log('Error decoding base64 text file for Grok-4:', err);
                        return SEND({ error: 'Error decoding base64 text file for Grok-4: ' + err }, 475);
                    }
                }
            } else {
                // For other non-vision models, add text files to the prompt
                let additionalContent = '';
                for (const file of fileArray) {
                    const base64Data = file.data;
                    const mediaType = file.mimeType || 'application/octet-stream';
                    const fileName = file.name;
                    
                    if (mediaType.startsWith('text/')) {
                        try {
                            const textContent = atob(base64Data);
                            additionalContent += `\n\nFile: ${fileName}\nContent:\n${textContent}`;
                        } catch (err) {
                            console.log('Error decoding base64 text file:', err);
                            return SEND({ error: 'Error decoding base64 text file: ' + err }, 475);
                        }
                    }
                }
                if (additionalContent) {
                    messages[1].content += additionalContent;
                }
            }
        }
        
        const requestBody = {
            model: modelName,
            messages: messages,
            max_tokens: 8192,
            temperature: 0.7
        };
        
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.XAI_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.log("xAI API error: " + errorText);
            return ''; // reroute to another model
        }
        
        const result = await response.json();
        console.log("xAI result: ");
        console.log(result);
        return result.choices?.[0]?.message?.content || '';
    } catch (err) {
        console.log('xAI model error:', err);
        return ''; // reroute to another model
    }
}

async function handlePromptOnly(userPrompt, env) {
    console.log("handlePromptOnly called");
    
    let content;
    let chain = [];
    let startTime = 0;

    startTime = Date.now();
    let grokResult = await callXaiModel(MODELS.XAI_MODELS.grok4, userPrompt, env, [], constructEntitiesPrompt);
    if (grokResult && grokResult.trim() !== '') {
        content = grokResult;
        chain.push({ request: {
            model: MODELS.XAI_MODELS.grok4,
            typeOfPrompt: 'convert_text_to_entities',
            response: grokResult,
            startTime,
            endTime: Date.now(),
            userPrompt: userPrompt,
            systemPrompt: constructEntitiesPrompt
        }});
    } else {
        // use Gemini Flash
        let geminiResult = await callGeminiModel(MODELS.GEMINI_MODELS.flash, userPrompt, env, [], constructEntitiesPrompt, true);
        content = geminiResult.response;
        if (content && content.trim() !== '') {
            chain.push({ thinking_request: {
                model: MODELS.GEMINI_MODELS.flash,
                typeOfPrompt: 'convert_text_to_entities',
                response: geminiResult.response,
                thoughts: geminiResult.thoughts,
                startTime,
                endTime: Date.now(),
                userPrompt: userPrompt,
                systemPrompt: constructEntitiesPrompt
            }});
        } else {
            chain.push({ rerouteToModel: { model: MODELS.CEREBRAS_MODELS.qwen3, startTime, endTime: Date.now() }});
            // reroute to Cerebras Qwen3
            startTime = Date.now();
            content = await callCerebrasModel(MODELS.CEREBRAS_MODELS.qwen3, userPrompt, env, constructEntitiesPrompt);
            if (content && content.trim() !== '') {
                chain.push({ thinking_request: {
                    model: MODELS.CEREBRAS_MODELS.qwen3,
                    typeOfPrompt: 'convert_text_to_entities',
                    response: content,
                    startTime,
                    endTime: Date.now(),
                    userPrompt: userPrompt
                }});
            } else {
                chain.push({ rerouteToModel: { model: MODELS.GROQ_MODELS.qwen3, startTime, endTime: Date.now() }});
                // reroute to Groq Qwen3
                startTime = Date.now();
                content = await callGroqModel(MODELS.GROQ_MODELS.qwen3, userPrompt, env, [], constructEntitiesPrompt);
                if (content && content.trim() !== '') {
                    chain.push({ thinking_request: {
                        model: MODELS.GROQ_MODELS.qwen3,
                        typeOfPrompt: 'convert_text_to_entities',
                        response: content,
                        startTime,
                        endTime: Date.now(),
                        userPrompt: userPrompt
                    }});
                } else {
                    return SEND({ error: 'Failed to connect to any AI model.' }, 481);
                }
            }
        }
    }

    console.log("handlePromptOnly return content:");
    console.log(content);
    console.log("handlePromptOnly return chain:");
    console.log(chain);
    return { aiOutput: content, chain };
}

async function handlePromptWithFiles(userPrompt, fileArray, env, strategy, simplifiedEntity=null) {
    let content;
    let chain = [];
    let startTime = 0;

    if (strategy === 'one_shot') {
        // call AI with the files attached and the user's prompt, and go straight to constructing entities
        // no intermediate steps for describing files or constructing entities in parts
        
        // 1st choice – Gemini Flash
        startTime = Date.now();
        let geminiResult = await callGeminiModel(MODELS.GEMINI_MODELS.flash, userPrompt, env, fileArray, constructEntitiesPrompt, true);
        content = geminiResult.response;
        let thoughts = geminiResult.thoughts;

        if (content && content.trim() !== '') {
            chain.push({ thinking_request: {
                model: MODELS.GEMINI_MODELS.flash,
                typeOfPrompt: 'convert_files_to_entities_one_shot',
                response: content,
                thoughts: thoughts,
                startTime,
                endTime: Date.now(),
                userPrompt: userPrompt,
                systemPrompt: constructEntitiesPrompt
            }});
        } else {
            chain.push({ rerouteToModel: { model: MODELS.ANTHROPIC_MODELS.sonnet, startTime, endTime: Date.now() }});
            // 2nd choice – Anthropic Sonnet
            startTime = Date.now();
            content = await callAnthropicModel(MODELS.ANTHROPIC_MODELS.sonnet, userPrompt, env, fileArray, constructEntitiesPrompt);
            if (content && content.trim() !== '') {
                chain.push({ request: {
                    model: MODELS.ANTHROPIC_MODELS.sonnet,
                    typeOfPrompt: 'convert_files_to_entities_one_shot',
                    response: content,
                    startTime,
                    endTime: Date.now(),
                    userPrompt: userPrompt,
                    systemPrompt: constructEntitiesPrompt
                }});
            } else {
                return SEND({ error: 'Failed to connect to any AI model for one-shot entity conversion.' }, 481);
            }
        }
        return { aiOutput: content, chain };
    } else if (strategy === 'single_chain') {
        // STEP 1: Describe files
        startTime = Date.now();
        let geminiResult = await callGeminiModel(MODELS.GEMINI_MODELS.flash, userPrompt, env, fileArray, fileDescriptionPrompt, true);
        let descriptionOfFiles = geminiResult.response;
        let thoughts = geminiResult.thoughts;

        if (descriptionOfFiles && descriptionOfFiles.trim() !== '') {
            chain.push({ thinking_request: {
                model: MODELS.GEMINI_MODELS.flash,
                typeOfPrompt: 'file_description',
                response: descriptionOfFiles,
                thoughts: thoughts,
                startTime,
                endTime: Date.now(),
                userPrompt: userPrompt,
                systemPrompt: fileDescriptionPrompt
            }});
        } else {
            chain.push({ rerouteToModel: { model: MODELS.ANTHROPIC_MODELS.sonnet, startTime, endTime: Date.now() }});
            startTime = Date.now();
            descriptionOfFiles = await callAnthropicModel(MODELS.ANTHROPIC_MODELS.sonnet, userPrompt, env, fileArray, fileDescriptionPrompt);
            if (descriptionOfFiles && descriptionOfFiles.trim() !== '') {
                chain.push({ request: {
                    model: MODELS.ANTHROPIC_MODELS.sonnet,
                    typeOfPrompt: 'file_description',
                    response: descriptionOfFiles,
                    startTime,
                    endTime: Date.now(),
                    userPrompt: userPrompt,
                    systemPrompt: constructEntitiesPrompt
                }});
            } else {
                return SEND({ error: 'Unable to comprehend files.' }, 482);
            }
        }

        // never include the file array beyond this point because we include the description of it instead
        // STEP 2: Convert to JSON
        const newPrompt = createPromptWithFileDescription(userPrompt, descriptionOfFiles);
        console.log("newPrompt: ");
        console.log(newPrompt);
        
        startTime = Date.now();
        content = await callXaiModel(MODELS.XAI_MODELS.grok4, newPrompt, env, [], constructEntitiesPrompt);
        if (content && content.trim() !== '') {
            chain.push({ request: {
                model: MODELS.XAI_MODELS.grok4,
                typeOfPrompt: 'convert_files_to_entities',
                response: content,
                startTime,
                endTime: Date.now(),
                userPrompt: newPrompt,
                systemPrompt: constructEntitiesPrompt
            }});
        } else {
            chain.push({ rerouteToModel: { model: MODELS.CEREBRAS_MODELS.qwen3, startTime, endTime: Date.now() }});
            startTime = Date.now();
            content = await callCerebrasModel(MODELS.CEREBRAS_MODELS.qwen3, newPrompt, env, constructEntitiesPrompt);
            if (content && content.trim() !== '') {
                chain.push({ thinking_request: {
                    model: MODELS.CEREBRAS_MODELS.qwen3,
                    typeOfPrompt: 'convert_files_to_entities',
                    response: content,
                    startTime,
                    endTime: Date.now(),
                    userPrompt: newPrompt
                }});
            } else {
                chain.push({ rerouteToModel: { model: MODELS.GROQ_MODELS.qwen3, startTime, endTime: Date.now() }});
                startTime = Date.now();
                content = await callGroqModel(MODELS.GROQ_MODELS.qwen3, newPrompt, env, [], constructEntitiesPrompt);
                if (content && content.trim() !== '') {
                    chain.push({ thinking_request: {
                        model: MODELS.GROQ_MODELS.qwen3,
                        typeOfPrompt: 'convert_files_to_entities',
                        response: content,
                        startTime,
                        endTime: Date.now(),
                        userPrompt: newPrompt
                    }});
                } else {
                    return SEND({ error: 'Failed to connect to any AI model for entity conversion.' }, 481);
                }
            }
        }
        return { aiOutput: content, chain };
    } else if (strategy === 'step_by_step:1/2') {
        // STEP 1: Describe files
        startTime = Date.now();
        let geminiResult = await callGeminiModel(MODELS.GEMINI_MODELS.flash, userPrompt, env, fileArray, fileDescriptionPrompt, true);
        let descriptionOfFiles = geminiResult.response;
        let thoughts = geminiResult.thoughts;

        if (descriptionOfFiles && descriptionOfFiles.trim() !== '') {
            chain.push({ thinking_request: {
                model: MODELS.GEMINI_MODELS.flash,
                typeOfPrompt: 'file_description',
                response: descriptionOfFiles,
                thoughts: thoughts,
                startTime,
                endTime: Date.now(),
                userPrompt: userPrompt,
                systemPrompt: fileDescriptionPrompt
            }});
        } else {
            chain.push({ rerouteToModel: { model: MODELS.ANTHROPIC_MODELS.sonnet, startTime, endTime: Date.now() }});
            startTime = Date.now();
            descriptionOfFiles = await callAnthropicModel(MODELS.ANTHROPIC_MODELS.sonnet, userPrompt, env, fileArray, fileDescriptionPrompt);
            if (descriptionOfFiles && descriptionOfFiles.trim() !== '') {
                chain.push({ request: {
                    model: MODELS.ANTHROPIC_MODELS.sonnet,
                    typeOfPrompt: 'file_description',
                    response: descriptionOfFiles,
                    startTime,
                    endTime: Date.now(),
                    userPrompt: userPrompt,
                    systemPrompt: fileDescriptionPrompt
                }});
            } else {
                return SEND({ error: 'Unable to comprehend files.' }, 482);
            }
        }

        // STEP 2: Extract simplified entities
        const newPrompt = 'I attached some files to my prompt. Here is the prompt: ' + userPrompt + '. Here is a description of the files: ' + descriptionOfFiles;

        startTime = Date.now();
        content = await callXaiModel(MODELS.XAI_MODELS.grok4, newPrompt, env, [], filesOnlyExtractSimplifiedEntitiesPrompt);

        if (content && content.trim() !== '') {
            chain.push({ request: {
                model: MODELS.XAI_MODELS.grok4,
                typeOfPrompt: 'extract_simplified_entities',
                response: content,
                startTime,
                endTime: Date.now(),
                userPrompt: newPrompt,
                systemPrompt: filesOnlyExtractSimplifiedEntitiesPrompt
            }});
        } else {
            chain.push({ rerouteToModel: { model: MODELS.CEREBRAS_MODELS.qwen3, startTime, endTime: Date.now() }});
            startTime = Date.now();
            content = await callCerebrasModel(MODELS.CEREBRAS_MODELS.qwen3, newPrompt, env, filesOnlyExtractSimplifiedEntitiesPrompt);
            if (content && content.trim() !== '') {
                chain.push({ thinking_request: {
                    model: MODELS.CEREBRAS_MODELS.qwen3,
                    typeOfPrompt: 'extract_simplified_entities',
                    response: content,
                    startTime,
                    endTime: Date.now(),
                    userPrompt: newPrompt
                }});
            } else {
                chain.push({ rerouteToModel: { model: MODELS.GROQ_MODELS.qwen3, startTime, endTime: Date.now() }});
                startTime = Date.now();
                content = await callGroqModel(MODELS.GROQ_MODELS.qwen3, newPrompt, env, [], filesOnlyExtractSimplifiedEntitiesPrompt);
                if (content && content.trim() !== '') {
                    chain.push({ thinking_request: {
                        model: MODELS.GROQ_MODELS.qwen3,
                        typeOfPrompt: 'extract_simplified_entities',
                        response: content,
                        startTime,
                        endTime: Date.now(),
                        userPrompt: newPrompt
                    }});
                } else {
                    return SEND({ error: 'Failed to connect to any AI model for simplified entity extraction.' }, 481);
                }
            }
        }
        // on the front-end, it needs description of files so it can be passed to each request in the next step
        // here content is the simplified entity response
        return { aiOutput: content, chain, descriptionOfFiles };
    } else if (strategy.startsWith('step_by_step:2/2')) {
        // no files are ever passed in this step

        // GIVEN description of files and simplified entity, expand the simplified entity
        if (!simplifiedEntity) {
            return SEND({ error: 'Simplified entity is required for step_by_step:2/2 strategy.' }, 477);
        }
        // simplified entity is of the format { "task": "task name" } or { "event": "event name" } or { "reminder": "reminder name" }
        const entityType = Object.keys(simplifiedEntity)[0];
        const entityName = simplifiedEntity[entityType];
        const mayHaveWorkSession = simplifiedEntity.mayHaveWorkSession;

        if (!entityName || entityName.trim() === '') {
            return SEND({ error: 'Simplified entity name is required for step_by_step:2/2 strategy.' }, 478);
        }

        if (!entityType || entityType.trim() === '') {
            return SEND({ error: 'Simplified entity type is required for step_by_step:2/2 strategy.' }, 479);
        }

        if (entityType !== 'task' && entityType !== 'event' && entityType !== 'reminder') {
            return SEND({ error: 'Invalid entity type for expansion: ' + entityType }, 476);
        }

        if (entityType === 'task' && mayHaveWorkSession === null) {
            return SEND({ error: 'mayHaveWorkSession is required for step_by_step:2/2 strategy running on a task.' }, 480);
        }

        // the userPrompt contains the user's originalprompt, the time and date, and the description of files generated in step 1
        // now we append
        // the userPrompt is the same for all 2/2 requests, but each has a different entity name
        // put the entity name at the end so the long description gets cached
        // Gemini auto-caches prefixes. The desciption is being passed for every entity extracted from this document, possible 20+ times.
        // Putting the unique entity name at the beginning would prevent the prefix from being cached.

        let expansionPrompt;
        if (entityType === 'task') {
            if (mayHaveWorkSession) {
                expansionPrompt = filesOnlyExpandSimplifiedTaskWithWorkSessionsPrompt;
            } else {
                expansionPrompt = filesOnlyExpandSimplifiedTaskPrompt;
            }
        } else if (entityType === 'event') {
            expansionPrompt = filesOnlyExpandSimplifiedEventPrompt;
        } else if (entityType === 'reminder') {
            expansionPrompt = filesOnlyExpandSimplifiedReminderPrompt;
        } else {
            return SEND({ error: 'Invalid entity type for expansion: ' + entityType }, 476);
        }

        startTime = Date.now();
        let geminiResult = await callGeminiModel(MODELS.GEMINI_MODELS.flash, userPrompt, env, [], expansionPrompt, true);
        let content = geminiResult.response;
        let thoughts = geminiResult.thoughts;

        if (content && content.trim() !== '') {
            chain.push({ thinking_request: {
                model: MODELS.GEMINI_MODELS.flash,
                typeOfPrompt: 'expand_simplified_entity',
                response: content,
                thoughts: thoughts,
                startTime,
                endTime: Date.now(),
                userPrompt: userPrompt,
                systemPrompt: expansionPrompt
            }});
        } else {
            chain.push({ rerouteToModel: { model: MODELS.CEREBRAS_MODELS.qwen3, startTime, endTime: Date.now() }});
            startTime = Date.now();
            content = await callCerebrasModel(MODELS.CEREBRAS_MODELS.qwen3, userPrompt, env, expansionPrompt);
            if (content && content.trim() !== '') {
                chain.push({ thinking_request: {
                    model: MODELS.CEREBRAS_MODELS.qwen3,
                    typeOfPrompt: 'expand_simplified_entity',
                    response: content,
                    startTime,
                    endTime: Date.now(),
                    userPrompt: userPrompt
                }});
            } else {
                chain.push({ rerouteToModel: { model: MODELS.GROQ_MODELS.qwen3, startTime, endTime: Date.now() }});
                startTime = Date.now();
                content = await callGroqModel(MODELS.GROQ_MODELS.qwen3, userPrompt, env, [], expansionPrompt);
                if (content && content.trim() !== '') {
                    chain.push({ thinking_request: {
                        model: MODELS.GROQ_MODELS.qwen3,
                        typeOfPrompt: 'expand_simplified_entity',
                        response: content,
                        startTime,
                        endTime: Date.now(),
                        userPrompt: userPrompt
                    }});
                } else {
                    return SEND({ error: 'Failed to connect to any AI model for entity expansion.' }, 481);
                }
            }
        }
        // pass back the entity so the front-end knows which response corresponds to which simplified entity
        return { aiOutput: content, chain, simplifiedEntity };
    } else {
        return SEND({
            error: 'Invalid strategy: ' + strategy
        }, 475);
    }
}

async function checkAndUpdateUsage(authHeader, env, strategy) {
    const token = authHeader.substring(7);
    
    // Check if token is "notSignedIn"
    if (token === 'notSignedIn') {
        return null;
    }

    if (!strategy) {
        return SEND({ error: 'Strategy is required.' }, 485);
    }

    if (strategy === 'step_by_step:2/2') {
        return null;
    }

    // Verify actual token
    const userEmail = await verifyToken(token, env.SECRET_KEY);
    if (!userEmail) {
        return SEND({ error: 'Invalid or expired token.' }, 401);
    }

    // Get user data from database
    const userData = await env.DB.prepare(
        'SELECT user_id, email, plan, payment_times, usage FROM users WHERE email = ?'
    ).bind(userEmail).first();
    
    if (!userData) {
        return SEND({ error: 'User not found.' }, 484);
    }

    const plan = userData.plan;
    const paymentTimes = JSON.parse(userData.payment_times || '{}');
    const usage = userData.usage;

    // Check if user has valid pro access based on payment history
    // This works even if they cancelled but are still within their paid period
    let hasValidProAccess = false;
    
    if (plan === 'godmode') {
        hasValidProAccess = true;
    } else {
        // Check payment history - deduce subscription type from amount
        const now = Date.now();
        
        for (const [paymentTimeStr, amount] of Object.entries(paymentTimes)) {
            const paymentTime = parseInt(paymentTimeStr);
            const daysSincePayment = (now - paymentTime) / (1000 * 60 * 60 * 24);
            
            // Deduce subscription type from payment amount
            if (amount === 2.00 && daysSincePayment <= 31) {
                // Monthly subscription still valid
                hasValidProAccess = true;
                break;
            } else if (amount === 16.00 && daysSincePayment <= 366) {
                // Annual subscription still valid
                hasValidProAccess = true;
                break;
            }
        }
    }
    
    // If no valid pro access, check free plan limits
    if (!hasValidProAccess) {
        if (usage >= FREE_PLAN_USAGE_LIMIT) {
            return SEND({ 
                error: 'Usage limit exceeded for free plan (' + FREE_PLAN_USAGE_LIMIT + ' requests). Please upgrade to continue using the service.',
                usageExceeded: true 
            }, 470);
        }
    }

    // If we get here, usage is allowed. Update usage count.
    await env.DB.prepare(
        'UPDATE users SET usage = usage + 1 WHERE email = ?'
    ).bind(userEmail).run();

    return null; // Success, continue processing
}

async function callAiModel(userPrompt, fileArray, env, strategy, simplifiedEntity=null) {
    try {
        const promptProvided = userPrompt && userPrompt.trim() !== '';
        const filesProvided = Array.isArray(fileArray) && fileArray.length > 0;

        // step 2/2 has the files described in the prompt
        if ((promptProvided && filesProvided) || strategy === 'step_by_step:2/2') {
            return await handlePromptWithFiles(userPrompt, fileArray, env, strategy, simplifiedEntity);
        } else if (promptProvided) {
            return await handlePromptOnly(userPrompt, env);
        } else {
            // files are optional, but the prompt should at least include the date, so it should be non-empty even if the user doesn't provide a prompt
            return SEND({ error: 'No prompt or files provided.' }, 400);
        }
    } catch (err) {
        console.log('callAiModel error:', err);
        return SEND({ error: 'Error in callAiModel: ' + err.message }, 467);
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return SEND(null, 204);
        }

        switch (url.pathname) {
            case '/signup':
                {
                    if (request.method !== 'POST') return SEND({
                        error: 'Method not allowed'
                    }, 405);

                    try {
                        const {
                            email,
                            password
                        } = await request.json();

                        if (!email || !password) {
                            return SEND({
                                error: 'Email and password are required.'
                            }, 400);
                        }
                        if (password.length < 8) {
                            return SEND({
                                error: 'Password must be at least 8 characters long.'
                            }, 400);
                        }

                        const existingUser = await env.DB.prepare('SELECT user_id, email, verified_email, data FROM users WHERE email = ?').bind(email).first();
                        if (existingUser && existingUser.verified_email) {
                            return SEND({
                                error: 'User with this email already exists.'
                            }, 409);
                        }

                        const salt = crypto.randomUUID().replaceAll('-', '');
                        const password_hash = await hash(password, salt);
                        const verification_code = Math.floor(100000 + Math.random() * 900000).toString();
                        const verification_code_expires_at = Date.now() + (10 * 60 * 1000); // 10 minutes

                        let user_id;

                        if (existingUser) { // User exists but is not verified
                            // Use the existing user_id
                            user_id = existingUser.user_id;
                            
                            const userData = JSON.parse(existingUser.data || '{}');
                            userData.verification_code = verification_code;
                            userData.verification_code_expires_at = verification_code_expires_at;
                            await env.DB.prepare(
                                `UPDATE users SET password_hash = ?, salt = ?, data = ? WHERE email = ?`
                            ).bind(password_hash, salt, JSON.stringify(userData), email).run();
                        } else {
                            user_id = crypto.randomUUID().replaceAll('-', '');
                            user_id = user_id.slice(0, 8);
                            const userData = {
                                verification_code,
                                verification_code_expires_at
                            };
                            await env.DB.prepare(
                                `INSERT INTO users (user_id, email, verified_email, data, dataspec, usage, timestamp, plan, payment_times, login_attempts, provider, password_hash, salt)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                            ).bind(
                                user_id,
                                email,
                                false, // verified_email
                                JSON.stringify(userData), // data
                                1, // dataspec
                                0, // usage
                                Date.now(), // timestamp
                                'free', // plan
                                '{}', // payment_times
                                '[]', // login_attempts
                                'email', // provider
                                password_hash,
                                salt
                            ).run();
                        }

                        const emailContent = `Your verification code is: ${verification_code}`;
                        await sendEmail(env.SENDGRID_API_KEY, email, 'Verify your email for Scribblit', emailContent);

                        return SEND({
                            message: 'Verification code sent to your email.',
                            id: user_id
                        });

                    } catch (err) {
                        console.log('Signup error:', err);
                        return SEND({
                            error: 'Failed to process signup request.'
                        }, 500);
                    }
                }

            case '/verify-email':
                {
                    if (request.method !== 'POST') return SEND({
                        error: 'Method not allowed'
                    }, 405);
                    try {
                        const {
                            email,
                            code
                        } = await request.json();
                        if (!email || !code) {
                            return SEND({
                                error: 'Email and verification code are required.'
                            }, 400);
                        }

                        const user = await env.DB.prepare('SELECT user_id, data, verified_email FROM users WHERE email = ?').bind(email).first();

                        if (!user) {
                            return SEND({
                                error: 'User not found.'
                            }, 404);
                        }

                        if (user.verified_email) {
                            return SEND({
                                error: 'Email is already verified.'
                            }, 400);
                        }

                        const userData = JSON.parse(user.data);

                        if (!userData.verification_code_expires_at || Date.now() > userData.verification_code_expires_at) {
                            return SEND({
                                error: 'Verification code has expired.'
                            }, 400);
                        }

                        if (userData.verification_code !== code) {
                            return SEND({
                                error: 'Invalid verification code.'
                            }, 400);
                        }

                        delete userData.verification_code;
                        delete userData.verification_code_expires_at;

                        await env.DB.prepare(
                            'UPDATE users SET verified_email = ?, data = ? WHERE email = ?'
                        ).bind(true, "{}", email).run();
    
                        const token = await generateToken(email, env.SECRET_KEY);
                        return SEND({
                            token,
                            id: user.user_id
                        });

                    } catch (err) {
                        console.log('Email verification error:', err);
                        return SEND({
                            error: 'Failed to process email verification.'
                        }, 500);
                    }
                }

            case '/login':
                {
                    if (request.method !== 'POST') return SEND({
                        error: 'Method not allowed'
                    }, 405);

                    try {
                        const {
                            email,
                            password
                        } = await request.json();
                        if (!email || !password) {
                            return SEND({
                                error: 'Email and password are required.'
                            }, 400);
                        }

                        const user = await env.DB.prepare('SELECT user_id, password_hash, salt, verified_email FROM users WHERE email = ?').bind(email).first();
                        if (!user) {
                            return SEND({
                                error: 'Invalid credentials.'
                            }, 401);
                        }

                        if (!user.verified_email) {
                            return SEND({
                                error: 'Please verify your email before logging in.'
                            }, 401);
                        }

                        const hashedPassword = await hash(password, user.salt);
                        if (user.password_hash !== hashedPassword) {
                            return SEND({
                                error: 'Invalid credentials.'
                            }, 401);
                        }

                        const token = await generateToken(email, env.SECRET_KEY);
                        return SEND({
                            token,
                            id: user.user_id
                        });

                    } catch (err) {
                        console.log('Login error:', err);
                        return SEND({
                            error: 'Failed to process login request.'
                        }, 500);
                    }
                }

            case '/get-user':
                {
                    if (request.method !== 'GET') return SEND({
                        error: 'Method Not Allowed'
                    }, 405);

                    try {
                        const authHeader = request.headers.get('Authorization');
                        if (!authHeader || !authHeader.startsWith('Bearer ')) {
                            return SEND({
                                error: 'Authorization header is missing or invalid.'
                            }, 401);
                        }

                        const token = authHeader.substring(7); // Remove 'Bearer '
                        const email = await verifyToken(token, env.SECRET_KEY);

                        if (!email) {
                            return SEND({
                                error: 'Invalid or expired token.'
                            }, 401);
                        }

                        const userResult = await env.DB.prepare(
                            'SELECT user_id, email, data, dataspec, usage, timestamp, plan, payment_times FROM users WHERE email = ?'
                        ).bind(email).first();

                        if (!userResult) {
                            return SEND({
                                error: 'User not found.'
                            }, 404);
                        }

                        const userJson = {
                            _type: 'User',
                            userId: userResult.user_id,
                            email: userResult.email,
                            data: userResult.data, // This is a stringified JSON
                            dataspec: userResult.dataspec,
                            usage: userResult.usage,
                            timestamp: userResult.timestamp,
                            plan: userResult.plan,
                            paymentTimes: JSON.parse(userResult.payment_times),
                        };

                        const newToken = await generateToken(email, env.SECRET_KEY);

                        return SEND({
                            user: userJson,
                            token: newToken
                        });

                    } catch (err) {
                        console.log('Get user error:', err);
                        return SEND({
                            error: 'Failed to get user data.'
                        }, 500);
                    }
                }

            case '/update-user':
                {
                    if (request.method !== 'POST') return SEND({ error: 'Method Not Allowed' }, 405);

                    try {
                        const authHeader = request.headers.get('Authorization');
                        if (!authHeader || !authHeader.startsWith('Bearer ')) {
                            return SEND({ error: 'Authorization header is missing or invalid.' }, 401);
                        }
                        const token = authHeader.substring(7);
                        const email = await verifyToken(token, env.SECRET_KEY);
                        if (!email) {
                            return SEND({ error: 'Invalid or expired token.' }, 401);
                        }

                        const {
                            data,
                            dataspec,
                            timestamp,
                            alarmTable,
                        } = await request.json();

                        if (typeof data !== 'string' || typeof dataspec !== 'number' || typeof timestamp !== 'number') {
                            return SEND({ error: 'Invalid user data.' }, 400);
                        }

                        await env.DB.prepare(
                            `UPDATE users SET data = ?, dataspec = ?, timestamp = ? WHERE email = ?`
                        ).bind(
                            data,
                            dataspec,
                            timestamp,
                            email
                        ).run();

                        // Update Durable Object alarms if alarmTable provided
                        if (alarmTable && Array.isArray(alarmTable)) {
                            try {
                                // Get Durable Object for this user (using email as unique identifier)
                                const durableObjectId = env.ALARM_MANAGER.idFromName(email);
                                const durableObject = env.ALARM_MANAGER.get(durableObjectId);
                                
                                // Update alarms in the Durable Object
                                const response = await durableObject.fetch(new Request('https://dummy.com/update-alarms', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        alarmTable: alarmTable,
                                        email: email
                                    })
                                }));
                                
                                if (!response.ok) {
                                    const errorData = await response.json();
                                    console.error(`Failed to update alarms for user ${email}:`, errorData);
                                    return SEND({ error: 'Failed to update alarms.' }, 479);
                                }
                                
                                console.log(`Successfully updated ${alarmTable.length} alarms for user: ${email}`);
                                
                            } catch (error) {
                                console.error(`Error updating alarms for user ${email}:`, error);
                                return SEND({ error: 'Failed to update alarms.' }, 479);
                            }
                        } else {
                            console.log(`No alarm table provided for user: ${email}`);
                        }

                        return SEND({ success: true });
                    } catch (err) {
                        console.log('Update user error:', err);
                        return SEND({ error: 'Failed to update user data.' }, 500);
                    }
                }

            case '/send-email':
                if (request.method !== 'POST') {
                    return SEND({
                        error: 'Method Not Allowed'
                    }, 405);
                }
                try {
                    const {
                        to,
                        subject,
                        content
                    } = await request.json();
                    await sendEmail(env.SENDGRID_API_KEY, to, subject, content);
                    return SEND('Email sent', 200);
                } catch (err) {
                    return SEND(err.message || err.toString(), 500);
                }

            case '/auth/google':
                {
                    if (request.method !== 'GET') {
                        return SEND({ error: 'Method not allowed' }, 405);
                    }
                    
                    const state = crypto.randomUUID();
                    const googleAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
                        `response_type=code&` +
                        `client_id=${env.GOOGLE_CLIENT_ID}&` +
                        `redirect_uri=${encodeURIComponent('https://' + SERVER_DOMAIN + '/auth/google/callback')}&` +
                        `scope=${encodeURIComponent('openid email')}&` +
                        `state=${state}`;
                    
                    return Response.redirect(googleAuthUrl, 302);
                }

            case '/auth/google/callback':
                {
                    if (request.method !== 'GET') {
                        return SEND({ error: 'Method not allowed' }, 405);
                    }
                    
                    try {
                        const { searchParams } = new URL(request.url);
                        const code = searchParams.get('code');
                        const error = searchParams.get('error');
                        
                        if (error) {
                            return Response.redirect(`https://${PAGES_DOMAIN}/?error=oauth_error`, 302);
                        }
                        
                        if (!code) {
                            return Response.redirect(`https://${PAGES_DOMAIN}/?error=no_code`, 302);
                        }
                        
                        // Exchange code for access token
                        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                            },
                            body: new URLSearchParams({
                                code,
                                client_id: env.GOOGLE_CLIENT_ID,
                                client_secret: env.GOOGLE_CLIENT_SECRET,
                                redirect_uri: 'https://' + SERVER_DOMAIN + '/auth/google/callback',
                                grant_type: 'authorization_code',
                            }),
                        });
                        
                        const tokenData = await tokenResponse.json();
                        
                        if (!tokenData.access_token) {
                            return Response.redirect(`https://${PAGES_DOMAIN}/?error=token_error`, 302);
                        }
                        
                        // Get user info from Google
                        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                            headers: {
                                'Authorization': `Bearer ${tokenData.access_token}`,
                            },
                        });
                        
                        const googleUser = await userResponse.json();
                        
                        if (!googleUser.email) {
                            return Response.redirect(`https://${PAGES_DOMAIN}/?error=no_email`, 302);
                        }
                        
                        // Check if user exists
                        let user = await env.DB.prepare('SELECT user_id, email, verified_email, data FROM users WHERE email = ?')
                            .bind(googleUser.email).first();
                        
                        let user_id;
                        
                        if (user) {
                            // Update existing user to use Google OAuth
                            user_id = user.user_id;
                            await env.DB.prepare(
                                'UPDATE users SET provider = ?, provider_id = ?, verified_email = ? WHERE email = ?'
                            ).bind('google', googleUser.id, true, googleUser.email).run();
                        } else {
                            // Create new user
                            user_id = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
                            await env.DB.prepare(
                                `INSERT INTO users (user_id, email, verified_email, data, dataspec, usage, timestamp, plan, payment_times, login_attempts, provider, provider_id)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                            ).bind(
                                user_id,
                                googleUser.email,
                                true, // verified_email
                                '{}', // data
                                1, // dataspec
                                0, // usage
                                Date.now(), // timestamp
                                'free', // plan
                                '{}', // payment_times
                                '[]', // login_attempts
                                'google', // provider
                                googleUser.id // provider_id
                            ).run();
                        }
                        
                        // token for frontend
                        const token = await generateToken(googleUser.email, env.SECRET_KEY);
                        
                        // Redirect to frontend with token
                        return Response.redirect(`https://${PAGES_DOMAIN}/?token=${token}&id=${user_id}`, 302);
                        
                    } catch (err) {
                        console.log('Google OAuth callback error:', err);
                        return Response.redirect(`https://${PAGES_DOMAIN}/?error=callback_error`, 302);
                    }
                }

            case '/ai/parse':
                {
                    if (request.method !== 'POST') return SEND({ error: 'Method Not Allowed' }, 405);
                    try {
                        const data = await request.json();
                        const userText = data.prompt;
                        const fileArray = data.fileArray;
                        const strategy = data.strategy;
                        const simplifiedEntity = data.simplifiedEntity;

                        if ((!userText || userText.trim().length === 0) && (!fileArray || fileArray.length === 0)) {
                            return SEND({ error: 'Empty request body' }, 471);
                        }

                        // Check usage limits and update usage if allowed
                        const authHeader = request.headers.get('Authorization');
                        const usageCheck = await checkAndUpdateUsage(authHeader, env, strategy);
                        
                        // If usageCheck returns a response, it means there was an error
                        if (usageCheck) {
                            return usageCheck;
                        }

                        // Process the AI request
                        const result = await callAiModel(userText, fileArray, env, strategy, simplifiedEntity);
                        console.log('result: ' + JSON.stringify(result));
                        return SEND(result, 200);
                    } catch (err) {
                        console.log('AI parse error:', err);
                        return SEND({ error: 'Failed to process AI request: ' + err.message }, 563);
                    }
                }

            case '/ai/draft':
                {
                    if (request.method !== 'POST') return SEND({ error: 'Method Not Allowed' }, 405);
                    try {
                        const data = await request.json();
                        const userPrompt = data.prompt;

                        if (!userPrompt || userPrompt.trim().length === 0) {
                            return SEND({ error: 'Empty prompt' }, 471);
                        }

                        const result = await draftEntities(userPrompt, env);
                        console.log('draft result: ' + JSON.stringify(result));
                        return SEND(result, 200);
                    } catch (err) {
                        console.log('AI draft error:', err);
                        return SEND({ error: 'Failed to process draft request: ' + err.message }, 563);
                    }
                }

            case '/ai/title-format':
                {
                    if (request.method !== 'POST') return SEND({ error: 'Method Not Allowed' }, 405);
                    try {
                        const data = await request.json();
                        const titlesObject = data.titles;
                        const descriptionOfFiles = data.descriptionOfFiles;
                        const fileArray = data.fileArray;

                        if (!titlesObject || typeof titlesObject !== 'object') {
                            return SEND({ error: 'Invalid request: titles object required' }, 400);
                        }

                        const result = await formatTitles(titlesObject, descriptionOfFiles, fileArray, env);
                        
                        return SEND(result, 200);
                    } catch (err) {
                        console.error('Title format error:', err);
                        return SEND({ error: 'Failed to format titles: ' + err.message }, 500);
                    }
                }

            default:
                return SEND({
                    error: 'Endpoint not found'
                }, 404);
        }
    }
};

async function sendEmail(apiKey, to, subject, content) {
    const msg = {
        personalizations: [{
            to: [{
                email: to
            }]
        }],
        from: {
            email: 'hello@scribbl.it'
        },
        subject: subject,
        content: [{
            type: 'text/plain',
            value: content
        }]
    };

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(msg)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SendGrid API error: ${errorText}`);
    }
}

// Export the Durable Object class for Cloudflare Workers
export { AlarmManager };