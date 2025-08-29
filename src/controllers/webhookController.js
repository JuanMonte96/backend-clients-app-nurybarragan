import Stripe from 'stripe';
import dotenv from 'dotenv';
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const stripeWebhookHandler = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('⚠️ Webhook verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ⬇️ Stripe te avisa que el pago fue exitoso
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    console.log('✅ Pago exitoso recibido desde Stripe');
    console.log('Correo:', session.customer_email);
    console.log('ID de sesión:', session.id);
    console.log('Metadata:', session.metadata);

    // Aquí haces tu lógica:
    // - Crear usuario si no existe
    // - Guardar pago
    // - Crear suscripción

    return res.status(200).json({ received: true });
  }

  // Otros eventos no manejados
  res.status(200).send('Evento no manejado');
};