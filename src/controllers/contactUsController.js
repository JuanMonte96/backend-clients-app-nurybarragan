import { db } from "../models/db.js";
import { sendContactNotificacion } from "../services/sendEmail.js";

export const createContactEntry = async (req, res) => {
    try {
        const { name_client, email_client, telephone_client, subject, description } = req.validatedContact;

        const newContact = await db.Contact.create({
            name_client,
            email_client,
            telephone_client,
            subject,
            description
        })

        if(!newContact){
            return res.status(400).json({
                status: "Bad Request",
                message: "Failed to create a contact entry"
            })
        }

        await sendContactNotificacion(name_client, email_client, telephone_client, subject, description);

        return res.status(201).json({
            status: 'Success',
            message: 'Contact entry created Successfully',
            newContact
        })


    } catch (error) {
        return res.status(500).json({
            status: 'Internal Server Error',
            message: `Error creating contact entry: ${error}`
        })
    }
}