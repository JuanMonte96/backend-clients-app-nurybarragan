import { createCheckoutSession } from "../services/stripe.js";
import {db} from '../models/db.js';


export const startPayment = async (req, res) => {
    try {
        const {stripe_price_id, name, email, id_package} = req.body; 

        const session = await createCheckoutSession(
            stripe_price_id,
            {
                name,
                email,
                custom_id:id_package
            },
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
};

export const createPayment = (user,session) =>{
    try {
        const id_user = user.id;
        const amount = session.amount_total/100;
        const external_ref = session.id;
        const method = session.payment_method_types[0];

    } catch (error) {
        
    }
}