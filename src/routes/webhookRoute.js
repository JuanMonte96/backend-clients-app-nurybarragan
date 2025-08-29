import express from "express";
import { stripeWebhookHandler } from "../controllers/webhookController.js";

export const webhookRouter = express.Router();

webhookRouter.post("/stripe-webhook",express.raw({type: 'application/json'}), stripeWebhookHandler);
