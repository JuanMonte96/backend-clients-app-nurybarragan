import dotenv from 'dotenv'
import Stripe from 'stripe'

dotenv.config()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
    payment_method_types: ['card'],
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