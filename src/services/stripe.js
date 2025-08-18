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