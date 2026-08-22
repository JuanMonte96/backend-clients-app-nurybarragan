import dotenv from 'dotenv'
import Stripe from 'stripe'

dotenv.config()

// Pinned to the API version configured for the Stripe webhook endpoint (Dashboard),
// so the shape of events/objects we receive/send always matches what this code expects.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-12-15.clover',
});

export const createProduct = async (product) => {
  try {
    const { name, description, price, is_recurrent = false } = product;

    const stripeProduct = await stripe.products.create({
      name,
      description,
      metadata: {
        package_id: product.id
      }
    });

    const productFromStripe = await stripe.products.retrieve(stripeProduct.id);

    const stripePrice = await stripe.prices.create({
      unit_amount: price * 100,
      currency: 'eur',
      product: stripeProduct.id,
      ...(is_recurrent
        ? {
            recurring: {
              interval: 'month'
            }
          }
        : {}),
    })

    return { stripeProduct, stripePrice, productFromStripe };
  } catch (error) {
    console.error("Error creating product:", error);
    throw error;
  }
}

export const createCheckoutSession = async (priceId, customerData, successUrl, cancelUrl, options = {}) => {
  const session = await stripe.checkout.sessions.create({
    // SEPA Direct Debit habilitado también para pago único, no solo para cuotas.
    payment_method_types: ['card', 'sepa_debit'],
    line_items: [{
      price: priceId,
      quantity: 1
    }],
    mode: 'payment',
    customer_email: customerData.email,
    metadata: {
      name: customerData.name,
      telephone: customerData.telephone,  // ✅ Agregar teléfono
      custom_id: customerData.custom_id,
      ...(options.metadata || {})
    },
    ...(options.discounts?.length ? { discounts: options.discounts } : {}),
    ...(options.clientReferenceId ? { client_reference_id: options.clientReferenceId } : {}),
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
  });

  return session;
};

// --- Payment Plan (SEPA Direct Debit installments) ---

export const createOrGetStripeCustomer = async ({ existingCustomerId, email, name }) => {
  if (existingCustomerId) {
    return stripe.customers.retrieve(existingCustomerId);
  }
  return stripe.customers.create({ email, name });
};

// Crea la Checkout Session que inicia el plan de pago. Se usa `mode: 'subscription'`
// con un precio dinámico (price_data) equivalente al valor de la primera cuota,
// ya que el monto real depende de promociones aplicadas y no puede reutilizarse
// como un Price fijo de Stripe.
export const createPaymentPlanCheckoutSession = async ({
  customerId,
  currency,
  installmentAmountMinor,
  productName,
  successUrl,
  cancelUrl,
  metadata = {},
}) => {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    payment_method_types: ['card', 'sepa_debit'],
    line_items: [{
      price_data: {
        currency: String(currency).toLowerCase(),
        unit_amount: installmentAmountMinor,
        product_data: { name: productName },
        recurring: { interval: 'month', interval_count: 1 },
      },
      quantity: 1,
    }],
    subscription_data: { metadata },
    metadata,
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
  });

  return session;
};

// Convierte la Subscription creada por el Checkout en un plan finito: la fase
// dura exactamente `installmentCount` meses y `end_behavior: 'cancel'` cancela
// la suscripcion tras la ultima cuota.
// `iterations` solo se acepta al crear; en update hay que usar `duration`
// anclado con `start_date`. Ademas es reentrante porque Stripe rechaza migrar
// una Subscription que ya tiene schedule y el webhook puede reintentarse.
export const attachFiniteSubscriptionSchedule = async ({ subscriptionId, installmentCount }) => {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const existingScheduleId = typeof subscription.schedule === 'string'
    ? subscription.schedule
    : subscription.schedule?.id;

  const schedule = existingScheduleId
    ? await stripe.subscriptionSchedules.retrieve(existingScheduleId)
    : await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId });

  if (schedule.end_behavior === 'cancel') return schedule;

  const currentPhase = schedule.phases[0];
  const updated = await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: 'cancel',
    phases: [{
      items: currentPhase.items.map((item) => ({ price: item.price, quantity: item.quantity })),
      start_date: currentPhase.start_date,
      duration: { interval: 'month', interval_count: installmentCount },
    }],
  });

  return updated;
};

export const retrieveSubscription = async (subscriptionId) => stripe.subscriptions.retrieve(subscriptionId);
export const retrieveInvoice = async (invoiceId) => stripe.invoices.retrieve(invoiceId);

// `payment_method_types` solo lista los metodos ofrecidos, no el usado. El tipo
// real solo esta en el Charge liquidado, por eso hay que resolverlo contra Stripe.
const paymentMethodTypeFromIntent = async (paymentIntentId) => {
  if (!paymentIntentId) return null;
  const id = typeof paymentIntentId === 'string' ? paymentIntentId : paymentIntentId.id;
  const intent = await stripe.paymentIntents.retrieve(id, { expand: ['latest_charge'] });
  return intent?.latest_charge?.payment_method_details?.type
    || intent?.payment_method_types?.[0]
    || null;
};

export const resolveSessionPaymentMethodType = async (session) => {
  try {
    const resolved = await paymentMethodTypeFromIntent(session?.payment_intent);
    if (resolved) return resolved;
  } catch (error) {
    console.error('Could not resolve payment method type from Stripe:', error.message);
  }
  return session?.payment_method_types?.[0] || 'unknown';
};

export const resolveInvoicePaymentMethodType = async (invoice) => {
  try {
    const resolved = await paymentMethodTypeFromIntent(invoice?.payment_intent);
    if (resolved) return resolved;
  } catch (error) {
    console.error('Could not resolve payment method type from Stripe invoice:', error.message);
  }
  return 'sepa_debit';
};

export const resolveInvoiceSubscriptionId = (invoice) => {
  if (!invoice || typeof invoice !== 'object') return null;

  const fromInvoice = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription?.id || null;

  if (fromInvoice) return fromInvoice;

  const parentType = invoice.parent?.type;
  const parentSubscription = invoice.parent?.subscription_details?.subscription;
  if (parentType === 'subscription_details') {
    return typeof parentSubscription === 'string'
      ? parentSubscription
      : parentSubscription?.id || null;
  }

  return null;
};

export const createStripeCoupon = async ({ promotionId, promotionType, percentage, amountMinor, currency }) => {
  const couponPayload = {
    duration: "once",
    metadata: { promotion_id: String(promotionId) },
  };

  if (promotionType === "PERCENTAGE_DISCOUNT") {
    couponPayload.percent_off = Number(percentage);
  } else {
    couponPayload.amount_off = Number(amountMinor);
    couponPayload.currency = String(currency).toLowerCase();
  }

  return stripe.coupons.create(couponPayload);
};

export const listsProducts = async () => {
  const products = await stripe.products.list({
    limit: 10,
  })
  console.log('Products:', products.data)
  return products.data;
}

export const updateStripeProduct = async ({ productId, name, description, active = true }) => {
  return stripe.products.update(productId, {
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    active,
  });
};

export const createStripePrice = async ({ productId, price, is_recurrent = false }) => {
  return stripe.prices.create({
    unit_amount: Math.round(Number(price) * 100),
    currency: 'eur',
    product: productId,
    ...(is_recurrent
      ? {
          recurring: {
            interval: 'month'
          }
        }
      : {}),
  });
};