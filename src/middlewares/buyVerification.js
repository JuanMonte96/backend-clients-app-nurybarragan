import { db } from '../models/db.js';
import { getMaxInstallmentsForPackage } from '../constants/paymentPlan.js';

export const userVerificationPackageBuy = async (req, res, next) => {
    try {
        const { email, id_package } = req.validatedPayment;

        const pkg = await db.Package.findByPk(id_package);

        if (!pkg) {
            return res.status(404).json({
                status: 'Not Found',
                message: 'Package not found'
            });
        }

        if (!pkg.availabilty) {
            return res.status(409).json({
                status: 'Conflict',
                message: 'Package is not available for purchase'
            });
        }

        if (!pkg.stripe_price_id) {
            return res.status(409).json({
                status: 'Conflict',
                message: 'Package does not have a valid Stripe price configured'
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

    req.validatedPackage = pkg;
        next();
    } catch (error) {
        return res.status(500).json({
            status: 'Error',
            message: 'Internal server error'
        });
    }
}

export const userVerificationPaymentPlanBuy = async (req, res, next) => {
    try {
        const { email, id_package, installment_count } = req.validatedPayment;

        const pkg = await db.Package.findByPk(id_package);
        if (!pkg) {
            return res.status(404).json({ status: 'Not Found', message: 'Package not found' });
        }
        if (!pkg.availabilty) {
            return res.status(409).json({ status: 'Conflict', message: 'Package is not available for purchase' });
        }

        const maxInstallmentsAllowed = getMaxInstallmentsForPackage(pkg);
        if (installment_count > maxInstallmentsAllowed) {
            return res.status(409).json({
                status: 'Conflict',
                message: `Installment count exceeds the maximum allowed for this package duration (${maxInstallmentsAllowed})`,
            });
        }

        // El cliente final elige las cuotas; la opcion se materializa bajo demanda
        // porque payment_plans.id_payment_option es NOT NULL en el esquema.
        const [paymentOption] = await db.PackagePaymentOption.findOrCreate({
            where: { id_package, installment_count },
            defaults: {
                id_package,
                payment_mode: 'INSTALLMENTS',
                installment_count,
                interval_unit: 'MONTH',
                interval_count: 1,
                currency: 'eur',
                enabled: true,
            },
        });

        if (!paymentOption.enabled) {
            return res.status(409).json({ status: 'Conflict', message: 'Payment plan option is not available' });
        }

        if (!pkg.is_recurrent) {
            const user = await db.User.findOne({ where: { email_user: email } });
            if (user) {
                const existingPayment = await db.Payment.findOne({ where: { id_user: user.id_user, id_package } });
                if (existingPayment) {
                    return res.status(403).json({ status: 'Forbidden', message: 'You have already purchased this package' });
                }
            }
        }

        req.validatedPackage = pkg;
        req.validatedPaymentOption = paymentOption;
        next();
    } catch (error) {
        return res.status(500).json({ status: 'Error', message: 'Internal server error' });
    }
}