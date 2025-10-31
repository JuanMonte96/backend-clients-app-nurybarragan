import dotenv from 'dotenv'
import Stripe from 'stripe'

dotenv.config()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createProduct = async (product) => {
    try {
        const { name, description, price } = product;

        const stripeProduct = await stripe.products.create({
            name,
            description,
            metadata: {
                package_id: product.id
            }
        });

        const stripePrice = await stripe.prices.create({
            unit_amount: price *100,
            currency: 'eur',
            product: stripeProduct.id,
        })

        return { stripeProduct, stripePrice };

    } catch (error) {
        console.error("Error creating product:", error);
        throw error;
    }
}

export const createCheckoutSession = async (priceId, customerData, successUrl, cancelUrl) => {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card','paypal'],
    line_items: [{
      price: priceId,
      quantity: 1
    }],
    mode: 'payment',
    customer_email: customerData.email,
    metadata: {
      name: customerData.name,
      custom_id: customerData.custom_id,
      telephone: customerData.telephone
    },
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
  });

  return session;
};