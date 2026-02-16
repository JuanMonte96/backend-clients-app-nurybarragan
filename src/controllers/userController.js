import { db } from "../models/db.js";
import { generateToken } from "../services/Jwt.js";
import { createTempPassword } from "../services/password.js";
import bcrypt from 'bcrypt';
import { Op } from "sequelize";
import { sendEmail, sendEmailApiGmail } from "../services/sendEmail.js";
import { DateTime } from "luxon";


export const createUser = async (session) => {

    const email_user = session.customer_email;
    const name_user = session.metadata.name;
    const telephone_user = session.metadata.telephone;

    let user = await db.User.findOne({ where: { email_user } });

    if (!user) {
        const { tempPassword, hashedPassword } = await createTempPassword();
        // Crear usuario en la base de datos
        user = await db.User.create({
            name_user,
            email_user,
            telephone_user,
            password_user: hashedPassword,
            role: 'student'
        });

        return ({
            id: user.id_user,
            nombre: user.name_user,
            email: user.email_user,
            telephone: user.telephone_user,
            password: tempPassword,
            message: 'user created'
        })
    }

    return {
        id: user.id_user,
        nombre: user.name_user,
        telefono: user.telephone_user,
        email: user.email_user,
        message: 'user already exists'
    }
}

export const loginUser = async (req, res) => {
    try {
        const { password } = req.body;

        const { email, timezone } = req.validateUserData;

        const user = await db.User.findOne({ where: { email_user: email } });

        if (!user){
            return res.status(404).json({
                status: 'not Found',
                message: 'User not found with this email'
            })
        }

        const isValidPassword = await bcrypt.compare(password, user.password_user);

        let userTimezone = user.time_zone || 'UTC';

        if (timezone && DateTime.local().setZone(timezone).isValid && user.time_zone !== timezone) {
            await db.User.update(
                { time_zone: timezone },
                { where: { id_user: user.id_user } }
            );
            userTimezone = timezone;
        }

        if (!isValidPassword) {
            return res.status(401).json({
                status: 'Unauthorized',
                message: 'Invalid password'
            });
        };
        const payload = {
            id: user.id_user,
            name: user.name_user,
            email: user.email_user,
            role: user.role,
            must_change_pass: user.must_change_pass,
            timezone: userTimezone
        };

        if (!user) {
            return res.status(404).json({
                status: 'Not Found',
                message: 'User not found'
            })
        };

        if (user.role === 'student') {
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

            const token = generateToken(payload);

            return res.status(200).json({
                status: 'success',
                message: 'Login Successful',
                token,
                user: {
                    id: user.id_user,
                    name: user.name_user,
                    email: user.email_user,
                    role: user.role,
                    must_change_pass: user.must_change_pass,
                    timezone: userTimezone
                }
            });
        }
        if (user.is_blocked) {
            return res.status(403).json({
                status: 'Forbiden',
                message: 'Your account is blocked, please contact to admin'
            })
        }

        const token = generateToken(payload);

        return res.status(200).json({
            status: 'success',
            message: 'Login Successful',
            token,
            user: {
                id: user.id_user,
                name: user.name_user,
                email: user.email_user,
                role: user.role,
                must_change_pass: user.must_change_pass,
                timezone: userTimezone
            }
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
            attributes: ["id_user", "name_user", "email_user", "telephone_user", "role", "medical_certificated", "is_blocked", "time_zone", "created_at"], // selecciona columnas necesarias
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
                attributes: ["id_user", "name_user", "email_user", "telephone_user", "role", "medical_certificated", "is_blocked", "time_zone", "created_at"]
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
            attributes: ["id_user", "name_user", "email_user", "telephone_user", "role", "medical_certificated", "is_blocked", "time_zone", "created_at"]
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
            user: user,
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
        const { currentPassword } = req.body;
        const { password } = req.validatePasswordData;

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

        const hashedPassword = await bcrypt.hash(password, 10);

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

        const { name_user, email_user, phone } = req.body;

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
        if (phone) user.telephone_user = phone

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

export const getUserClassCounts = async (req, res) => {
    try {
        const id_user = req.params.id_user || req.user.id;

        // Permissions: admin/teacher can request any user, others only their own
        if (req.user.role !== 'admin' && req.user.role !== 'teacher' && req.user.id !== id_user) {
            return res.status(403).json({
                status: 'Forbidden',
                message: 'Dont have permission to see this information'
            });
        }

        const user = await db.User.findByPk(id_user, {
            include: [
                {
                    model: db.Subscription,
                    where: { status: 'active' },
                    required: false,
                    include: [{ model: db.Package, attributes: ['class_limit'] }]
                }
            ]
        });

        if (!user) {
            return res.status(404).json({ status: 'Not Found', message: 'User not found' });
        }

        const activeSubscriptions = user.Subscriptions || [];
        const totalClassLimit = activeSubscriptions.reduce((sum, s) => sum + ((s.Package && s.Package.class_limit) || 0), 0);

        const classesUsed = await db.Attendance.count({
            where: { id_user, status: ['attended', 'no_show'] }
        });

        const classesRemaining = Math.max(0, totalClassLimit - classesUsed);

        return res.status(200).json({
            status: 'Success',
            totalClassLimit,
            classesUsed,
            classesRemaining,
            activeSubscriptions: activeSubscriptions.length
        });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: `Internal Server Error: ${error.message}` });
    }
}

export const createAdminUser = async (req, res) => {
    try {
        const { name, email, phone, role } = req.body;

        await db.User.findOne({ where: { email_user: email } }).then(existingUser => {
            if (existingUser) {
                return res.status(400).json({
                    status: 'Bad Request',
                    message: 'User with this email already exists'
                });
            }
        });

        const { tempPassword, hashedPassword } = await createTempPassword();

        const user = await db.User.create({
            name_user: name,
            email_user: email,
            telephone_user: phone,
            password_user: hashedPassword,
            role: role
        })

        if (!user) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'User could not be created'
            });
        }

        await sendEmailApiGmail(email, name, tempPassword);

        return res.status(201).json({
            status: 'Created',
            message: 'User created successfully',
            user: {
                id_user: user.id_user,
                name_user: user.name_user,
                email_user: user.email_user,
                telephone_user: user.telephone_user,
                role: user.role
            }
        });
    } catch (error) {
        return res.status(500).json({
            status: 'Server Error',
            message: 'Internal Server Error'
        });
    }
};

export const uploadMedicalCertificate = async (req, res) => {
    try {
        const userId = req.user.id;

        if (!req.file) {
            return res.status(400).json({
                status: "Bad Request",
                message: "The file it has been not send it"
            })
        };

        const medicalCertifcate = req.file.filename

        await db.User.update({
            medical_certificated: medicalCertifcate
        },
            { where: { id_user: userId } }
        )

        return res.status(200).json({
            status: "Success",
            message: "Medical Certifacte upload correctly",
            certificated: medicalCertifcate
        })


    } catch (error) {
        return res.status(500).json({
            status: "internal server error",
            message: `There was an error:${error.message}`
        })
    }
}