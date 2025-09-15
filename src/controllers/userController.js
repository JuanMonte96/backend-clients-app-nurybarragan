import { db } from "../models/db.js";
import { generateToken } from "../services/Jwt.js";
import { createTempPassword } from "../services/password.js";
import bcryt from 'bcrypt';

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

export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await db.User.findOne({ where: { email_user: email } });
        if (!user) {
            return res.status(404).json({
                status: 'Not Found',
                message: 'User not found'
            })
        };

        const isValidPassword = await bcryt.compare(password, user.password_user);
        if (!isValidPassword) {
            return res.status(401).json({
                status: 'Unauthorized',
                message: 'Invalid password'
            });
        }

        const payload = {
            id: user.id_user,
            email: user.email_user,
            role: user.role
        }

        const token = generateToken(payload);

        return res.status(200).json({
            status: 'success',
            message: 'Login Successful',
            token
        })


    } catch (error) {
        return res.status(500).json({
            status: 'error',
            message: `Internal Server Error: ${error.message}`
        })
    }
}

export const getAllUsers = async (req, res) => {
    try {
        // obtener page y limit de query params con valores por defecto
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 2;
        const offset = (page - 1) * limit;

        // consulta paginada
        console.log(db.User.getAttributes());

        const { count, rows } = await db.User.findAndCountAll({
            attributes: ["id_user", "name_user", "email_user", "role","medical_certificated","is_blocked","created_at"], // selecciona columnas necesarias
            limit,
            offset
        });

        return res.status(200).json({
            total: count,
            page,
            pages: Math.ceil(count / limit),
            users: rows
        });
    } catch (error) {
        return res.status(500).json({ message: "Error al obtener usuarios", error: error.message });
    }
};