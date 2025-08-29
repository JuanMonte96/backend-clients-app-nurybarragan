import { db } from "../models/db.js";

export const createUser = (session)=> {

    const params = session;

    if (params.names) {
        // Crear usuario en la base de datos
    }

    return {
        status: 'success',
        message: 'Prueba create user'
    }
}