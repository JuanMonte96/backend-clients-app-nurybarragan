import { db } from "../models/db.js";
import { createTempPassword } from "../services/password.js";

export const createUser = async (session) => {

    const email_user = session.customer_email;
    const name_user = session.metadata.name;

    let user = await db.User.findOne({ where: { email_user } });

    if (!user) {
        const { tempPassword, hashedPassword } = await createTempPassword();
        // Crear usuario en la base de datos
        user = await db.User.create({
            name_user,
            email_user,
            password_user: hashedPassword,
            role: 'student'
        });

        return ({
            id: user.id_user,
            nombre: user.name_user,
            email: user.email_user,
            password: tempPassword
        })
    }
    return {
        id: user.id_user,
        nombre: user.name_user,
        email: user.email_user,
        message: 'user ya existe'
    }
}