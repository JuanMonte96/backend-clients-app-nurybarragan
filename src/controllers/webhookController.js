import Stripe from "stripe";
import dotenv from "dotenv";
import { createUser } from "./userController.js";
import { sendEmailApiGmail } from "../services/sendEmail.js";
import { createPayment } from "./paymentController.js";
import { createsubscription } from "./subscriptionController.js";
import { db } from "../models/db.js";
import { markPromotionRedemptionConfirmed } from "../services/promotionService.js";
import { PURCHASE_ORDER_STATUS, PROMOTION_REDEMPTION_STATUS, STRIPE_EVENT_STATUS } from "../constants/promotion.js";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

const processPaidCheckout = async (session, eventRecord, transaction) => {
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

  const newPayment = await createPayment(user, session, transaction);
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
      if (session.payment_status !== "paid") {
        const transaction = await db.sequelize.transaction();
        await markEventProcessed(eventRecord, transaction);
        await transaction.commit();
        return res.status(200).json({ received: true, pending_payment: true });
      }

      const transaction = await db.sequelize.transaction();
      try {
        const result = await processPaidCheckout(session, eventRecord, transaction);
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
