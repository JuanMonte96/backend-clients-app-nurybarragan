import { db } from "../models/db.js";
import { generateToken } from "../services/Jwt.js";
import { createTempPassword } from "../services/password.js";
import bcrypt from 'bcrypt';
import { Op, cast, col, where as sqlWhere } from "sequelize";
import { sendEmail, sendEmailApiGmail } from "../services/sendEmail.js";
import { DateTime } from "luxon";
import crypto from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {s3Client, s3BucketName, s3CertificatesPrefix} from "../config/s3.js";

const DEFAULT_MEDICAL_CERTIFICATE = 'Defaultcertificate.pdf';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parsePagination = ({ page, limit }, defaultLimit = 10, maxLimit = 100) => {
    const parsedPage = Number.parseInt(page, 10);
    const parsedLimit = Number.parseInt(limit, 10);

    const finalPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const finalLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, maxLimit)
        : defaultLimit;

    return {
        page: finalPage,
        limit: finalLimit,
        offset: (finalPage - 1) * finalLimit
    };
};

const parseDateRange = (from, to) => {
    if (!from && !to) return null;

    const lower = from ? new Date(from) : null;
    const upper = to ? new Date(to) : null;

    if ((lower && Number.isNaN(lower.getTime())) || (upper && Number.isNaN(upper.getTime()))) {
        return { error: 'Invalid date format. Use ISO 8601 dates.' };
    }

    if (lower && upper) {
        return { value: { [Op.between]: [lower, upper] } };
    }

    if (lower) {
        return { value: { [Op.gte]: lower } };
    }

    return { value: { [Op.lte]: upper } };
};

const canAccessUserResource = (reqUser, targetUserId) => {
    return reqUser?.role === 'admin' || reqUser?.id === targetUserId;
};

const ensureValidTargetUser = (id_user) => {
    if (!id_user || !UUID_REGEX.test(id_user)) {
        return false;
    }
    return true;
};

const normalizeOriginalName = (filename) => {
    return filename
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9.-]/g, "_")
        .slice(0,150);
}

const safeDecodeURIComponent = (value) => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

const objectExistWithSameCheckName = async ({
    objectKey,
    checksum
}) => {
    try {
        const currentObject = await s3Client.send(
            new HeadObjectCommand({
                Bucket: s3BucketName,
                Key: objectKey
            })
        );

        return currentObject.Metadata?.sha256 === checksum;
    }catch (error) {
        const statusCode = error?.$metadata?.httpStatusCode;

        if (statusCode === 404){
            return false; 
        }
        throw error; 
    }
};

const getCertificateObjectInfo = async (objectKey) => {
    try {
        const headResponse = await s3Client.send(
            new HeadObjectCommand({
                Bucket: s3BucketName,
                Key: objectKey
            })
        );

        return {
            existsInStorage: true,
            contentType: headResponse.ContentType || null,
            size: headResponse.ContentLength || null,
            lastModified: headResponse.LastModified || null,
            metadata: headResponse.Metadata || {}
        };
    } catch (error) {
        const statusCode = error?.$metadata?.httpStatusCode;

        if (statusCode === 404 || error?.name === 'NotFound') {
            return {
                existsInStorage: false,
                contentType: null,
                size: null,
                lastModified: null,
                metadata: {},
                storageError: null
            };
        }

        const storageErrorName =
            error?.name ||
            error?.Code ||
            error?.code ||
            error?.message ||
            'StorageUnavailable';

        return {
            existsInStorage: null,
            contentType: null,
            size: null,
            lastModified: null,
            metadata: {},
            storageError: storageErrorName
        };
    }
};

const formatUserRowForAdmin = async (user) => {
    const [lastPayment, currentSubscription] = await Promise.all([
        db.Payment.findOne({
            where: { id_user: user.id_user },
            order: [['created_at', 'DESC']]
        }),
        db.Subscription.findOne({
            where: { id_user: user.id_user },
            order: [['created_at', 'DESC']]
        })
    ]);

    const packageIds = [
        lastPayment?.id_package,
        currentSubscription?.id_package
    ].filter(Boolean);

    let packageById = {};
    if (packageIds.length > 0) {
        const packages = await db.Package.findAll({
            attributes: ['id_package', 'name_package', 'price_package', 'is_recurrent'],
            where: { id_package: { [Op.in]: packageIds } }
        });

        packageById = packages.reduce((acc, item) => {
            const plain = item.toJSON();
            acc[String(plain.id_package)] = plain;
            return acc;
        }, {});
    }

    return {
        id_user: user.id_user,
        name_user: user.name_user,
        email_user: user.email_user,
        document_number: null,
        telephone_user: user.telephone_user,
        status: user.is_blocked ? 'blocked' : 'active',
        role: user.role,
        created_at: user.created_at,
        updated_at: user.update_at,
        medical_certificated: user.medical_certificated,
        current_subscription: currentSubscription
            ? {
                id_subscription: currentSubscription.id_subscription,
                status: currentSubscription.status,
                start_date: currentSubscription.start_date,
                end_date: currentSubscription.end_date,
                package: packageById[String(currentSubscription.id_package)] || null
            }
            : null,
        last_payment: lastPayment
            ? {
                id_payment: lastPayment.id_payment,
                payment_amount: lastPayment.payment_amount,
                method: lastPayment.method,
                external_ref: lastPayment.external_ref,
                created_at: lastPayment.created_at,
                package: packageById[String(lastPayment.id_package)] || null
            }
            : null
    };
};

