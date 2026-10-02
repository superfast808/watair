const crypto = require('crypto');

const SUPPORTED_CURRENCIES = new Set(['GBP','EUR','USD']);

function normaliseCurrency(value) {
  const currency = String(value || 'GBP').trim().toUpperCase();
  return SUPPORTED_CURRENCIES.has(currency) ? currency : 'GBP';
}

function parseMoneyToMinor(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
}

function minorToInput(value) {
  const amount = Math.max(0, Number(value || 0));
  return (amount / 100).toFixed(2);
}

function formatMoney(minor, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: normaliseCurrency(currency)
  }).format(Math.max(0, Number(minor || 0)) / 100);
}

function normalisePostcode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function deliveryQuote(db, product, countryCode, postcode) {
  const country = String(countryCode || '').trim().toUpperCase().slice(0, 2);
  const deliveryClass = String(product.delivery_class || 'standard').trim().toLowerCase() || 'standard';
  const compactPostcode = normalisePostcode(postcode);
  if (!country || !compactPostcode) return null;

  const rules = db.prepare('SELECT * FROM delivery_rules WHERE active=1 ORDER BY priority,id').all();
  const candidates = [];

  for (const rule of rules) {
    const ruleClass = String(rule.delivery_class || 'standard').trim().toLowerCase();
    const ruleCountry = String(rule.country_code || 'GB').trim().toUpperCase();
    if (ruleClass !== '*' && ruleClass !== deliveryClass) continue;
    if (ruleCountry !== '*' && ruleCountry !== country) continue;

    const prefixes = String(rule.postcode_prefixes || '')
      .split(',')
      .map(normalisePostcode)
      .filter(Boolean);
    let prefixLength = 0;
    if (prefixes.length) {
      const matched = prefixes.filter(prefix => compactPostcode.startsWith(prefix));
      if (!matched.length) continue;
      prefixLength = Math.max(...matched.map(prefix => prefix.length));
    }

    candidates.push({
      ...rule,
      specificity:
        (ruleClass === deliveryClass ? 10000 : 0) +
        (ruleCountry === country ? 5000 : 0) +
        prefixLength * 100
    });
  }

  candidates.sort((a,b) => b.specificity - a.specificity || Number(a.priority) - Number(b.priority) || a.id - b.id);
  return candidates[0] || null;
}

function enabledGateways(settings) {
  const gateways = [];
  if (
    String(settings.commerce_stripe_enabled) === '1' &&
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET
  ) {
    gateways.push({ id: 'stripe', label: 'Card payment', detail: 'Secure checkout powered by Stripe' });
  }
  if (
    String(settings.commerce_paypal_enabled) === '1' &&
    process.env.PAYPAL_CLIENT_ID &&
    process.env.PAYPAL_CLIENT_SECRET
  ) {
    gateways.push({ id: 'paypal', label: 'PayPal', detail: 'Pay securely with PayPal' });
  }
  if (String(settings.commerce_manual_enabled) === '1') {
    gateways.push({ id: 'manual', label: 'Manual payment', detail: 'Place the order and arrange payment with WatAir' });
  }
  return gateways;
}

