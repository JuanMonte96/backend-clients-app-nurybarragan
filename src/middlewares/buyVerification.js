import { db } from '../models/db.js';

export const userVerificationPackageBuy = async (req, res, next) => {
    try {
        const { email, id_package} = req.validatedPayment;

        const pkg = await db.Package.findByPk(id_package);

        if (!pkg) {
            return res.status(404).json({
                status: 'Not Found',
                message: 'Package not found'
            });
        }

        if (!pkg.is_recurrent) {
            const user = await db.User.findOne({ where: { email_user: email } });

            if (user) {
                const existingPayment = await db.Payment.findOne({
                    where: { id_user: user.id_user, id_package }
                });

                if (existingPayment) {
                    return res.status(403).json({
                        status: 'Forbidden',
                        message: 'You have already purchased this package'
                    });
                }
            }
        }

        next();
    } catch (error) {
        return res.status(500).json({
            status: 'Error',
            message: 'Internal server error'
        });
    }
}