export const getAdminUsersList = async (req, res) => {
    try {
        const {
            page,
            limit,
            search,
            name,
            email,
            role,
            user_status,
            subscription_status,
            registered_from,
            registered_to,
            paid_from,
            paid_to,
            sort_by = 'created_at',
            sort_order = 'DESC'
        } = req.query;

        const { page: currentPage, limit: pageSize, offset } = parsePagination({ page, limit }, 10, 50);

        const allowedSortFields = new Set(['created_at', 'name_user', 'email_user', 'role']);
        const finalSortBy = allowedSortFields.has(sort_by) ? sort_by : 'created_at';
        const finalSortOrder = String(sort_order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const whereUser = {};

        if (search) {
            whereUser[Op.or] = [
                { name_user: { [Op.iLike]: `%${search}%` } },
                { email_user: { [Op.iLike]: `%${search}%` } },
                sqlWhere(cast(col('telephone_user'), 'TEXT'), { [Op.iLike]: `%${search}%` })
            ];
        }

        if (name) {
            whereUser.name_user = { [Op.iLike]: `%${name}%` };
        }

        if (email) {
            whereUser.email_user = { [Op.iLike]: `%${email}%` };
        }

        if (role) {
            whereUser.role = role;
        }

        if (user_status) {
            if (user_status === 'active') whereUser.is_blocked = false;
            if (user_status === 'blocked') whereUser.is_blocked = true;
        }

        const registeredRange = parseDateRange(registered_from, registered_to);
        if (registeredRange?.error) {
            return res.status(400).json({
                status: 'Bad Request',
                message: registeredRange.error
            });
        }
        if (registeredRange?.value) {
            whereUser.created_at = registeredRange.value;
        }

        if (subscription_status) {
            const subscriptions = await db.Subscription.findAll({
                attributes: ['id_user'],
                where: { status: subscription_status },
                group: ['id_user']
            });

            const ids = subscriptions.map((item) => item.id_user);
            whereUser.id_user = ids.length ? { [Op.in]: ids } : { [Op.in]: ['00000000-0000-0000-0000-000000000000'] };
        }

        const paidRange = parseDateRange(paid_from, paid_to);
        if (paidRange?.error) {
            return res.status(400).json({
                status: 'Bad Request',
                message: paidRange.error
            });
        }

        if (paidRange?.value) {
            const payments = await db.Payment.findAll({
                attributes: ['id_user'],
                where: { created_at: paidRange.value },
                group: ['id_user']
            });

            const ids = payments.map((item) => item.id_user);

            if (whereUser.id_user?.[Op.in]) {
                const currentIds = whereUser.id_user[Op.in];
                const intersection = currentIds.filter((id) => ids.includes(id));
                whereUser.id_user = { [Op.in]: intersection.length ? intersection : ['00000000-0000-0000-0000-000000000000'] };
            } else {
                whereUser.id_user = ids.length ? { [Op.in]: ids } : { [Op.in]: ['00000000-0000-0000-0000-000000000000'] };
            }
        }

        const { count, rows } = await db.User.findAndCountAll({
            attributes: [
                'id_user',
                'name_user',
                'email_user',
                'telephone_user',
                'role',
                'medical_certificated',
                'is_blocked',
                'time_zone',
                'created_at',
                'update_at'
            ],
            where: whereUser,
            limit: pageSize,
            offset,
            order: [[finalSortBy, finalSortOrder]]
        });

        const users = await Promise.all(rows.map((row) => formatUserRowForAdmin(row)));

        return res.status(200).json({
            status: 'success',
            message: 'Users retrieved successfully',
            page: currentPage,
            limit: pageSize,
            total: count,
            pages: Math.ceil(count / pageSize),
            users
        });
    } catch (error) {
        return res.status(500).json({
            status: 'Internal Server Error',
            message: `Error retrieving admin users list: ${error.message}`
        });
    }
};

const getUserPaymentsData = async ({ id_user, page, limit, paid_from, paid_to }) => {
    const { page: currentPage, limit: pageSize, offset } = parsePagination({ page, limit }, 10, 100);
    const wherePayment = { id_user: String(id_user) };

    const paidRange = parseDateRange(paid_from, paid_to);
    if (paidRange?.value) {
        wherePayment.created_at = paidRange.value;
    }

    const { count, rows } = await db.Payment.findAndCountAll({
        where: wherePayment,
        order: [['created_at', 'DESC']],
        limit: pageSize,
        offset
    });

    const packageIds = rows.map((row) => row.id_package).filter(Boolean);
    let packageById = {};

    if (packageIds.length > 0) {
        const packages = await db.Package.findAll({
            attributes: ['id_package', 'name_package', 'price_package', 'category'],
            where: { id_package: { [Op.in]: packageIds } }
        });

        packageById = packages.reduce((acc, item) => {
            const plain = item.toJSON();
            acc[String(plain.id_package)] = plain;
            return acc;
        }, {});
    }

    const normalizedRows = rows.map((row) => {
        const payment = row.toJSON();
        return {
            ...payment,
            Package: packageById[String(payment.id_package)] || null
        };
    });

    return {
        page: currentPage,
        limit: pageSize,
        total: count,
        pages: Math.ceil(count / pageSize),
        rows: normalizedRows
    };
};

const getUserSubscriptionsData = async ({ id_user, page, limit }) => {
    const { page: currentPage, limit: pageSize, offset } = parsePagination({ page, limit }, 10, 100);

    const { count, rows } = await db.Subscription.findAndCountAll({
        where: { id_user: String(id_user) },
        order: [['created_at', 'DESC']],
        limit: pageSize,
        offset
    });

    const packageIds = rows.map((row) => row.id_package).filter(Boolean);
    const paymentIds = rows.map((row) => row.id_payment).filter(Boolean);

    let packageById = {};
    let paymentById = {};

    if (packageIds.length > 0) {
        const packages = await db.Package.findAll({
            attributes: ['id_package', 'name_package', 'price_package', 'duration_package', 'is_recurrent', 'category'],
            where: { id_package: { [Op.in]: packageIds } }
        });
        packageById = packages.reduce((acc, item) => {
            const plain = item.toJSON();
            acc[String(plain.id_package)] = plain;
            return acc;
        }, {});
    }

    if (paymentIds.length > 0) {
        const payments = await db.Payment.findAll({
            attributes: ['id_payment', 'payment_amount', 'method', 'external_ref', 'created_at'],
            where: { id_payment: { [Op.in]: paymentIds } }
        });
        paymentById = payments.reduce((acc, item) => {
            const plain = item.toJSON();
            acc[String(plain.id_payment)] = plain;
            return acc;
        }, {});
    }

    const normalizedRows = rows.map((row) => {
        const subscription = row.toJSON();
        return {
            ...subscription,
            Package: packageById[String(subscription.id_package)] || null,
            Payment: paymentById[String(subscription.id_payment)] || null
        };
    });

    return {
        page: currentPage,
        limit: pageSize,
        total: count,
        pages: Math.ceil(count / pageSize),
        rows: normalizedRows
    };
};

const getMedicalCertificateSummary = async ({ user }) => {
    const certificateKey = user.medical_certificated;

    if (!certificateKey || certificateKey === DEFAULT_MEDICAL_CERTIFICATE) {
        return {
            existsInDatabase: false,
            key: null,
            existsInStorage: false,
            contentType: null,
            size: null,
            uploadedAt: null,
            fileName: null
        };
    }

    const objectInfo = await getCertificateObjectInfo(certificateKey);
    const originalName = objectInfo.metadata?.['original-name']
        ? safeDecodeURIComponent(objectInfo.metadata['original-name'])
        : certificateKey.split('/').pop();

    return {
        existsInDatabase: true,
        key: certificateKey,
        existsInStorage: objectInfo.existsInStorage,
        storageError: objectInfo.storageError || null,
        contentType: objectInfo.contentType,
        size: objectInfo.size,
        uploadedAt: objectInfo.metadata?.['uploaded-at'] || objectInfo.lastModified,
        fileName: originalName
    };
};

export const getUserDetail = async (req, res) => {
    try {
        const { id_user } = req.params;

        if (!ensureValidTargetUser(id_user)) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'Invalid user id format'
            });
        }

        if (!canAccessUserResource(req.user, id_user)) {
            return res.status(403).json({
                status: 'Forbidden',
                message: 'You do not have permission to access this user detail'
            });
        }

        const user = await db.User.findByPk(id_user, {
            attributes: [
                'id_user',
                'name_user',
                'email_user',
                'telephone_user',
                'role',
                'medical_certificated',
                'is_blocked',
                'time_zone',
                'created_at',
                'update_at'
            ]
        });

        if (!user) {
            return res.status(404).json({
                status: 'Not Found',
                message: 'User not found'
            });
        }

        const [payments, subscriptions, certificate] = await Promise.all([
            getUserPaymentsData({
                id_user,
                page: req.query.payment_page,
                limit: req.query.payment_limit,
                paid_from: req.query.paid_from,
                paid_to: req.query.paid_to
            }),
            getUserSubscriptionsData({
                id_user,
                page: req.query.subscription_page,
                limit: req.query.subscription_limit
            }),
            getMedicalCertificateSummary({ user })
        ]);

        return res.status(200).json({
            status: 'success',
            message: 'User detail retrieved successfully',
            user,
            subscriptions,
            payments,
            medicalCertificate: certificate
        });
    } catch (error) {
        return res.status(500).json({
            status: 'Internal Server Error',
            message: `Error retrieving user detail: ${error.message}`
        });
    }
};

