import Stripe from 'stripe';
import dotenv from 'dotenv';
import { createUser } from './userController.js';
import { sendEmail } from '../services/sendEmail.js';
import { createPayment } from './paymentController.js';
import { createsubscription } from './subscriptionController.js';


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
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      console.log('✅ Pago exitoso recibido desde Stripe');
      console.log(session)
      
      // Aquí haces tu lógica:
      const newUser = await createUser(session);
      if (newUser.message === 'user already exists') {
        
        const newPayment = await createPayment(newUser, session);
        const newSubscription = await createsubscription(newUser, newPayment, session);

        return res.status(200).json({
          received: true,
          user: newUser,
          payment: newPayment,
          subscription: newSubscription
        });

      }
      
      await sendEmail(newUser.email, newUser.nombre, newUser.password);
      // - Guardar pago
      const newPayment = await createPayment(newUser, session);
      // - Guardar usuario
      const newSubscription = await createsubscription(newUser, newPayment, session);
      // - Crear suscripción

      return res.status(200).json({
        received: true,
        user: newUser,
        payment: newPayment,
        subscription: newSubscription
      });
    }

    // Otros eventos no manejados
    res.status(200).send('Evento no manejado');
  } catch (err) {
    console.error('⚠️ Webhook verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
};