async function stripeRequest(path, secret, options = {}) {
  if (!secret) throw new Error('Stripe is not configured.');
  const response = await fetch('https://api.stripe.com' + path, {
    method: options.method || 'GET',
    headers: {
      Authorization: 'Bearer ' + secret,
      ...(options.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
    },
    body: options.body || undefined,
    signal: AbortSignal.timeout(15000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Stripe request failed.');
  }
  return payload;
}

async function createStripeCheckout({ order, baseUrl, secret }) {
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('client_reference_id', order.public_id);
  params.set('customer_email', order.customer_email);
  params.set('success_url', baseUrl + '/payments/stripe/return?order=' + encodeURIComponent(order.public_id) + '&session_id={CHECKOUT_SESSION_ID}');
  params.set('cancel_url', baseUrl + '/order/' + encodeURIComponent(order.public_id) + '?payment=cancelled');
  params.set('metadata[order_id]', order.public_id);
  params.set('payment_intent_data[metadata][order_id]', order.public_id);

  params.set('line_items[0][price_data][currency]', order.currency.toLowerCase());
  params.set('line_items[0][price_data][product_data][name]', order.product_name);
  params.set('line_items[0][price_data][unit_amount]', String(order.unit_price_minor));
  params.set('line_items[0][quantity]', String(order.quantity));

  if (order.delivery_minor > 0) {
    params.set('line_items[1][price_data][currency]', order.currency.toLowerCase());
    params.set('line_items[1][price_data][product_data][name]', 'Delivery');
    params.set('line_items[1][price_data][unit_amount]', String(order.delivery_minor));
    params.set('line_items[1][quantity]', '1');
  }

  return stripeRequest('/v1/checkout/sessions', secret, {
    method: 'POST',
    body: params.toString()
  });
}

async function retrieveStripeSession(sessionId, secret) {
  return stripeRequest('/v1/checkout/sessions/' + encodeURIComponent(sessionId), secret);
}

function verifyStripeWebhook(rawBody, signatureHeader, secret, toleranceSeconds = 300) {
  if (!Buffer.isBuffer(rawBody) || !secret || !signatureHeader) return null;
  const parts = String(signatureHeader).split(',').map(part => part.split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([,value]) => value);
  if (!timestamp || !signatures.length) return null;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now()/1000) - ts) > toleranceSeconds) return null;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(timestamp + '.' + rawBody.toString('utf8'))
    .digest('hex');

  const expectedBuffer = Buffer.from(expected);
  const valid = signatures.some(signature => {
    const actual = Buffer.from(String(signature));
    return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
  });
  if (!valid) return null;

  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    return null;
  }
}

function paypalBaseUrl() {
  return String(process.env.PAYPAL_ENV || '').toLowerCase() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function paypalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error('PayPal is not configured.');

  const response = await fetch(paypalBaseUrl() + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(clientId + ':' + secret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || 'Could not authenticate with PayPal.');
  return payload.access_token;
}

function paypalAmount(minor) {
  return (Math.max(0, Number(minor || 0)) / 100).toFixed(2);
}

async function paypalRequest(path, options = {}) {
  const token = await paypalAccessToken();
  const response = await fetch(paypalBaseUrl() + path, {
    method: options.method || 'GET',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.details?.[0]?.description || payload?.message || 'PayPal request failed.';
    throw new Error(detail);
  }
  return payload;
}

async function createPayPalOrder({ order, baseUrl, brandName = 'WatAir' }) {
  const body = {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: order.public_id,
      custom_id: order.public_id,
      description: order.product_name,
      amount: {
        currency_code: order.currency,
        value: paypalAmount(order.total_minor),
        breakdown: {
          item_total: { currency_code: order.currency, value: paypalAmount(order.unit_price_minor * order.quantity) },
          shipping: { currency_code: order.currency, value: paypalAmount(order.delivery_minor) }
        }
      },
      items: [{
        name: order.product_name,
        quantity: String(order.quantity),
        unit_amount: { currency_code: order.currency, value: paypalAmount(order.unit_price_minor) }
      }]
    }],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: String(brandName || 'WatAir').slice(0, 127),
          user_action: 'PAY_NOW',
          return_url: baseUrl + '/payments/paypal/return?order=' + encodeURIComponent(order.public_id),
          cancel_url: baseUrl + '/order/' + encodeURIComponent(order.public_id) + '?payment=cancelled'
        }
      }
    }
  };
  return paypalRequest('/v2/checkout/orders', { method: 'POST', body });
}

async function retrievePayPalOrder(paypalOrderId) {
  return paypalRequest('/v2/checkout/orders/' + encodeURIComponent(paypalOrderId));
}

async function capturePayPalOrder(paypalOrderId) {
  return paypalRequest('/v2/checkout/orders/' + encodeURIComponent(paypalOrderId) + '/capture', {
    method: 'POST',
    body: {}
  });
}

module.exports = {
  normaliseCurrency,
  parseMoneyToMinor,
  minorToInput,
  formatMoney,
  normalisePostcode,
  deliveryQuote,
  enabledGateways,
  createStripeCheckout,
  retrieveStripeSession,
  verifyStripeWebhook,
  createPayPalOrder,
  retrievePayPalOrder,
  capturePayPalOrder
};
