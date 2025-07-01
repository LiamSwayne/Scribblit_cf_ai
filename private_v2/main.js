// Handle incoming requests and send email via SendGrid without an npm package
export default {
  async fetch(request, env) {
    // Only handle POST requests to /send-email
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/send-email') {
      const { to, subject, content } = await request.json();
      try {
        await sendEmail(env.SENDGRID_API_KEY, to, subject, content);
        return new Response('Email sent', { status: 200 });
      } catch (err) {
        return new Response(err.message || err.toString(), { status: 500 });
      }
    }

    // Default response
    return new Response('Hello from Worker', { status: 200 });
  }
};

async function sendEmail(apiKey, to, subject, content) {
  const msg = {
    personalizations: [
      { to: [{ email: to }] }
    ],
    from: { email: 'hello@scribbl.it' }, // TODO: replace with your verified sender
    subject,
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