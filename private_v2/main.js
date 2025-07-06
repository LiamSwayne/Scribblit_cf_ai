const SERVER_DOMAIN_OLD = 'scribblit-production.unrono.workers.dev';
const SERVER_DOMAIN = 'app.scribbl.it';
const OLD_PAGES_DOMAIN = 'scribblit2.pages.dev';
const PAGES_DOMAIN = 'scribbl.it';

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

const systemPrompt = `You are an AI that takes in user input and converts it to tasks, events, and reminders JSON. If something has to be done *by* a certain date/time but can be done before then, it is a task. If something has to be done at a specific date/time and cannot be done before then, it is an event. It is possible for an event to have only a start time if the end time is unknown. A reminder is a special case of something insignificant to be reminded of at a specific time and date. Only include OPTIONAL fields if the user specified the information needed for that field.

Task JSON:
{
    "type": "task"
    "name": // use sentence case  
    "instances": [ // 2 options
	    {
		    "type": "due_date_instance"
		    "date": "YYYY-MM-DD" // OPTIONAL. if a time a is given then assume the due date is today
		    "time": "HH:MM"// OPTIONAL. if it's due today and the current time is past noon assume numbers below 12 are pm.
	    }
	    {
		    "type": "due_date_pattern"
		    "pattern": // 4 options
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
					"type": "nth_weekday_of_months_pattern"
					"day_of_week": // integer 1-7
					"weeks_of_month": // "last" for last appearance of that weekday in the month. or an array of 4 booleans where each boolean represents if the pattern triggers on that week of the month. "2nd and 3rd friday of each month" would be [false, true, true, false].
					"months": // array of 12 booleans for if the pattern is enabled for that month.
				}
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
			"start_date_pattern": // object with type every_n_days_pattern, monthly_pattern, annually_pattern, or nth_weekday_of_months_pattern 
			"start_time": "HH:MM" // OPTIONAL
			"end_time": "HH:MM" // OPTIONAL
			"different_end_date_offset": // OPTIONAL, integer for how many days each occurrence of the event ends after it starts. only include if the event ends on a different day than it starts. can only be included if end_time is also given
			"range": // "YYYY-MM-DD:YYYY-MM-DD" or integer number of times
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
			"date": // object with type every_n_days_pattern, monthly_pattern, annually_pattern, or nth_weekday_of_months_pattern 
		    "time": "HH:MM"
		}
	]
}

Don't forget to have commas in the JSON. You will return nothing but an array of objects of type task, event, or reminder. Don't include useless stuff in the name, like "!!!" or "due"`

let fileDescriptionPrompt = `You are an AI that takes in files and describes them with as much detail as possible. Do not include your thoughts, only the description. Use as much detail as possible, especially regarding dates and times. If the file contains text, extract 100% of the text. A different AI handles the user's prompt, but it may be helpful context for you. Your job is not to handle the user's request, only to describe the files.`;

let titleFormatterPrompt = `You are an AI that takes in a title of tasks, events, and reminders, and formats them to be more readable. Each title should be in sentence case. Remove unhelpful words like "!!!" or "due" that don't add to the meaning of the title. Many titles are already correct and don't need to be changed. Do not include your thoughts, only the formatted titles in a JSON array.`;

function createPromptWithFileDescription(userPrompt, descriptionOfFiles) {
    return `The user provided some files as context for their prompt. Here is a description of the files:
${descriptionOfFiles}

User prompt:
${userPrompt}`;
}

async function callGeminiModel(modelName, userPrompt, env, fileArray=[], system_prompt=systemPrompt, reasoning) {
    console.log("Calling Gemini model");
    console.log(userPrompt);
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
                        console.error('Error decoding base64 text file:', err);
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
                    thinking_budget: -1 // let the model decide how long to think for
                }
            }
        } else {
            body.generation_config = {
                thinking_budget: 0 // no thinking
            }
        }

        const genRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        console.log("Gemini response: ");
        const genJson = await genRes.json();
        console.log(genJson);
        const outParts = genJson?.candidates?.[0]?.content?.parts || [];
        return outParts.map(p => p.text || '').join('');
    } catch (err) {
        console.error('Gemini model error:', err);
        return '';
    }
}

