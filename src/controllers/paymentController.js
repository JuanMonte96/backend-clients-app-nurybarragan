import { createCheckoutSession } from "../services/stripe.js";


export const startPayment = async (req, res) => {
    try {
        const {stripe_price_id, name, email, id_package} = req.body; 

        const session = await createCheckoutSession(
            stripe_price_id,
            name,
            email,
            id_package,
            'http://localhost:3000/success',
            'http://localhost:3000/cancel'
        );
        res.status(200).json({
            status: 'Success',
            url: session.url
        })

    } catch (error) {
        
        res.status(500).json({ 
            status: 'Internal Server Error',
            message: error.message 
        });
    }
}