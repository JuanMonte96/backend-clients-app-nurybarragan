import { db } from "../models/db.js";

export const createsubscription = async (user, payment, session) => {
    try{
        const id_user = user.id;
        const id_package = session.metadata.custom_id;
        const id_payment = payment.id;

        const packageSubscribed = await db.Package.findByPk(id_package);

        if (!packageSubscribed){
            throw new Error('Paquete no encontrado');
        };

        const start_date = new Date(session.created * 1000);
        const daysDuration = packageSubscribed.duration_package;
        const end_date = new Date(start_date);
        end_date.setDate(end_date.getDate() + daysDuration);

        const newSubscription = await db.Subscription.create({
            id_user,
            id_package,
            start_date,
            end_date,
            id_payment,
            status: 'active',
        })
        
        return newSubscription;

    }
    catch(error){
        console.error("Error creating subscription:", error.message);
    }
}