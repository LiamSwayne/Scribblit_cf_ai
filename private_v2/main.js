// Handle incoming requests and send email via SendGrid using a switch-case and 4-space indentation
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        switch (url.pathname) {
            case '/send-email':
                if (request.method !== 'POST') {
                    return new Response('Method Not Allowed', { status: 405 });
                }
                try {
                    const { to, subject, content } = await request.json();
                    await sendEmail(env.SENDGRID_API_KEY, to, subject, content);
                    return new Response('Email sent', { status: 200 });
                } catch (err) {
                    return new Response(err.message || err.toString(), { status: 500 });
                }
            case '/test-email-integration':
                if (request.method !== 'GET') {
                    return new Response('Method Not Allowed', { status: 405 });
                }
                try {
                    await sendEmail(
                        env.SENDGRID_API_KEY,
                        'liamtswayne@gmail.com',
                        'Test Integration',
                        'This is a test email from your Cloudflare Worker.'
                    );
                    return new Response('Test email sent', { status: 200 });
                } catch (err) {
                    return new Response(err.message || err.toString(), { status: 500 });
                }
            default:
                return new Response('Endpoint not found', { status: 489 });
        }
    }
};

async function sendEmail(apiKey, to, subject, content) {
    const msg = {
        personalizations: [
            { to: [{ email: to }] }
        ],
        from: { email: 'hello@scribbl.it' },
        subject: subject,
        content: [
            { type: 'text/plain', value: content }
        ]
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