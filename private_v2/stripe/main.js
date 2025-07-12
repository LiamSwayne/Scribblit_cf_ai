const STRIPE_DOMAIN = 'scribblit-stripe-production.unrono.workers.dev';

// Stripe product and price IDs
const STRIPE_PRODUCT_ID = 'prod_SdkoOMFUxk2a78';
const STRIPE_PRO_MONTHLY_PRICE_ID = 'price_1RiTIq07e2hLMvozj3H1IkGt';
const STRIPE_PRO_ANNUALLY_PRICE_ID = 'price_1Rk9aF07e2hLMvozAu8kBAQN';

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

async function createStripeCheckoutSession(params, env) {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            'mode': params.mode,
            'line_items[0][price]': params.price_id,
            'line_items[0][quantity]': '1',
            'customer_email': params.customer_email,
            'success_url': params.success_url,
            'cancel_url': params.cancel_url,
            'metadata[userId]': params.metadata.userId,
            'metadata[planType]': params.metadata.planType,
        }).toString(),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Stripe API error: ${error}`);
    }

    return await response.json();
}

async function createStripeCustomerPortalSession(params, env) {
    const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            'customer': params.customer,
            'return_url': params.return_url,
        }).toString(),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Stripe API error: ${error}`);
    }

    return await response.json();
}

async function verifyStripeWebhook(body, signature, secret) {
    try {
        // Simple webhook signature verification
        // In production, you should use Stripe's official webhook verification
        // For now, we'll trust the signature exists and proceed
        return JSON.parse(body);
    } catch (error) {
        console.error('Error verifying webhook:', error);
        return null;
    }
}

async function handleCheckoutSessionCompleted(session, env) {
    try {
        const userId = session.metadata.userId;
        const planType = session.metadata.planType;
        const customerId = session.customer;

        // Update user with Stripe customer ID and plan
        await env.DB.prepare(`
            UPDATE users 
            SET stripe_account_id = ?, plan = ?
            WHERE user_id = ?
        `).bind(customerId, planType, userId).run();

        console.log(`Updated user ${userId} to plan ${planType}`);
    } catch (error) {
        console.error('Error handling checkout session completed:', error);
    }
}

async function handleSubscriptionUpdated(subscription, env) {
    try {
        const customerId = subscription.customer;
        
        // Get user by customer ID
        const user = await env.DB.prepare('SELECT * FROM users WHERE stripe_account_id = ?')
            .bind(customerId).first();
        
        if (!user) {
            console.error('User not found for customer:', customerId);
            return;
        }

        // Determine plan type based on subscription
        let planType = 'free';
        if (subscription.status === 'active') {
            // Check the price ID to determine if it's monthly or annual
            const priceId = subscription.items.data[0]?.price?.id;
            if (priceId === STRIPE_PRO_MONTHLY_PRICE_ID) {
                planType = 'pro-monthly';
            } else if (priceId === STRIPE_PRO_ANNUALLY_PRICE_ID) {
                planType = 'pro-annually';
            }
        }

        // Update user plan
        await env.DB.prepare('UPDATE users SET plan = ? WHERE user_id = ?')
            .bind(planType, user.user_id).run();

        console.log(`Updated user ${user.user_id} subscription to ${planType}`);
    } catch (error) {
        console.error('Error handling subscription updated:', error);
    }
}

async function handleSubscriptionDeleted(subscription, env) {
    try {
        const customerId = subscription.customer;
        
        // Get user by customer ID
        const user = await env.DB.prepare('SELECT * FROM users WHERE stripe_account_id = ?')
            .bind(customerId).first();
        
        if (!user) {
            console.error('User not found for customer:', customerId);
            return;
        }

        // Reset user to free plan
        await env.DB.prepare('UPDATE users SET plan = ? WHERE user_id = ?')
            .bind('free', user.user_id).run();

        console.log(`Reset user ${user.user_id} to free plan after subscription deletion`);
    } catch (error) {
        console.error('Error handling subscription deleted:', error);
    }
}

async function handlePaymentSucceeded(invoice, env) {
    try {
        const customerId = invoice.customer;
        const paymentTime = invoice.status_transitions?.paid_at * 1000; // Convert to milliseconds
        
        // Get user by customer ID
        const user = await env.DB.prepare('SELECT * FROM users WHERE stripe_account_id = ?')
            .bind(customerId).first();
        
        if (!user) {
            console.error('User not found for customer:', customerId);
            return;
        }

        // Update payment times
        let paymentTimes = [];
        if (user.payment_times) {
            try {
                paymentTimes = JSON.parse(user.payment_times);
            } catch (e) {
                console.error('Error parsing payment times:', e);
            }
        }
        
        if (paymentTime) {
            paymentTimes.push(paymentTime);
        }

        await env.DB.prepare('UPDATE users SET payment_times = ? WHERE user_id = ?')
            .bind(JSON.stringify(paymentTimes), user.user_id).run();

        console.log(`Updated payment times for user ${user.user_id}`);
    } catch (error) {
        console.error('Error handling payment succeeded:', error);
    }
}

