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

export default {
    async fetch(request, env, ctx) {
        return new Response('Hello World!');
    },
};