async function callCerebrasModel(modelName, userPrompt, env) {
    console.log("Calling Cerebras model");
    if (modelName !== 'qwen-3-32b') {
        throw new Error('Unsupported Cerebras model: ' + modelName);
    }
    try {
        const cerebrasRequest = {
            model: modelName,
            messages: [
                { role: 'system', content: systemPrompt },
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
        console.error('Cerebras model error:', err);
        return '';
    }
}

async function callAnthropicModel(modelName, userPrompt, env, fileArray=[], system_prompt=systemPrompt) {
    if (!Object.values(ANTHROPIC_MODELS).includes(modelName)) {
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
                    console.error('Error decoding base64 text file:', err);
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
        console.log("Anthropic API error: " + errorText);
        return SEND({
            error: 'Failed to call Anthropic model: ' + response.statusText
        }, 471);
    }

    const result = await response.json();
    console.log("Anthropic result: ");
    console.log(result.content[0].text);
    
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

async function callGroqModel(modelName, userPrompt, env, fileArray=[]) {
    console.log("Calling Groq model");
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
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                max_tokens: 8192,
                stream: false,
                reasoing_format: 'hidden' // we don't want to see the model thinking
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
            console.error('Groq model error:', err);
            return '';
        }
    } else if (modelName === 'meta-llama/llama-4-maverick-17b-128e-instruct') {

    } else {
        return SEND({
            error: 'Unsupported Groq model: ' + modelName
        }, 474);
    }
}

async function callAiModel(userPrompt, fileArray, env) {
    try {
        let content;
        // chain is the whole reasoning process
        // each object has either:
        //   model, type of prompt, response, and reasoning boolean
        //   or
        //   reroute_to_model (we failed to connect, so this is the next model to try)
        //   or
        //   user_prompt (the user's prompt)
        //   or
        //   user_attachments
        // we want to include reroutes in the chain
        let chain = [];

        // user prompt and file array are added to the chain on the frontend

        if (Array.isArray(fileArray) && fileArray.length > 0) {
            let descriptionOfFiles;
            // STEP 1: get description of files
            // 1st choice - gemini flash
            descriptionOfFiles = await callGeminiModel(MODELS.GEMINI_MODELS.flash, userPrompt, env, fileArray, fileDescriptionPrompt, false);

            if (descriptionOfFiles && descriptionOfFiles.trim() !== '') {
                chain.push({
                    model: MODELS.GEMINI_MODELS.flash,
                    type_of_prompt: 'file_description',
                    response: descriptionOfFiles,
                    reasoning: false
                });
            } else {
                chain.push({
                    reroute_to_model: MODELS.ANTHROPIC_MODELS.sonnet
                });
                // 2nd choice - claude sonnet
                // Use Anthropic Claude for files (vision support)
                descriptionOfFiles = await callAnthropicModel(MODELS.ANTHROPIC_MODELS.sonnet, userPrompt, env, fileArray, fileDescriptionPrompt);

                if (descriptionOfFiles && descriptionOfFiles.trim() !== '') {
                    chain.push({
                        model: MODELS.ANTHROPIC_MODELS.sonnet,
                        type_of_prompt: 'file_description',
                        response: descriptionOfFiles,
                        reasoning: false
                    });
                } else {
                    // unable to comprehend files
                    return SEND({
                        error: 'Unable to comprehend files.'
                    }, 475);
                }
            }

            // STEP 2: parse json including file descriptions context
            let newPrompt;
            if (userPrompt.trim() === '') {
                // no user prompt, so just use the files to generate a new prompt
                newPrompt = "I attached some files to my prompt. Here is a description of the files: " + descriptionOfFiles;
            } else {
                newPrompt = createPromptWithFileDescription(userPrompt, descriptionOfFiles);
            }

            // use Gemini Flash Reasoning because file tasks are generally the hardest kind of requests
            content = await callGeminiModel(MODELS.GEMINI_MODELS.flash, newPrompt, env, fileArray, systemPrompt, true);

            if (content && content.trim() !== '') {
                chain.push({
                    model: MODELS.GEMINI_MODELS.flash,
                    type_of_prompt: 'convert_files_to_entities',
                    response: content,
                    reasoning: true
                });
            } else {
                chain.push({
                    reroute_to_model: MODELS.CEREBRAS_MODELS.qwen3
                });
                // 2nd choice - Cerebras
                content = await callCerebrasModel(MODELS.CEREBRAS_MODELS.qwen3, newPrompt, env);
                if (content && content.trim() !== '') {
                    chain.push({
                        model: MODELS.CEREBRAS_MODELS.qwen3,
                        type_of_prompt: 'convert_files_to_entities',
                        response: content,
                        reasoning: false
                    });
                } else {
                    chain.push({
                        reroute_to_model: MODELS.GROQ_MODELS.qwen3
                    });
                    // 3rd choice - Groq
                    content = await callGroqModel(MODELS.GROQ_MODELS.qwen3, newPrompt, env);
                    if (content && content.trim() !== '') {
                        chain.push({
                            model: MODELS.GROQ_MODELS.qwen3,
                            type_of_prompt: 'convert_files_to_entities',
                            response: content,
                            reasoning: false
                        });
                    } else {
                        return SEND({
                            error: 'Failed to connect to any AI model.'
                        }, 467);
                    }
                }
            }
        } else {
            // Use Qwen for text-only requests

            // 1st choice - Cerebras
            content = await callCerebrasModel('qwen-3-32b', userPrompt, env);
            if (content && content.trim() !== '') {
                chain.push({
                    model: MODELS.CEREBRAS_MODELS.qwen3,
                    type_of_prompt: 'convert_text_to_entities',
                    response: content,
                    reasoning: false
                });
            } else {
                chain.push({
                    reroute_to_model: MODELS.GROQ_MODELS.qwen3
                });
                // 2nd choice - Groq
                content = await callGroqModel('qwen/qwen3-32b', userPrompt, env);
                if (content && content.trim() !== '') {
                    chain.push({
                        model: MODELS.GROQ_MODELS.qwen3,
                        type_of_prompt: 'convert_text_to_entities',
                        response: content,
                        reasoning: false
                    });
                } else {
                    chain.push({
                        reroute_to_model: MODELS.GEMINI_MODELS.flash
                    });
                    // 3rd choice - Gemini
                    content = await callGeminiModel(MODELS.GEMINI_MODELS.flash, userPrompt, env, fileArray, systemPrompt, false);
                    if (content && content.trim() !== '') {
                        chain.push({
                            model: MODELS.GEMINI_MODELS.flash,
                            type_of_prompt: 'convert_text_to_entities',
                            response: content,
                            reasoning: false
                        });
                    } else {
                        return SEND({
                            error: 'Failed to connect to any AI model.'
                        }, 467);
                    }
                }
            }
        }

        return {
            aiOutput: content,
            chain: chain
        };
    } catch (err) {
        console.error('callAiModel error:', err);
        return SEND({
            error: 'Error in callAiModel: ' + err.message
        }, 467);
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
                                '[]', // payment_times
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
                        console.error('Signup error:', err);
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
                        console.error('Email verification error:', err);
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
                        console.error('Login error:', err);
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
                        console.error('Get user error:', err);
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

                        return SEND({ success: true });
                    } catch (err) {
                        console.error('Update user error:', err);
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
                                '[]', // payment_times
                                '[]', // login_attempts
                                'google', // provider
                                googleUser.id // provider_id
                            ).run();
                        }
                        
                        // Generate JWT token
                        const token = await generateToken(googleUser.email, env.SECRET_KEY);
                        
                        // Redirect to frontend with token
                        return Response.redirect(`https://${PAGES_DOMAIN}/?token=${token}&id=${user_id}`, 302);
                        
                    } catch (err) {
                        console.error('Google OAuth callback error:', err);
                        return Response.redirect(`https://${PAGES_DOMAIN}/?error=callback_error`, 302);
                    }
                }

            case '/test-email-integration':
                if (request.method !== 'GET') {
                    return SEND({
                        error: 'Method Not Allowed'
                    }, 405);
                }
                try {
                    await sendEmail(
                        env.SENDGRID_API_KEY,
                        'liamtswayne@gmail.com',
                        'Test Integration',
                        'This is a test email from your Cloudflare Worker. If you see this, the SendGrid integration is working.'
                    );
                    return SEND('Test email sent', 200);
                } catch (err) {
                    return SEND(err.message || err.toString(), 500);
                }

            case '/ai/parse':
                {
                    if (request.method !== 'POST') return SEND({ error: 'Method Not Allowed' }, 405);
                    try {
                        const data = await request.json();
                        const userText = data.prompt;
                        const fileArray = data.fileArray;

                        if (userText == null || userText.length === 0) {
                            return SEND({ error: 'Empty request body' }, 400);
                        }

                        const { aiOutput, chain } = await callAiModel(userText, fileArray, env);
                        console.log("AI output: " + aiOutput);
                        return SEND({
                            aiOutput: aiOutput,
                            chain: chain
                        }, 200);
                    } catch (err) {
                        console.error('AI parse error:', err);
                        return SEND({ error: 'Failed to process AI request: ' + err.message }, 563);
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