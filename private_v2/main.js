const SERVER_DOMAIN_ROOT = 'scribblit-production.unrono.workers.dev';
const SERVER_DOMAIN = 'app.scribbl.it';
const PAGES_DOMAIN = 'scribblit2.pages.dev';

function SEND(request, data = null, status = 200, extraHeaders = {}) {
    // Grab whatever Origin the browser sent
    const origin = request.headers.get("Origin");
    // If you really want to lock it down, test origin against a whitelist here.
    // Otherwise, just echo it (or fall back to "*")
    const allowOrigin = origin || "*";
  
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Vary": "Origin",  // very important for caching proxies
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      // if you ever send cookies or auth headers back, you'll need:
      // "Access-Control-Allow-Credentials": "true",
    };
  
    let body = data;
    const headers = { ...corsHeaders, ...extraHeaders };
    if (data !== null && typeof data === "object") {
      body = JSON.stringify(data);
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }
  
    return new Response(body, { status, headers });
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
            return SEND(request, null, 204);
        }

        switch (url.pathname) {
            case '/signup':
                {
                    if (request.method !== 'POST') return SEND(request, {
                        error: 'Method not allowed'
                    }, 405);

                    try {
                        const {
                            email,
                            password
                        } = await request.json();

                        if (!email || !password) {
                            return SEND(request, {
                                error: 'Email and password are required.'
                            }, 400);
                        }
                        if (password.length < 8) {
                            return SEND(request, {
                                error: 'Password must be at least 8 characters long.'
                            }, 400);
                        }

                        const existingUser = await env.DB.prepare('SELECT user_id, email, verified_email, data FROM users WHERE email = ?').bind(email).first();
                        if (existingUser && existingUser.verified_email) {
                            return SEND(request, {
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

                        return SEND(request, {
                            message: 'Verification code sent to your email.',
                            id: user_id
                        });

                    } catch (err) {
                        console.error('Signup error:', err);
                        return SEND(request, {
                            error: 'Failed to process signup request.'
                        }, 500);
                    }
                }

            case '/verify-email':
                {
                    if (request.method !== 'POST') return SEND(request, {
                        error: 'Method not allowed'
                    }, 405);
                    try {
                        const {
                            email,
                            code
                        } = await request.json();
                        if (!email || !code) {
                            return SEND(request, {
                                error: 'Email and verification code are required.'
                            }, 400);
                        }

                        const user = await env.DB.prepare('SELECT user_id, data, verified_email FROM users WHERE email = ?').bind(email).first();

                        if (!user) {
                            return SEND(request, {
                                error: 'User not found.'
                            }, 404);
                        }

                        if (user.verified_email) {
                            return SEND(request, {
                                error: 'Email is already verified.'
                            }, 400);
                        }

                        const userData = JSON.parse(user.data);

                        if (!userData.verification_code_expires_at || Date.now() > userData.verification_code_expires_at) {
                            return SEND(request, {
                                error: 'Verification code has expired.'
                            }, 400);
                        }

                        if (userData.verification_code !== code) {
                            return SEND(request, {
                                error: 'Invalid verification code.'
                            }, 400);
                        }

                        delete userData.verification_code;
                        delete userData.verification_code_expires_at;

                        await env.DB.prepare(
                            'UPDATE users SET verified_email = ?, data = ? WHERE email = ?'
                        ).bind(true, "{}", email).run();
    
                        const token = await generateToken(email, env.SECRET_KEY);
                        return SEND(request, {
                            token,
                            id: user.user_id
                        });

                    } catch (err) {
                        console.error('Email verification error:', err);
                        return SEND(request, {
                            error: 'Failed to process email verification.'
                        }, 500);
                    }
                }

            case '/login':
                {
                    if (request.method !== 'POST') return SEND(request, {
                        error: 'Method not allowed'
                    }, 405);

                    try {
                        const {
                            email,
                            password
                        } = await request.json();
                        if (!email || !password) {
                            return SEND(request, {
                                error: 'Email and password are required.'
                            }, 400);
                        }

                        const user = await env.DB.prepare('SELECT user_id, password_hash, salt, verified_email FROM users WHERE email = ?').bind(email).first();
                        if (!user) {
                            return SEND(request, {
                                error: 'Invalid credentials.'
                            }, 401);
                        }

                        if (!user.verified_email) {
                            return SEND(request, {
                                error: 'Please verify your email before logging in.'
                            }, 401);
                        }

                        const hashedPassword = await hash(password, user.salt);
                        if (user.password_hash !== hashedPassword) {
                            return SEND(request, {
                                error: 'Invalid credentials.'
                            }, 401);
                        }

                        const token = await generateToken(email, env.SECRET_KEY);
                        return SEND(request, {
                            token,
                            id: user.user_id
                        });

                    } catch (err) {
                        console.error('Login error:', err);
                        return SEND(request, {
                            error: 'Failed to process login request.'
                        }, 500);
                    }
                }

            case '/get-user':
                {
                    if (request.method !== 'GET') return SEND(request, {
                        error: 'Method Not Allowed'
                    }, 405);

                    try {
                        const authHeader = request.headers.get('Authorization');
                        if (!authHeader || !authHeader.startsWith('Bearer ')) {
                            return SEND(request, {
                                error: 'Authorization header is missing or invalid.'
                            }, 401);
                        }

                        const token = authHeader.substring(7); // Remove 'Bearer '
                        const email = await verifyToken(token, env.SECRET_KEY);

                        if (!email) {
                            return SEND(request, {
                                error: 'Invalid or expired token.'
                            }, 401);
                        }

                        const userResult = await env.DB.prepare(
                            'SELECT user_id, email, data, dataspec, usage, timestamp, plan, payment_times FROM users WHERE email = ?'
                        ).bind(email).first();

                        if (!userResult) {
                            return SEND(request, {
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

                        return SEND(request, {
                            user: userJson,
                            token: newToken
                        });

                    } catch (err) {
                        console.error('Get user error:', err);
                        return SEND(request, {
                            error: 'Failed to get user data.'
                        }, 500);
                    }
                }

            case '/update-user':
                {
                    if (request.method !== 'POST') return SEND(request, { error: 'Method Not Allowed' }, 405);

                    try {
                        const authHeader = request.headers.get('Authorization');
                        if (!authHeader || !authHeader.startsWith('Bearer ')) {
                            return SEND(request, { error: 'Authorization header is missing or invalid.' }, 401);
                        }
                        const token = authHeader.substring(7);
                        const email = await verifyToken(token, env.SECRET_KEY);
                        if (!email) {
                            return SEND(request, { error: 'Invalid or expired token.' }, 401);
                        }

                        const {
                            data,
                            dataspec,
                            timestamp,
                        } = await request.json();

                        if (typeof data !== 'string' || typeof dataspec !== 'number' || typeof timestamp !== 'number') {
                            return SEND(request, { error: 'Invalid user data.' }, 400);
                        }

                        await env.DB.prepare(
                            `UPDATE users SET data = ?, dataspec = ?, timestamp = ? WHERE email = ?`
                        ).bind(
                            data,
                            dataspec,
                            timestamp,
                            email
                        ).run();

                        return SEND(request, { success: true });
                    } catch (err) {
                        console.error('Update user error:', err);
                        return SEND(request, { error: 'Failed to update user data.' }, 500);
                    }
                }

            case '/send-email':
                if (request.method !== 'POST') {
                    return SEND(request, {
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
                    return SEND(request, 'Email sent', 200);
                } catch (err) {
                    return SEND(request, err.message || err.toString(), 500);
                }

            case '/auth/google':
                {
                    if (request.method !== 'GET') {
                        return SEND(request, { error: 'Method not allowed' }, 405);
                    }
                    
                    const state = crypto.randomUUID();
                    const googleAuthUrl = `https://accounts.google.com/oauth/authorize?` +
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
                        return SEND(request, { error: 'Method not allowed' }, 405);
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
                    return SEND(request, {
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
                    return SEND(request, 'Test email sent', 200);
                } catch (err) {
                    return SEND(request, err.message || err.toString(), 500);
                }

            default:
                return SEND(request, {
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