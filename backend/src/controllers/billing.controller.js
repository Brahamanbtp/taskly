const { pool } = require('../db');
const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret',
});

const PLANS = {
  FREE: { maxTasks: 50, maxMembers: 3, maxWebhooks: 1 },
  PRO: { maxTasks: 5000, maxMembers: 50, maxWebhooks: 10 },
  ENTERPRISE: { maxTasks: Infinity, maxMembers: Infinity, maxWebhooks: Infinity }
};

async function createOrder(req, res) {
  const { plan } = req.body;
  const workspaceId = req.workspace.id;

  if (!['PRO', 'ENTERPRISE'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan selected' });
  }

  const amount = plan === 'PRO' ? process.env.RAZORPAY_PRO_PLAN_AMOUNT : process.env.RAZORPAY_ENT_PLAN_AMOUNT;

  if (!amount || isNaN(parseInt(amount))) {
    return res.status(500).json({ error: `Razorpay amount for ${plan} is not configured or invalid in .env` });
  }

  if (process.env.RAZORPAY_KEY_ID === 'rzp_test_...' || !process.env.RAZORPAY_KEY_ID) {
    return res.status(500).json({ error: 'Razorpay Key ID is not configured in .env' });
  }

  try {
    const options = {
      amount: parseInt(amount), // amount in paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`, // Simpler receipt
      notes: { workspaceId, plan }
    };

    const order = await razorpay.orders.create(options);
    return res.json({
      id: order.id,
      currency: order.currency,
      amount: order.amount,
      key_id: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error('--- RAZORPAY API ERROR ---');
    console.error(err); // Log the full object
    return res.status(500).json({ error: `Razorpay API Error: ${err.description || err.message}` });
  }
}

async function verifyPayment(req, res) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, workspaceId } = req.body;

  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret')
    .update(body.toString())
    .digest('hex');

  if (expectedSignature === razorpay_signature) {
    const client = await pool.connect();
    try {
      await client.query(
        'UPDATE workspaces SET plan = $1, subscription_status = $2 WHERE id = $3',
        [plan, 'active', workspaceId]
      );
      return res.json({ success: true, message: 'Payment verified and plan upgraded' });
    } catch (err) {
      console.error('Database update error during payment verification:', err.message);
      return res.status(500).json({ error: 'Payment verified but failed to update database' });
    } finally {
      client.release();
    }
  } else {
    return res.status(400).json({ error: 'Invalid payment signature' });
  }
}

module.exports = { createOrder, verifyPayment, PLANS };
