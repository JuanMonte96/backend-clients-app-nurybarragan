import { createCheckoutSession, createOrGetStripeCustomer, createPaymentPlanCheckoutSession } from "../services/stripe.js";
import { db } from '../models/db.js';
import dotenv from 'dotenv'
import { buildPromotionQuote, createPendingRedemption } from "../services/promotionService.js";
import { createPendingPaymentPlan } from "../services/paymentPlanService.js";
import { PURCHASE_ORDER_STATUS } from "../constants/promotion.js";
import { PAYMENT_PLAN_STATUS } from "../constants/paymentPlan.js";

dotenv.config();

const URL_BASE = process.env.URL_FRONTEND_BASE

export const startPayment = async (req, res) => {
    try {
        // Los datos ya vienen validados desde el middleware
        const { name, email, id_package, telephone } = req.validatedPayment;
        const stripePriceId = req.validatedPackage?.stripe_price_id;

        if (!stripePriceId) {
            return res.status(409).json({
                status: 'Conflict',
                message: 'Package does not have a valid Stripe price configured'
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const user = await db.User.findOne({ where: { email_user: normalizedEmail } });
        const transaction = await db.sequelize.transaction();
        let purchaseOrder;
        let redemption;
        let quote;

        try {
            quote = await buildPromotionQuote({
                packageData: req.validatedPackage,
                userId: user?.id_user || null,
                email: normalizedEmail,
                transaction,
            });

            purchaseOrder = await db.PurchaseOrder.create({
                id_user: user?.id_user || null,
                id_package,
                id_promotion: quote.promotion?.id_promotion || null,
                email: normalizedEmail,
                normalized_email: normalizedEmail,
                currency: quote.currency,
                price_before_minor: quote.priceBeforeMinor,
                discount_amount_minor: quote.discountAmountMinor,
                price_after_minor: quote.priceAfterMinor,
                status: PURCHASE_ORDER_STATUS.PENDING,
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
            }, { transaction });

            redemption = await createPendingRedemption({
                promotion: quote.promotion,
                packageData: req.validatedPackage,
                purchaseOrder,
                email: normalizedEmail,
                quote,
                transaction,
            });

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            if (error?.name === "SequelizeUniqueConstraintError") {
                return res.status(409).json({ status: "Conflict", message: "This promotion is already being used or has already been used" });
            }
            throw error;
        }

        let session;
        try {
            session = await createCheckoutSession(
                stripePriceId,
                { name, email: normalizedEmail, custom_id: id_package, telephone },
                `${URL_BASE}/login`,
                URL_BASE,
                {
                    discounts: quote.promotion?.stripe_coupon_id
                        ? [{ coupon: quote.promotion.stripe_coupon_id }]
                        : [],
                    clientReferenceId: purchaseOrder.id_purchase_order,
                    metadata: {
                        purchase_order_id: purchaseOrder.id_purchase_order,
                        package_id: id_package,
                        promotion_id: quote.promotion?.id_promotion || "",
                        user_id: user?.id_user || "",
                    },
                }
            );

            const transactionAfterCheckout = await db.sequelize.transaction();
            try {
                await purchaseOrder.update({ stripe_checkout_session_id: session.id }, { transaction: transactionAfterCheckout });
                if (redemption) await redemption.update({ stripe_checkout_session_id: session.id }, { transaction: transactionAfterCheckout });
                await transactionAfterCheckout.commit();
            } catch (error) {
                await transactionAfterCheckout.rollback();
                throw error;
            }
        } catch (error) {
            const failedTransaction = await db.sequelize.transaction();
            try {
                await purchaseOrder.update({ status: PURCHASE_ORDER_STATUS.FAILED }, { transaction: failedTransaction });
                if (redemption) await redemption.update({ status: "FAILED" }, { transaction: failedTransaction });
                await failedTransaction.commit();
            } catch {
                await failedTransaction.rollback();
            }
            throw error;
        }

        res.status(200).json({
            status: 'Success',
            url: session.url,
            quote: {
                price_before_minor: quote.priceBeforeMinor,
                discount_amount_minor: quote.discountAmountMinor,
                price_after_minor: quote.priceAfterMinor,
                promotion: quote.promotion,
            },
        })

    } catch (error) {
        
        res.status(500).json({ 
            status: 'Internal Server Error',
            message: error.message 
        });
    }
};

export const createPayment = async (user, session, transaction, paymentMethodType = null) =>{
    try {
        const id_user = user?.id_user || user?.id;
        if (!id_user) {
            throw new Error('User id is required to create Payment');
        }
        const amount = session.amount_total/100;
        const external_ref = session.id;
        const method = paymentMethodType || session.payment_method_types[0];
        const id_package = session.metadata.custom_id;

        const existingPayment = await db.Payment.findOne({ where: { external_ref }, transaction });
        if (existingPayment) return {
            id: existingPayment.id_payment,
            id_user: existingPayment.id_user,
            package_id: existingPayment.id_package,
            amount: existingPayment.payment_amount,
            method: existingPayment.method,
            external_ref: existingPayment.external_ref,
        };

        const newPayment = await db.Payment.create({
            id_user,
            id_package,
            payment_amount: amount,
            method,
            external_ref
        }, { transaction });

        console.log(newPayment);
        return ({
            id: newPayment.id_payment,
            id_user: newPayment.id_user,
            package_id: newPayment.id_package,
            amount: newPayment.payment_amount,
            method: newPayment.method,
            external_ref: newPayment.external_ref
        });

    } catch (error) {
        throw new Error(`Error creating Payment: ${error.message}`);
    }
}

export const startPaymentPlan = async (req, res) => {
    try {
        const { name, email, telephone } = req.validatedPayment;
        const packageData = req.validatedPackage;
        const paymentOption = req.validatedPaymentOption;

        const normalizedEmail = String(email).trim().toLowerCase();

        const transaction = await db.sequelize.transaction();
        let planResult;
        try {
            planResult = await createPendingPaymentPlan({
                packageData,
                paymentOption,
                name,
                email: normalizedEmail,
                telephone,
                transaction,
            });
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            if (error?.name === "SequelizeUniqueConstraintError") {
                return res.status(409).json({ status: "Conflict", message: "This promotion is already being used or has already been used" });
            }
            throw error;
        }

        const { user, purchaseOrder, redemption, paymentPlan, quote } = planResult;

        try {
            let stripeCustomerRecord = await db.StripeCustomer.findOne({ where: { id_user: user.id_user } });
            const stripeCustomer = await createOrGetStripeCustomer({
                existingCustomerId: stripeCustomerRecord?.stripe_customer_id,
                email: normalizedEmail,
                name,
            });

            if (!stripeCustomerRecord) {
                stripeCustomerRecord = await db.StripeCustomer.create({
                    id_user: user.id_user,
                    stripe_customer_id: stripeCustomer.id,
                });
            }

            const session = await createPaymentPlanCheckoutSession({
                customerId: stripeCustomer.id,
                currency: quote.currency,
                installmentAmountMinor: quote.installmentAmountsMinor[0],
                productName: packageData.name_package,
                successUrl: `${URL_BASE}/login`,
                cancelUrl: URL_BASE,
                metadata: {
                    purchase_order_id: purchaseOrder.id_purchase_order,
                    payment_plan_id: paymentPlan.id_payment_plan,
                    package_id: packageData.id_package,
                    payment_option_id: paymentOption.id_payment_option,
                    promotion_id: quote.promotion?.id_promotion || "",
                    user_id: user.id_user,
                },
            });

            const afterCheckoutTransaction = await db.sequelize.transaction();
            try {
                await purchaseOrder.update({ stripe_checkout_session_id: session.id }, { transaction: afterCheckoutTransaction });
                await paymentPlan.update({
                    stripe_checkout_session_id: session.id,
                    stripe_customer_id: stripeCustomer.id,
                }, { transaction: afterCheckoutTransaction });
                if (redemption) await redemption.update({ stripe_checkout_session_id: session.id }, { transaction: afterCheckoutTransaction });
                await afterCheckoutTransaction.commit();
            } catch (error) {
                await afterCheckoutTransaction.rollback();
                throw error;
            }

            return res.status(200).json({
                status: "Success",
                url: session.url,
                quote: {
                    price_before_minor: quote.priceBeforeMinor,
                    discount_amount_minor: quote.discountAmountMinor,
                    price_after_minor: quote.priceAfterMinor,
                    installment_amounts_minor: quote.installmentAmountsMinor,
                    promotion: quote.promotion,
                },
            });
        } catch (error) {
            const failedTransaction = await db.sequelize.transaction();
            try {
                await purchaseOrder.update({ status: PURCHASE_ORDER_STATUS.FAILED }, { transaction: failedTransaction });
                await paymentPlan.update({ status: PAYMENT_PLAN_STATUS.TECHNICAL_ERROR }, { transaction: failedTransaction });
                if (redemption) await redemption.update({ status: "FAILED" }, { transaction: failedTransaction });
                await failedTransaction.commit();
            } catch {
                await failedTransaction.rollback();
            }
            throw error;
        }
    } catch (error) {
        res.status(500).json({
            status: 'Internal Server Error',
            message: error.message
        });
    }
};

// Crea el registro interno de Payment correspondiente a una cuota de un
// Payment Plan ya cobrada por Stripe (invoice.payment_succeeded).
export const createPaymentFromInvoice = async (user, invoice, id_package, transaction, paymentMethodType = 'sepa_debit') => {
    const id_user = user?.id_user || user?.id;
    if (!id_user) {
        throw new Error('User id is required to create Payment');
    }

    const external_ref = invoice.id;
    const existingPayment = await db.Payment.findOne({ where: { external_ref }, transaction });
    if (existingPayment) return existingPayment;

    return db.Payment.create({
        id_user,
        id_package,
        payment_amount: Number(invoice.amount_paid || 0) / 100,
        method: paymentMethodType,
        external_ref,
    }, { transaction });
};