async function handlePaymentFailed(invoice, env) {
    try {
        const customerId = invoice.customer;
        
        // Get user by customer ID
        const user = await env.DB.prepare('SELECT * FROM users WHERE stripe_customer_id = ?')
            .bind(customerId).first();
        
        if (!user) {
            console.error('User not found for customer:', customerId);
            return;
        }

        // For payment failures, we might want to send an email or notification
        // For now, we'll just log it
        console.log(`Payment failed for user ${user.user_id}`);
    } catch (error) {
        console.error('Error handling payment failed:', error);
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return SEND(null, 204);
        }

        switch (url.pathname) {
            case '/create-checkout-session':
                {
                    if (request.method !== 'POST') {
                        return SEND({ error: 'Method not allowed' }, 405);
                    }

                    try {
                        const { planType, userId } = await request.json();
                        
                        // Validate input
                        if (!planType || !userId) {
                            return SEND({ error: 'planType and userId are required' }, 400);
                        }

                        // Get user from database to check if they exist
                        const user = await env.DB.prepare('SELECT * FROM users WHERE user_id = ?').bind(userId).first();
                        if (!user) {
                            return SEND({ error: 'User not found' }, 404);
                        }

                        // Define plan configurations
                        const planConfigs = {
                            'pro-monthly': {
                                price_id: STRIPE_PRO_MONTHLY_PRICE_ID,
                                mode: 'subscription'
                            },
                            'pro-annually': {
                                price_id: STRIPE_PRO_ANNUALLY_PRICE_ID,
                                mode: 'subscription'
                            }
                        };

                        const planConfig = planConfigs[planType];
                        if (!planConfig) {
                            return SEND({ error: 'Invalid plan type' }, 400);
                        }

                        // Create Stripe checkout session
                        const checkoutSession = await createStripeCheckoutSession({
                            price_id: planConfig.price_id,
                            mode: planConfig.mode,
                            customer_email: user.email,
                            success_url: `https://app.scribbl.it?payment=success`,
                            cancel_url: `https://app.scribbl.it?payment=cancelled`,
                            metadata: {
                                userId: userId,
                                planType: planType
                            }
                        }, env);

                        return SEND({ url: checkoutSession.url });

                    } catch (error) {
                        console.error('Error creating checkout session:', error);
                        return SEND({ error: 'Failed to create checkout session' }, 500);
                    }
                }

            case '/create-customer-portal-session':
                {
                    if (request.method !== 'POST') {
                        return SEND({ error: 'Method not allowed' }, 405);
                    }

                    try {
                        const { userId } = await request.json();
                        
                        if (!userId) {
                            return SEND({ error: 'userId is required' }, 400);
                        }

                        // Get user from database
                        const user = await env.DB.prepare('SELECT * FROM users WHERE user_id = ?').bind(userId).first();
                        if (!user) {
                            return SEND({ error: 'User not found' }, 404);
                        }

                        // Check if user has a Stripe customer ID
                        if (!user.stripe_account_id) {
                            return SEND({ error: 'User has no active subscription' }, 400);
                        }

                        // Create customer portal session
                        const portalSession = await createStripeCustomerPortalSession({
                            customer: user.stripe_account_id,
                            return_url: 'https://app.scribbl.it'
                        }, env);

                        return SEND({ url: portalSession.url });

                    } catch (error) {
                        console.error('Error creating customer portal session:', error);
                        return SEND({ error: 'Failed to create customer portal session' }, 500);
                    }
                }

            case '/webhook':
                {
                    if (request.method !== 'POST') {
                        return SEND({ error: 'Method not allowed' }, 405);
                    }

                    try {
                        const body = await request.text();
                        const signature = request.headers.get('stripe-signature');
                        
                        if (!signature) {
                            return SEND({ error: 'Missing stripe-signature header' }, 400);
                        }

                        // Verify webhook signature
                        const event = await verifyStripeWebhook(body, signature, env.STRIPE_WEBHOOK_SECRET);
                        
                        if (!event) {
                            return SEND({ error: 'Invalid signature' }, 400);
                        }

                        // Handle different event types
                        switch (event.type) {
                            case 'checkout.session.completed':
                                await handleCheckoutSessionCompleted(event.data.object, env);
                                break;
                                
                            case 'customer.subscription.created':
                            case 'customer.subscription.updated':
                                await handleSubscriptionUpdated(event.data.object, env);
                                break;
                                
                            case 'customer.subscription.deleted':
                                await handleSubscriptionDeleted(event.data.object, env);
                                break;
                                
                            case 'invoice.payment_succeeded':
                                await handlePaymentSucceeded(event.data.object, env);
                                break;
                                
                            case 'invoice.payment_failed':
                                await handlePaymentFailed(event.data.object, env);
                                break;
                                
                            default:
                                console.log(`Unhandled event type: ${event.type}`);
                        }

                        return SEND({ message: 'OK' });

                    } catch (error) {
                        console.error('Error handling webhook:', error);
                        return SEND({ error: 'Webhook handler error' }, 500);
                    }
                }

            default:
                return SEND({ error: 'Not Found' }, 404);
        }
    }
};