import express from 'express';
import Billing from '../models/Billing.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

/**
 * GET /api/billing/usage
 * Get user's usage statistics
 */
router.get('/usage', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user;
    let billing = await Billing.findOne({ userId });
    
    if (!billing) {
      // Create a new billing record for the user if one doesn't exist
      billing = new Billing({
        userId,
        tokens: { used: 0, available: 1000 }, // Start with 1000 free tokens
        requests: { count: 0, limit: 100 },
        plan: 'free'
      });
      await billing.save();
    }
    
    res.json(billing);
  } catch (err) {
    console.error('Error fetching billing usage:', err);
    res.status(500).json({ error: 'Failed to fetch usage data' });
  }
});

/**
 * POST /api/billing/purchase
 * Purchase additional tokens
 */
router.post('/purchase', requireAuth, async (req, res) => {
  try {
    const { amountUSD, paymentMethod } = req.body;
    
    if (!amountUSD || amountUSD <= 0) {
      return res.status(400).json({ error: 'Invalid purchase amount' });
    }
    
    const userId = req.session.user;
    
    // Convert USD to tokens (1 USD = 1000 RATOR tokens)
    const tokenAmount = Billing.usdToTokens(amountUSD);
    
    // Update user's billing record
    let billing = await Billing.findOne({ userId });
    
    if (!billing) {
      billing = new Billing({
        userId,
        tokens: { used: 0, available: tokenAmount },
        requests: { count: 0, limit: 100 },
        plan: 'pay-as-you-go',
        transactions: []
      });
    } else {
      billing.tokens.available += tokenAmount;
      
      // If user was on free plan, upgrade to pay-as-you-go
      if (billing.plan === 'free') {
        billing.plan = 'pay-as-you-go';
      }
    }
    
    // Add transaction record
    billing.transactions.push({
      type: 'purchase',
      amount: amountUSD,
      tokens: tokenAmount,
      timestamp: new Date(),
      paymentMethod,
      details: `Purchased ${tokenAmount} RATOR tokens for $${amountUSD}`
    });
    
    await billing.save();
    
    res.json({ 
      success: true, 
      billing,
      purchase: {
        amountUSD,
        tokenAmount,
        newBalance: billing.tokens.available
      }
    });
  } catch (err) {
    console.error('Error processing purchase:', err);
    res.status(500).json({ error: 'Failed to process purchase' });
  }
});

/**
 * GET /api/billing/plans
 * Get available subscription plans
 */
router.get('/plans', async (req, res) => {
  try {
    const plans = [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        tokens: 1000,
        tokensPerMonth: 1000,
        requests: 100,
        features: ['Basic access', 'Limited requests', '1,000 free RATOR tokens']
      },
      {
        id: 'basic',
        name: 'Basic',
        price: 9.99,
        tokens: 15000, // 10,000 + 5,000 bonus
        tokensPerMonth: 10000,
        requests: 1000,
        features: ['Standard access', 'Priority support', '15,000 RATOR tokens', '50% more tokens than pay-as-you-go']
      },
      {
        id: 'pro',
        name: 'Professional',
        price: 29.99,
        tokens: 50000, // 30,000 + 20,000 bonus
        tokensPerMonth: 30000,
        requests: 5000,
        features: ['Advanced access', 'Faster response times', 'Premium support', '50,000 RATOR tokens', '66% more tokens than pay-as-you-go']
      },
      {
        id: 'pay-as-you-go',
        name: 'Pay As You Go',
        price: null,
        tokens: null,
        requests: 100,
        features: ['Purchase tokens as needed', 'No monthly commitment', '1 USD = 1,000 RATOR tokens']
      }
    ];
    
    res.json(plans);
  } catch (err) {
    console.error('Error fetching plans:', err);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

/**
 * POST /api/billing/subscribe
 * Subscribe to a plan
 */
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const { planId, paymentMethod } = req.body;
    const userId = req.session.user;
    
    // Validate plan
    const plans = {
      free: { price: 0, tokens: 1000, requests: 100 },
      basic: { price: 9.99, tokens: 15000, requests: 1000 },
      pro: { price: 29.99, tokens: 50000, requests: 5000 }
    };
    
    if (!plans[planId]) {
      return res.status(400).json({ error: 'Invalid plan' });
    }
    
    const plan = plans[planId];
    
    // Update user's billing record
    let billing = await Billing.findOne({ userId });
    
    if (!billing) {
      billing = new Billing({
        userId,
        tokens: { used: 0, available: plan.tokens },
        requests: { count: 0, limit: plan.requests },
        plan: planId
      });
    } else {
      // Add the new plan's tokens to the user's account
      billing.tokens.available += plan.tokens;
      billing.requests.limit = plan.requests;
      billing.plan = planId;
    }
    
    // Set subscription details
    const now = new Date();
    const renewDate = new Date();
    renewDate.setMonth(renewDate.getMonth() + 1);
    
    billing.subscriptionDetails = {
      startDate: now,
      renewDate: renewDate,
      status: 'active'
    };
    
    // Add transaction record
    if (plan.price > 0) {
      billing.transactions.push({
        type: 'subscription',
        amount: plan.price,
        tokens: plan.tokens,
        timestamp: now,
        paymentMethod,
        details: `Subscribed to ${planId} plan for $${plan.price}/month`
      });
    }
    
    await billing.save();
    
    res.json({ 
      success: true, 
      billing,
      subscription: {
        plan: planId,
        startDate: now,
        renewDate: renewDate,
        tokens: plan.tokens
      }
    });
  } catch (err) {
    console.error('Error processing subscription:', err);
    res.status(500).json({ error: 'Failed to process subscription' });
  }
});

/**
 * GET /api/billing/transactions
 * Get user's transaction history
 */
router.get('/transactions', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user;
    const billing = await Billing.findOne({ userId });
    
    if (!billing) {
      return res.json([]);
    }
    
    res.json(billing.transactions);
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

export default router;
