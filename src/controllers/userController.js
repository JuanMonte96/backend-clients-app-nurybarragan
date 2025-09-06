import { db } from "../models/db.js";

export const createUser = async (session)=> {

    const email = session.customer_email;
    const name = session.metadata.name;
    const package_id = session.metadata.package_id

    let user = await db.User.findOne({where:{email}});

    if (!user) {
        // Crear usuario en la base de datos
        user = await db.User.create({
            name, 
            email,
            password:'temporal123',
            role:'student'
        });
        
        return ({
            user
        })
    }

    return {
        message: 'user ya existe'
    }
}