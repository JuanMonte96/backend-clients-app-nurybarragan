import Stripe from "stripe";
import dotenv from "dotenv";
import { Op } from "sequelize";
import { createUser, blockUserForPaymentDelinquency } from "./userController.js";
import { sendEmailApiGmail, sendPaymentPlanProcessingEmail } from "../services/sendEmail.js";
import { createPayment, createPaymentFromInvoice } from "./paymentController.js";
import { createsubscription, createSubscriptionForPaymentPlan } from "./subscriptionController.js";
import { attachFiniteSubscriptionSchedule, resolveInvoicePaymentMethodType, resolveInvoiceSubscriptionId, resolveSessionPaymentMethodType, retrieveInvoice, retrieveSubscription } from "../services/stripe.js";
import { db } from "../models/db.js";
import { markPromotionRedemptionConfirmed } from "../services/promotionService.js";
import { PURCHASE_ORDER_STATUS, PROMOTION_REDEMPTION_STATUS, STRIPE_EVENT_STATUS } from "../constants/promotion.js";
import { PAYMENT_PLAN_STATUS, INSTALLMENT_STATUS } from "../constants/paymentPlan.js";
import { createTempPassword } from "../services/password.js";

dotenv.config();

// Pinned to the same API version configured for this webhook endpoint in the
// Stripe Dashboard, so event payload shapes always match what this code expects.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-12-15.clover',
});

const getOrderId = (session) => session.metadata?.purchase_order_id || session.client_reference_id;

const ensureUser = async (session, order, transaction) => {
  if (order?.id_user) {
    const existing = await db.User.findByPk(order.id_user, { transaction });
    if (existing) return { user: existing, created: false };
  }

  const email = order?.email || session.customer_email || session.customer_details?.email;
  const existing = email ? await db.User.findOne({ where: { email_user: email }, transaction }) : null;
  if (existing) return { user: existing, created: false };

  const createdData = await createUser(session, transaction);
  const user = await db.User.findByPk(createdData.id, { transaction });
  return { user, created: true, temporaryPassword: createdData.password, name: createdData.nombre };
};

const claimEvent = async (event) => {
  try {
    return await db.StripeEvent.create({
      stripe_event_id: event.id,
      event_type: event.type,
      object_id: event.data?.object?.id || null,
      status: STRIPE_EVENT_STATUS.PENDING,
    });
  } catch (error) {
    if (error?.name === "SequelizeUniqueConstraintError") {
      const existingEvent = await db.StripeEvent.findOne({ where: { stripe_event_id: event.id } });
      if (!existingEvent || existingEvent.status === STRIPE_EVENT_STATUS.PROCESSED) return null;

      await existingEvent.update({
        status: STRIPE_EVENT_STATUS.PENDING,
        error_message: null,
      });
      return existingEvent;
    }
    throw error;
  }
};

const markEventProcessed = async (eventRecord, transaction) => {
  await eventRecord.update({
    status: STRIPE_EVENT_STATUS.PROCESSED,
    processed_at: new Date(),
    error_message: null,
  }, { transaction });
};

const markEventFailed = async (eventRecord, error, transaction) => {
  await eventRecord.update({
    status: STRIPE_EVENT_STATUS.FAILED,
    error_message: error?.message || String(error),
  }, { transaction });
};

