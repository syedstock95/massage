// Payment Routes - Stripe subscription management
const express = require('express');
const router = express.Router();
const { authMiddleware, therapistOnly } = require('../middleware/auth');

// Initialize Stripe (will be configured with actual keys)
let stripe;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// Get subscription plans
router.get('/plans', async (req, res) => {
    const db = req.app.locals.db;

    try {
        const result = await db.query(`
            SELECT id, name, price_monthly, price_yearly, features
            FROM subscription_plans
            WHERE is_active = TRUE
            ORDER BY price_monthly
        `);

        res.json({ plans: result.rows });

    } catch (error) {
        console.error('Get plans error:', error);
        res.status(500).json({ error: { message: 'Failed to get plans' } });
    }
});

// Create checkout session for subscription
router.post('/create-checkout', authMiddleware, therapistOnly, async (req, res) => {
    if (!stripe) {
        return res.status(500).json({ error: { message: 'Payment processing not configured' } });
    }

    const db = req.app.locals.db;
    const userId = req.user.id;
    const { planId, billingCycle = 'monthly' } = req.body;

    try {
        // Get therapist
        const therapistResult = await db.query(
            'SELECT id, stripe_customer_id FROM therapists WHERE user_id = $1',
            [userId]
        );

        if (therapistResult.rows.length === 0) {
            return res.status(404).json({ error: { message: 'Therapist not found' } });
        }

        const therapist = therapistResult.rows[0];

        // Get user email
        const userResult = await db.query('SELECT email FROM users WHERE id = $1', [userId]);
        const email = userResult.rows[0].email;

        // Get plan
        const planResult = await db.query(
            'SELECT * FROM subscription_plans WHERE id = $1',
            [planId]
        );

        if (planResult.rows.length === 0) {
            return res.status(404).json({ error: { message: 'Plan not found' } });
        }

        const plan = planResult.rows[0];
        const priceId = billingCycle === 'yearly' 
            ? plan.stripe_price_id_yearly 
            : plan.stripe_price_id_monthly;

        if (!priceId) {
            return res.status(400).json({ error: { message: 'Plan not available for this billing cycle' } });
        }

        // Create or retrieve Stripe customer
        let customerId = therapist.stripe_customer_id;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: email,
                metadata: { therapist_id: therapist.id }
            });
            customerId = customer.id;

            await db.query(
                'UPDATE therapists SET stripe_customer_id = $1 WHERE id = $2',
                [customerId, therapist.id]
            );
        }

        // Create checkout session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [{
                price: priceId,
                quantity: 1
            }],
            mode: 'subscription',
            success_url: `${process.env.FRONTEND_URL}/dashboard?subscription=success`,
            cancel_url: `${process.env.FRONTEND_URL}/pricing?subscription=cancelled`,
            metadata: {
                therapist_id: therapist.id,
                plan_id: planId
            }
        });

        res.json({ sessionId: session.id, url: session.url });

    } catch (error) {
        console.error('Create checkout error:', error);
        res.status(500).json({ error: { message: 'Failed to create checkout session' } });
    }
});

// Stripe webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe) {
        return res.status(500).send('Payment processing not configured');
    }

    const db = req.app.locals.db;
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;
            const therapistId = session.metadata.therapist_id;
            const planId = session.metadata.plan_id;

            await db.query(`
                UPDATE therapists SET 
                    subscription_tier = $1,
                    subscription_status = 'active',
                    stripe_subscription_id = $2
                WHERE id = $3
            `, [planId, session.subscription, therapistId]);

            console.log(`✅ Subscription activated for therapist ${therapistId}: ${planId}`);
            break;
        }

        case 'customer.subscription.updated': {
            const subscription = event.data.object;
            const status = subscription.status;

            // Find therapist by subscription ID
            const result = await db.query(
                'SELECT id FROM therapists WHERE stripe_subscription_id = $1',
                [subscription.id]
            );

            if (result.rows.length > 0) {
                await db.query(
                    'UPDATE therapists SET subscription_status = $1 WHERE stripe_subscription_id = $2',
                    [status, subscription.id]
                );
            }
            break;
        }

        case 'customer.subscription.deleted': {
            const subscription = event.data.object;

            await db.query(`
                UPDATE therapists SET 
                    subscription_tier = 'free',
                    subscription_status = 'cancelled',
                    stripe_subscription_id = NULL
                WHERE stripe_subscription_id = $1
            `, [subscription.id]);

            console.log(`⚠️ Subscription cancelled: ${subscription.id}`);
            break;
        }

        case 'invoice.payment_failed': {
            const invoice = event.data.object;
            const subscriptionId = invoice.subscription;

            await db.query(
                'UPDATE therapists SET subscription_status = $1 WHERE stripe_subscription_id = $2',
                ['past_due', subscriptionId]
            );
            break;
        }
    }

    res.json({ received: true });
});

// Get current subscription status
router.get('/subscription', authMiddleware, therapistOnly, async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.user.id;

    try {
        const result = await db.query(`
            SELECT subscription_tier, subscription_status, stripe_subscription_id
            FROM therapists WHERE user_id = $1
        `, [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: { message: 'Therapist not found' } });
        }

        const therapist = result.rows[0];

        // Get plan details
        const planResult = await db.query(
            'SELECT * FROM subscription_plans WHERE id = $1',
            [therapist.subscription_tier]
        );

        res.json({
            subscription: {
                tier: therapist.subscription_tier,
                status: therapist.subscription_status,
                plan: planResult.rows[0] || null
            }
        });

    } catch (error) {
        console.error('Get subscription error:', error);
        res.status(500).json({ error: { message: 'Failed to get subscription' } });
    }
});

// Create customer portal session (manage subscription)
router.post('/portal', authMiddleware, therapistOnly, async (req, res) => {
    if (!stripe) {
        return res.status(500).json({ error: { message: 'Payment processing not configured' } });
    }

    const db = req.app.locals.db;
    const userId = req.user.id;

    try {
        const result = await db.query(
            'SELECT stripe_customer_id FROM therapists WHERE user_id = $1',
            [userId]
        );

        if (result.rows.length === 0 || !result.rows[0].stripe_customer_id) {
            return res.status(400).json({ error: { message: 'No billing account found' } });
        }

        const session = await stripe.billingPortal.sessions.create({
            customer: result.rows[0].stripe_customer_id,
            return_url: `${process.env.FRONTEND_URL}/dashboard`
        });

        res.json({ url: session.url });

    } catch (error) {
        console.error('Create portal error:', error);
        res.status(500).json({ error: { message: 'Failed to create portal session' } });
    }
});

module.exports = router;
