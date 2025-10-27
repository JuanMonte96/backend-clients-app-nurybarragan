import { db } from "../models/db.js";
import { generateToken } from "../services/Jwt.js";
import { createTempPassword } from "../services/password.js";
import bcrypt from 'bcrypt';
import { Op } from "sequelize";

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
            password: tempPassword,
            message: 'user created'
        })
    }

    return {
        id: user.id_user,
        nombre: user.name_user,
        email: user.email_user,
        message: 'user already exists'
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

        const isValidPassword = await bcrypt.compare(password, user.password_user);
        if (!isValidPassword) {
            return res.status(401).json({
                status: 'Unauthorized',
                message: 'Invalid password'
            });
        };

        const t = await db.sequelize.transaction();

        const now = new Date();

        await db.Subscription.update(
            { status: 'expired' },
            {
                where: {
                    id_user: user.id_user,
                    status: 'active',
                    end_date: { [Op.lte]: now },
                },
                transaction: t
            }
        );

        const activeSubscription = await db.Subscription.count(
            {
                where: {
                    id_user: user.id_user,
                    status: 'active',
                    end_date: { [Op.gt]: now },
                },
                transaction: t,
            }
        );

        if (!activeSubscription) {
            if (!user.is_blocked) {
                await db.User.update(
                    { is_blocked: true },
                    { where: { id_user: user.id_user }, transaction: t }
                );
            }
            await t.commit();
            return res.status(403).json({
                status: 'Forbiden',
                message: 'Your subscription has expired, please contact to admin or buy a new subscription '
            })
        } else if (user.is_blocked) {
            await db.User.update(
                { is_blocked: false },
                { where: { id_user: user.id_user }, transaction: t }
            );
        }

        await t.commit();

        const payload = {
            id: user.id_user,
            email: user.email_user,
            role: user.role,
            must_change_pass: user.must_change_pass
        };

        const token = generateToken(payload);

        return res.status(200).json({
            status: 'success',
            message: 'Login Successful',
            token, 
            user: {
                id:user.id_user,
                name:user.name_user,
                email:user.email_user,
                role:user.role,
                must_change_pass: user.must_change_pass
            }
        });


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
            attributes: ["id_user", "name_user", "email_user", "role", "medical_certificated", "is_blocked", "created_at"], // selecciona columnas necesarias
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

export const profileUser = async (req, res) => {
    try {
        const { id_user } = req.params;
        if (req.user.role === 'admin' || req.user.role === 'teacher') {
            const user = await db.User.findByPk(id_user, {
                attributes: ["id_user", "name_user", "email_user", "role", "medical_certificated", "is_blocked", "created_at"]
            })
            if (!user) {
                return res.status(404).json({
                    status: 'Not Found',
                    message: 'User not found'
                })
            }
            const subscriptionByUser = await db.Subscription.findAll({
                where: { id_user: id_user },
                include: [{
                    model: db.Package,
                    attributes: ["name_package", "description_package", "duration_package", "class_limit"]
                }]

            });
            return res.status(200).json({
                status: 'success',
                message: 'User profile',
                user,
                subscriptionByUser
            });
        }
        if (req.user.id !== id_user) {
            return res.status(403).json({
                status: 'Forbiden',
                message: 'Dont have permission to see this profile'
            })
        }
        const user = await db.User.findByPk(id_user, {
            attributes: ["id_user", "name_user", "email_user", "role", "medical_certificated", "is_blocked", "created_at"]
        })
        const subscriptionByUser = await db.Subscription.findAll({
            where: { id_user: id_user },
            include: [{
                model: db.Package,
                attributes: ["name_package", "description_package", "duration_package", "class_limit"]
            }]
        });
        return res.status(200).json({
            status: 'success',
            message: 'User profile',
            user: req.user,
            subscriptionByUser
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: `Internal Server Error: ${error.message}`
        })
    }
};

export const changePassword = async (req, res) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        const user = await db.User.findByPk(userId);

        if (!user) {
            return res.status(404).json({
                status: 'Not Found',
                message: 'user does not exist'
            });
        }

        const valid = await bcrypt.compare(currentPassword, user.password_user);
        if (!valid) {
            return res.status(401).json({
                status: 'unauthorized',
                message: 'current password is incorrect'
            })
        };

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        user.password_user = hashedPassword;
        user.must_change_pass = false;

        await user.save();

        return res.status(200).json({
            status: 'success',
            message: 'Password changed successfully'
        })

    } catch (error) {
        return res.status(500).json({
            status: 'error',
            message: `Internal Server Error: ${error.message}`
        })
    }
};

export const editUser = async (req, res) => {
    try {
        const { id_user } = req.params;

        const { name_user, email_user, password_user } = req.body;

        const user = await db.User.findByPk(id_user);

        if (!user) {
            return res.status(404).json({
                status: 'Not Found',
                message: 'User not found'
            });
        }
        if (id_user !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                status: 'Forbiden',
                message: 'Dont have permission to edit this profile'
            });
        }

        if (name_user) user.name_user = name_user;
        if (email_user) user.email_user = email_user;
        if (password_user) {
            const hashedPassword = await bcrypt.hash(password_user, 10);
            user.password_user = hashedPassword;
            user.must_change_pass = false;
        }

        await user.save();

        return res.status(200).json({
            status: 'success',
            message: 'User updated successfully',
            user
        });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            message: `Internal Server Error: ${error.message}`
        });
    }
};

export const blockUser = async (req, res) => {
    try {
        const { id_user } = req.params;

        if (req.user.id !== id_user && req.user.role !== 'admin') {
            return res.status(403).json({
                status: 'Forbidden',
                message: 'You do not have permission to block this user'
            });
        }

        const user = await db.User.findByPk(id_user);
        const subscriptionByUser = await db.Subscription.findAll({
            where: { id_user: id_user, status: 'active' }
        })

        if (!user) return res.status(404).json({
            status: 'Not found',
            message: 'User not found'
        });

        user.is_blocked = true;
        // Cancel all active subscriptions for this user
        for (const sub of subscriptionByUser) {
            sub.status = 'cancelled';
            await sub.save();
        }

        await user.save();

        return res.status(200).json({
            status: 'success',
            message: 'User blocked successfully',
            name: user.name_user
        });


    } catch (error) {
        return res.status(500).json({
            status: 'error',
            message: `Internal Server Error: ${error.message}`
        })
    }
};