const processPaidCheckout = async (session, eventRecord, transaction, paymentMethodType = null) => {
  const orderId = getOrderId(session);
  const order = orderId
    ? await db.PurchaseOrder.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE })
    : null;

  const { user, created, temporaryPassword, name } = await ensureUser(session, order, transaction);
  if (!user) throw new Error("Unable to resolve the user for the paid Checkout session");

  if (order && Number(session.amount_total) !== Number(order.price_after_minor)) {
    throw new Error("Stripe amount does not match the server purchase order");
  }

  if (order && order.status === PURCHASE_ORDER_STATUS.PAID) {
    await markEventProcessed(eventRecord, transaction);
    return { duplicate: true, user };
  }

  const newPayment = await createPayment(user, session, transaction, paymentMethodType);
  const newSubscription = await createsubscription(user, newPayment, session, transaction);

  if (order) {
    await order.update({
      id_user: user.id_user,
      status: PURCHASE_ORDER_STATUS.PAID,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent || null,
    }, { transaction });

    const redemption = await db.PromotionRedemption.findOne({
      where: { id_purchase_order: order.id_purchase_order },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (redemption) {
      await markPromotionRedemptionConfirmed({
        redemptionId: redemption.id_redemption,
        paymentId: newPayment.id,
        sessionId: session.id,
        transaction,
      });
    }
  }

  await markEventProcessed(eventRecord, transaction);
  return { user, created, temporaryPassword, name, payment: newPayment, subscription: newSubscription };
};

const processUnpaidCheckout = async (session, eventRecord, nextStatus) => {
  const orderId = getOrderId(session);
  const transaction = await db.sequelize.transaction();
  try {
    if (orderId) {
      const order = await db.PurchaseOrder.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
      if (order && order.status !== PURCHASE_ORDER_STATUS.PAID) {
        await order.update({ status: nextStatus }, { transaction });
        await db.PromotionRedemption.update(
          { status: nextStatus === PURCHASE_ORDER_STATUS.EXPIRED ? PROMOTION_REDEMPTION_STATUS.EXPIRED : PROMOTION_REDEMPTION_STATUS.FAILED },
          { where: { id_purchase_order: order.id_purchase_order, status: PROMOTION_REDEMPTION_STATUS.PENDING }, transaction }
        );
      }
    }
    await markEventProcessed(eventRecord, transaction);
    await transaction.commit();
  } catch (error) {
    await markEventFailed(eventRecord, error, transaction);
    await transaction.commit();
    throw error;
  }
};

// --- Payment Plan (SEPA installments) ---

// checkout.session.completed con mode='subscription': la Subscription ya fue
// creada por Stripe; aqui la convertimos en un plan finito (Subscription
// Schedule con iterations = numero de cuotas y end_behavior='cancel').
const processPaymentPlanCheckoutCompleted = async (session, eventRecord, transaction) => {
  const paymentPlan = await db.PaymentPlan.findOne({
    where: { stripe_checkout_session_id: session.id },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!paymentPlan) {
    await markEventProcessed(eventRecord, transaction);
    return { ignored: true };
  }

  if (paymentPlan.stripe_subscription_id) {
    await markEventProcessed(eventRecord, transaction);
    return { duplicate: true };
  }

  const subscriptionId = session.subscription;
  if (!subscriptionId) throw new Error("Payment plan Checkout session completed without a subscription id");

  const schedule = await attachFiniteSubscriptionSchedule({
    subscriptionId,
    installmentCount: paymentPlan.installment_count,
  });

  const subscription = await retrieveSubscription(subscriptionId);

  await paymentPlan.update({
    stripe_subscription_id: subscriptionId,
    stripe_subscription_schedule_id: schedule.id,
    stripe_customer_id: session.customer || paymentPlan.stripe_customer_id,
    stripe_payment_method_id: subscription?.default_payment_method || null,
    status: PAYMENT_PLAN_STATUS.PROCESSING_INITIAL_PAYMENT,
  }, { transaction });

  // Card puede confirmar la primera factura antes de que Stripe entregue
  // checkout.session.completed. En ese caso el evento de factura no encuentra
  // aun el plan y se ignora; recuperamos la factura aqui una vez enlazado el
  // subscription_id. SEPA pendiente no entra en esta rama porque su factura
  // todavia no tiene estado paid.
  const latestInvoiceId = typeof subscription?.latest_invoice === 'string'
    ? subscription.latest_invoice
    : subscription?.latest_invoice?.id;
  const latestInvoice = latestInvoiceId ? await retrieveInvoice(latestInvoiceId) : null;
  const invoiceIsPaid = latestInvoice?.status === 'paid' || latestInvoice?.paid === true;

  if (invoiceIsPaid) {
    const paymentMethodType = await resolveInvoicePaymentMethodType(latestInvoice);
    console.info('[StripeWebhook] Recovering paid initial subscription invoice from checkout completion', {
      sessionId: session.id,
      subscriptionId,
      invoiceId: latestInvoice.id,
      paymentMethodType,
    });
    const invoiceResult = await processInvoicePaymentSucceeded(
      latestInvoice,
      eventRecord,
      transaction,
      paymentMethodType
    );

    return { paymentPlan, ...invoiceResult };
  }

  await markEventProcessed(eventRecord, transaction);
  return { paymentPlan };
};

const findNextUnpaidInstallment = async (paymentPlanId, transaction) => {
  return db.PaymentPlanInstallment.findOne({
    where: {
      id_payment_plan: paymentPlanId,
      status: { [Op.ne]: INSTALLMENT_STATUS.PAID },
    },
    order: [["installment_number", "ASC"]],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
};

const processInvoicePaymentSucceeded = async (invoice, eventRecord, transaction, paymentMethodType = 'sepa_debit') => {
  const subscriptionId = resolveInvoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    console.warn('[StripeWebhook] Ignoring invoice without subscription context', {
      invoiceId: invoice?.id,
      invoiceType: invoice?.object,
      parentType: invoice?.parent?.type,
    });
    await markEventProcessed(eventRecord, transaction);
    return { ignored: true, reason: 'Invoice is not tied to a subscription' };
  }

  const paymentPlan = await db.PaymentPlan.findOne({
    where: { stripe_subscription_id: subscriptionId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!paymentPlan) {
    console.warn('[StripeWebhook] Payment plan not found for subscription invoice', {
      invoiceId: invoice?.id,
      subscriptionId,
      eventId: eventRecord?.stripe_event_id,
    });
    await markEventProcessed(eventRecord, transaction);
    return { ignored: true, reason: 'No payment plan found for subscription' };
  }

  const installment = await findNextUnpaidInstallment(paymentPlan.id_payment_plan, transaction);
  if (!installment) {
    // Ya no quedan cuotas pendientes; evento repetido o desfasado.
    await markEventProcessed(eventRecord, transaction);
    return { duplicate: true };
  }

  await installment.update({
    status: INSTALLMENT_STATUS.PAID,
    paid_amount_minor: invoice.amount_paid,
    paid_at: new Date(),
    stripe_invoice_id: invoice.id,
    stripe_payment_intent_id: invoice.payment_intent || null,
    stripe_charge_id: invoice.charge || null,
  }, { transaction });

  const paidTotal = Number(paymentPlan.paid_total_minor) + Number(invoice.amount_paid || 0);
  const outstandingTotal = Math.max(Number(paymentPlan.contractual_total_minor) - paidTotal, 0);
  const isFirstInstallment = installment.installment_number === 1;
  const isLastInstallment = installment.installment_number === paymentPlan.installment_count;

  let result = { paymentPlan, installment };

  if (isFirstInstallment) {
    // Solo ahora se confirma la entitlement interna: se crea el Payment,
    // la Subscription (acceso a clases) y se envian las credenciales reales.
    const user = await db.User.findByPk(paymentPlan.id_user, { transaction });
    if (!user) throw new Error("User not found for payment plan first installment confirmation");

    const payment = await createPaymentFromInvoice(user, invoice, paymentPlan.id_package, transaction, paymentMethodType);
    await createSubscriptionForPaymentPlan(user, paymentPlan, payment, transaction);

    const { tempPassword, hashedPassword } = await createTempPassword();
    await user.update({ password_user: hashedPassword }, { transaction });

    result.creditentialsToSend = { email: user.email_user, name: user.name_user, tempPassword };

    const orderRedemption = await db.PromotionRedemption.findOne({
      where: { id_purchase_order: paymentPlan.id_purchase_order },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (orderRedemption) {
      await markPromotionRedemptionConfirmed({
        redemptionId: orderRedemption.id_redemption,
        paymentId: payment.id_payment,
        sessionId: paymentPlan.stripe_checkout_session_id,
        transaction,
      });
    }

    await db.PurchaseOrder.update(
      { status: PURCHASE_ORDER_STATUS.PAID },
      { where: { id_purchase_order: paymentPlan.id_purchase_order }, transaction }
    );
  }

  await paymentPlan.update({
    paid_total_minor: paidTotal,
    outstanding_total_minor: outstandingTotal,
    started_at: paymentPlan.started_at || new Date(),
    status: isLastInstallment ? PAYMENT_PLAN_STATUS.COMPLETED : PAYMENT_PLAN_STATUS.ACTIVE,
    completed_at: isLastInstallment ? new Date() : paymentPlan.completed_at,
  }, { transaction });

  await markEventProcessed(eventRecord, transaction);
  return result;
};

const processInvoicePaymentFailed = async (invoice, eventRecord, transaction) => {
  const subscriptionId = resolveInvoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    console.warn('[StripeWebhook] Ignoring failed invoice without subscription context', {
      invoiceId: invoice?.id,
      parentType: invoice?.parent?.type,
    });
    await markEventProcessed(eventRecord, transaction);
    return { ignored: true, reason: 'Invoice is not tied to a subscription' };
  }

  const paymentPlan = await db.PaymentPlan.findOne({
    where: { stripe_subscription_id: subscriptionId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!paymentPlan) {
    console.warn('[StripeWebhook] Failed invoice has no payment plan for subscription', {
      invoiceId: invoice?.id,
      subscriptionId,
    });
    await markEventProcessed(eventRecord, transaction);
    return { ignored: true, reason: 'No payment plan found for subscription' };
  }

  const installment = await findNextUnpaidInstallment(paymentPlan.id_payment_plan, transaction);
  if (installment) {
    await installment.update({
      status: INSTALLMENT_STATUS.FAILED,
      stripe_invoice_id: invoice.id,
      stripe_payment_intent_id: invoice.payment_intent || null,
      failure_code: invoice.last_finalization_error?.code || null,
      failure_message: invoice.last_finalization_error?.message || "Payment failed",
    }, { transaction });
  }

  // Si el usuario ya tenia acceso otorgado (started_at != null), una cuota
  // fallida bloquea el acceso automaticamente. El desbloqueo, si el pago se
  // reintenta y se confirma, es siempre manual desde el panel de admin (ver
  // setUserBlockStatus) para que el equipo confirme el cobro real antes de
  // restaurar el acceso.
  if (paymentPlan.started_at) {
    await blockUserForPaymentDelinquency(paymentPlan.id_user, transaction);
  }

  await paymentPlan.update({
    status: paymentPlan.started_at ? PAYMENT_PLAN_STATUS.PAST_DUE : PAYMENT_PLAN_STATUS.PAYMENT_FAILED,
  }, { transaction });

  await markEventProcessed(eventRecord, transaction);
  return { paymentPlan, installment };
};

const processPaymentIntentProcessing = async (paymentIntent, eventRecord, transaction) => {
  const installment = await db.PaymentPlanInstallment.findOne({
    where: { stripe_payment_intent_id: paymentIntent.id },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  let target = installment;
  if (!target && paymentIntent.invoice) {
    target = await db.PaymentPlanInstallment.findOne({
      where: { stripe_invoice_id: paymentIntent.invoice },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }

  if (!target) {
    await markEventProcessed(eventRecord, transaction);
    return { ignored: true };
  }

  const alreadyNotified = Boolean(target.processing_at);
  await target.update({
    status: INSTALLMENT_STATUS.PROCESSING,
    processing_at: target.processing_at || new Date(),
    stripe_payment_intent_id: paymentIntent.id,
  }, { transaction });

  const paymentPlan = await db.PaymentPlan.findByPk(target.id_payment_plan, { transaction });

  await markEventProcessed(eventRecord, transaction);
  return { installment: target, paymentPlan, shouldSendProcessingEmail: !alreadyNotified };
};

export const stripeWebhookHandler = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  let eventRecord;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error("Stripe webhook verification failed:", error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    eventRecord = await claimEvent(event);
    if (!eventRecord) return res.status(200).json({ received: true, duplicate: true });

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object;

      if (session.mode === "subscription") {
        const transaction = await db.sequelize.transaction();
        try {
          const result = await processPaymentPlanCheckoutCompleted(session, eventRecord, transaction);
          await transaction.commit();

          if (result.creditentialsToSend?.email && result.creditentialsToSend?.tempPassword) {
            console.info('[StripeWebhook] Sending welcome email after subscription checkout', {
              eventId: event.id,
              sessionId: session.id,
              to: result.creditentialsToSend.email,
            });
            await sendEmailApiGmail(
              result.creditentialsToSend.email,
              result.creditentialsToSend.name,
              result.creditentialsToSend.tempPassword
            );
          }

          return res.status(200).json({ received: true, payment_plan: true, ...result });
        } catch (error) {
          await transaction.rollback();
          throw error;
        }
      }

      if (session.payment_status !== "paid") {
        const transaction = await db.sequelize.transaction();
        await markEventProcessed(eventRecord, transaction);
        await transaction.commit();
        return res.status(200).json({ received: true, pending_payment: true });
      }

      const paymentMethodType = await resolveSessionPaymentMethodType(session);
      const transaction = await db.sequelize.transaction();
      try {
        const result = await processPaidCheckout(session, eventRecord, transaction, paymentMethodType);
        await transaction.commit();

        if (result.created && result.temporaryPassword) {
          await sendEmailApiGmail(result.user.email_user, result.name || result.user.name_user, result.temporaryPassword);
        }

        return res.status(200).json({ received: true, ...result });
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    }

    if (event.type === "checkout.session.expired") {
      await processUnpaidCheckout(event.data.object, eventRecord, PURCHASE_ORDER_STATUS.EXPIRED);
      return res.status(200).json({ received: true, expired: true });
    }

    if (event.type === "checkout.session.async_payment_failed") {
      await processUnpaidCheckout(event.data.object, eventRecord, PURCHASE_ORDER_STATUS.FAILED);
      return res.status(200).json({ received: true, failed: true });
    }

    if (event.type === "invoice.payment_succeeded" || event.type === "invoice.paid") {
      const invoice = event.data.object;
      const paymentMethodType = await resolveInvoicePaymentMethodType(invoice);
      const transaction = await db.sequelize.transaction();
      try {
        const result = await processInvoicePaymentSucceeded(invoice, eventRecord, transaction, paymentMethodType);
        await transaction.commit();

        if (result.creditentialsToSend?.email && result.creditentialsToSend?.tempPassword) {
          console.info('[StripeWebhook] Sending welcome email after first installment', {
            eventId: event.id,
            invoiceId: event.data.object.id,
            to: result.creditentialsToSend.email,
          });
          await sendEmailApiGmail(
            result.creditentialsToSend.email,
            result.creditentialsToSend.name,
            result.creditentialsToSend.tempPassword
          );
        } else {
          console.warn('[StripeWebhook] No welcome-email credentials returned for first installment', {
            eventId: event.id,
            invoiceId: event.data.object.id,
            resultKeys: Object.keys(result || {}),
          });
        }

        return res.status(200).json({ received: true, invoice_paid: true });
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    }

    if (event.type === "invoice.payment_failed") {
      const transaction = await db.sequelize.transaction();
      try {
        await processInvoicePaymentFailed(event.data.object, eventRecord, transaction);
        await transaction.commit();
        return res.status(200).json({ received: true, invoice_failed: true });
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    }

    if (event.type === "payment_intent.processing") {
      const transaction = await db.sequelize.transaction();
      try {
        const result = await processPaymentIntentProcessing(event.data.object, eventRecord, transaction);
        await transaction.commit();

        if (result.shouldSendProcessingEmail && result.paymentPlan) {
          const user = await db.User.findByPk(result.paymentPlan.id_user);
          if (user) {
            await sendPaymentPlanProcessingEmail({
              to: user.email_user,
              userName: user.name_user,
              packageName: result.paymentPlan.package_snapshot?.name_package || "",
              amountLabel: `${(Number(result.installment.expected_amount_minor) / 100).toFixed(2)} ${String(result.paymentPlan.currency).toUpperCase()}`,
              installmentNumber: result.installment.installment_number,
              installmentCount: result.paymentPlan.installment_count,
            });
          }
        }

        return res.status(200).json({ received: true, payment_intent_processing: true });
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    }

    const transaction = await db.sequelize.transaction();
    await markEventProcessed(eventRecord, transaction);
    await transaction.commit();
    return res.status(200).json({ received: true, ignored: true });
  } catch (error) {
    if (eventRecord) {
      await eventRecord.update({
        status: STRIPE_EVENT_STATUS.FAILED,
        error_message: error?.message || String(error),
      }).catch(() => undefined);
    }
    console.error("Stripe webhook processing failed:", error);
    return res.status(500).json({ status: "error", message: "Webhook processing failed" });
  }
};
