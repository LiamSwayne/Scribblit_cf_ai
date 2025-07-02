const SERVER_URL = 'https://scribblit-production.unrono.workers.dev/';
const PAGES_DOMAIN = 'scribblit2.pages.dev';

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

                        const existingUser = await env.DB.prepare('SELECT email FROM users WHERE email = ?').bind(email).first();
                        if (existingUser) {
                            return SEND({
                                error: 'User with this email already exists.'
                            }, 409);
                        }

                        const salt = crypto.randomUUID().replaceAll('-', '');
                        const password_hash = await hash(password, salt);
                        const user_id = crypto.randomUUID().replaceAll('-', '');

                        await env.DB.prepare(
                            `INSERT INTO users (user_id, email, verified_email, data, dataspec, usage, timestamp, plan, payment_times, login_attempts, provider, password_hash, salt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                        ).bind(
                            user_id,
                            email,
                            false, // verified_email
                            '{}', // data
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

                        const token = await generateToken(email, env.SECRET_KEY);
                        return SEND({
                            token
                        }, 201);

                    } catch (err) {
                        console.error('Signup error:', err);
                        return SEND({
                            error: 'Failed to process signup request.'
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

                        const user = await env.DB.prepare('SELECT password_hash, salt FROM users WHERE email = ?').bind(email).first();
                        if (!user) {
                            return SEND({
                                error: 'Invalid credentials.'
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
                            token
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
                            paymentTimes: JSON.parse(userResult.payment_times || '[]'),
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
                            usage,
                            timestamp,
                            plan,
                            paymentTimes
                        } = await request.json();

                        if (typeof data !== 'string' || typeof dataspec !== 'number' || typeof usage !== 'number' ||
                            typeof timestamp !== 'number' || typeof plan !== 'string' || !Array.isArray(paymentTimes)) {
                            return SEND({ error: 'Invalid user data.' }, 400);
                        }

                        await env.DB.prepare(
                            `UPDATE users SET data = ?, dataspec = ?, usage = ?, timestamp = ?, plan = ?, payment_times = ? WHERE email = ?`
                        ).bind(
                            data,
                            dataspec,
                            usage,
                            timestamp,
                            plan,
                            JSON.stringify(paymentTimes),
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