export const getUserPayments = async (req, res) => {
    try {
        const { id_user } = req.params;

        if (!ensureValidTargetUser(id_user)) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'Invalid user id format'
            });
        }

        if (!canAccessUserResource(req.user, id_user)) {
            return res.status(403).json({
                status: 'Forbidden',
                message: 'You do not have permission to access these payments'
            });
        }

        const user = await db.User.findByPk(id_user, { attributes: ['id_user'] });
        if (!user) {
            return res.status(404).json({ status: 'Not Found', message: 'User not found' });
        }

        const payments = await getUserPaymentsData({
            id_user,
            page: req.query.page,
            limit: req.query.limit,
            paid_from: req.query.paid_from,
            paid_to: req.query.paid_to
        });

        return res.status(200).json({
            status: 'success',
            message: 'Payments retrieved successfully',
            payments
        });
    } catch (error) {
        return res.status(500).json({
            status: 'Internal Server Error',
            message: `Error retrieving payments: ${error.message}`
        });
    }
};

export const getUserSubscriptions = async (req, res) => {
    try {
        const { id_user } = req.params;

        if (!ensureValidTargetUser(id_user)) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'Invalid user id format'
            });
        }

        if (!canAccessUserResource(req.user, id_user)) {
            return res.status(403).json({
                status: 'Forbidden',
                message: 'You do not have permission to access these subscriptions'
            });
        }

        const user = await db.User.findByPk(id_user, { attributes: ['id_user'] });
        if (!user) {
            return res.status(404).json({ status: 'Not Found', message: 'User not found' });
        }

        const subscriptions = await getUserSubscriptionsData({
            id_user,
            page: req.query.page,
            limit: req.query.limit
        });

        return res.status(200).json({
            status: 'success',
            message: 'Subscriptions retrieved successfully',
            subscriptions
        });
    } catch (error) {
        return res.status(500).json({
            status: 'Internal Server Error',
            message: `Error retrieving subscriptions: ${error.message}`
        });
    }
};

