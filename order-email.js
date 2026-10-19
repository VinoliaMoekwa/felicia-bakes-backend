const { randomUUID } = require('node:crypto');

async function sendOrderEmail(order, { env = process.env, send = fetch } = {}) {
  if (!env.RESEND_API_KEY?.startsWith('re_') || !env.EMAIL_FROM?.includes('@')) {
    return { status: 'not-configured' };
  }
  const lines = [
    `New Felicia Bakes quote request: ${order.order_number}`,
    `Status: ${order.status}`,
    '', 'Customer details',
    `Name: ${order.name}`, `Phone: ${order.phone_number || 'Not provided'}`,
    `Email: ${order.email || 'Not provided'}`, '', 'Order details',
    `Cake: ${order.cake_selected ? 'Yes' : 'No'}`,
    `Flavour: ${order.flavour || 'Not specified'}`,
    `Size: ${order.cake_size || 'Not specified'}`,
    `Design: ${order.design_type || 'Not specified'}`,
    `Cupcakes: ${order.cupcake_selected ? 'Yes' : 'No'}`,
    `Cupcake style: ${order.cupcake_topping || 'Not specified'}`,
    `Cupcake quantity: ${order.cupcake_quantity || 0}`,
    '', 'Design request and other products', order.message || 'Not provided',
    '', 'Inspiration photos can be sent separately by email or WhatsApp, quoting this order number.'
  ];
  try {
    const response = await send('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `order-notification/${order.id || randomUUID()}`
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [env.ORDER_NOTIFICATION_EMAIL || 'dev@feliciabakes.co.za'],
        subject: `New quote request — ${order.order_number}`,
        text: lines.join('\n'),
        ...(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email || '') ? { reply_to: order.email } : {})
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return { status: 'failed', code: response.status };
    const data = await response.json();
    return data.id ? { status: 'sent', id: data.id } : { status: 'failed' };
  } catch {
    return { status: 'failed' };
  }
}
module.exports = { sendOrderEmail };
