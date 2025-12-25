import { createCheckoutSession } from "../services/stripe.js";
import {db} from '../models/db.js';
import dotenv from 'dotenv'

dotenv.config();

const URL_BASE = process.env.URL_FRONTEND_BASE

export const startPayment = async (req, res) => {
    try {
        const {stripe_price_id, name, email, id_package, telephone} = req.body; 

        const session = await createCheckoutSession(
            stripe_price_id,
            {
                name,
                email,
                custom_id:id_package,
                telephone
            },
            `${URL_BASE}/login`,
            URL_BASE
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

export const createPayment = async (user,session) =>{
    try {
        const id_user = user.id;
        const amount = session.amount_total/100;
        const external_ref = session.id;
        const method = session.payment_method_types[0];
        const id_package = session.metadata.custom_id;

        const newPayment = await db.Payment.create({
            id_user,
            id_package,
            payment_amount: amount,
            method,
            external_ref
        });

        console.log(newPayment);
        return ({
            id: newPayment.id_payment,
            id_user: newPayment.id_user,
            package_id: newPayment.id_package,
            amount: newPayment.payment_amount,
            method: newPayment.method,
            external_ref: newPayment.external_ref
        });

    } catch (error) {
        throw new Error(`Error creating Payment: ${error.message}`);
    }
}