export const getMedicalCertificateSignedUrl = async (req, res) => {
    try {
        const { id_user } = req.params;

        if (!ensureValidTargetUser(id_user)) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'Invalid user id format'
            });
        }

        if (!canAccessUserResource(req.user, id_user)) {
            return res.status(403).json({
                status: 'Forbidden',
                message: 'You do not have permission to view this certificate'
            });
        }

        const user = await db.User.findByPk(id_user, {
            attributes: ['id_user', 'medical_certificated']
        });

        if (!user) {
            return res.status(404).json({
                status: 'Not Found',
                message: 'User not found'
            });
        }

        const certificateKey = user.medical_certificated;

        if (!certificateKey || certificateKey === DEFAULT_MEDICAL_CERTIFICATE) {
            return res.status(404).json({
                status: 'Not Found',
                message: 'Medical certificate not found for this user'
            });
        }

        const objectInfo = await getCertificateObjectInfo(certificateKey);
        if (objectInfo.storageError) {
            return res.status(503).json({
                status: 'Service Unavailable',
                message: 'Medical certificate storage service is currently unavailable'
            });
        }

        if (!objectInfo.existsInStorage) {
            return res.status(404).json({
                status: 'Not Found',
                message: 'Medical certificate key exists in database but object was not found in storage'
            });
        }

        let signedUrl;
        try {
            signedUrl = await getSignedUrl(
                s3Client,
                new GetObjectCommand({
                    Bucket: s3BucketName,
                    Key: certificateKey
                }),
                { expiresIn: 60 * 5 }
            );
        } catch {
            return res.status(503).json({
                status: 'Service Unavailable',
                message: 'Medical certificate storage service is currently unavailable'
            });
        }

        return res.status(200).json({
            status: 'success',
            message: 'Signed URL generated successfully',
            certificate: {
                key: certificateKey,
                url: signedUrl,
                expiresInSeconds: 300,
                contentType: objectInfo.contentType,
                size: objectInfo.size,
                uploadedAt: objectInfo.metadata?.['uploaded-at'] || objectInfo.lastModified
            }
        });
    } catch (error) {
        return res.status(500).json({
            status: 'Internal Server Error',
            message: `Error generating medical certificate signed URL: ${error.message}`
        });
    }
};


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
            };

            return res.status(200).json({
                status: 'success',
                message: 'User profile',
                user
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
                attributes: ["name_package", "description_english", "description_spanish", "description_french", "duration_package", "class_limit"]
            }]
        });
        return res.status(200).json({
            status: 'success',
            message: 'User profile',
            user: user,
            subscriptionByUser: subscriptionByUser
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
    try{
        const userId = req.user?.id; 

        if(!userId){
            return res.status(401).json({
                status: 'Unauthorized',
                message:'Authenticated user was not found'
            })
        }

        if(!req.file){
            return res.status(400).json({
                status:'Bad Request',
                message:'The certificated file was not sent'
            })
        }

        const objectKey = `${s3CertificatesPrefix}/${userId}/medical-certificate`;

        const checksumSha256 = crypto
                .createHash("sha256")
                .update(req.file.buffer)
                .digest("hex");

        const uploadedAt = new Date().toISOString();

        const sameFileAlreadyExits = await objectExistWithSameCheckName({
            objectKey,
            checksum: checksumSha256
        });

        if(!sameFileAlreadyExits){
            const originalname = normalizeOriginalName(
                req.file.originalname
            );

            await s3Client.send( new PutObjectCommand(
                {
                    Bucket: s3BucketName,
                    Key: objectKey,
                    Body: req.file.buffer,
                    ContentType: req.file.mimetype,
                    ContentDisposition: `attachment; filename = "${originalname}"`,
                    Metadata: {
                        "user-id": String(userId),
                        "uploaded-by": String(userId),
                        "document-type": "medical-certificate",
                        "original-name": encodeURIComponent(
                            req.file.originalname
                        ),
                        "uploaded-at": uploadedAt,
                        "sha256": checksumSha256 
                    },
                    ServerSideEncryption: "AES256"
                })
        )};

        const [updatedRows] = await db.User.update(
            {
                medical_certificated: objectKey
            },
            {
                where: {id_user: userId}
            }
        );

        if(updatedRows === 0){
            return res.status(404).json({
                status: 'Not Found',
                message: 'user not found'
            })
        }

        return res.status(200).json({
            status: 'Success',
            message: sameFileAlreadyExits ? 'Medical certificate already exists, updated metadata' : 'Medical certificate uploaded successfully',
            certificate: {
                key: objectKey,
                originalName: req.file.originalname,
                contentType: req.file.mimetype,
                size: req.file.size,
                checksum: checksumSha256,
                uploadedAt,
                replaced: !sameFileAlreadyExits
            }
        });

    }catch(error){
        console.error('Error uploading medical certificate',{
            name: error.name,
            message: error.message,
            statusCode: error.$metadata?.httpStatusCode
        });

        return res.status(500).json({
            status:'Internal Server Error',
            message: `There was an error uploading the medical certificate: ${error.message}`
        })
    }
    
    // try {
    //     const userId = req.user.id;

    //     if (!req.file) {
    //         return res.status(400).json({
    //             status: "Bad Request",
    //             message: "The file it has been not send it"
    //         })
    //     };

    //     const medicalCertifcate = req.file.filename

    //     await db.User.update({
    //         medical_certificated: medicalCertifcate
    //     },
    //         { where: { id_user: userId } }
    //     )

    //     return res.status(200).json({
    //         status: "Success",
    //         message: "Medical Certifacte upload correctly",
    //         certificated: medicalCertifcate
    //     })


    // } catch (error) {
    //     return res.status(500).json({
    //         status: "internal server error",
    //         message: `There was an error:${error.message}`
    //     })
    // }
}

