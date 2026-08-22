import express from 'express';
import { startPayment, startPaymentPlan } from '../controllers/paymentController.js';
import { validatePaymentMiddleware, validatePaymentPlanMiddleware } from '../middlewares/validate.js';
import { userVerificationPackageBuy, userVerificationPaymentPlanBuy } from '../middlewares/buyVerification.js';

export const paymentsRoute = express.Router();

paymentsRoute.post('/start-payment', validatePaymentMiddleware, userVerificationPackageBuy, startPayment);
paymentsRoute.post('/start-payment-plan', validatePaymentPlanMiddleware, userVerificationPaymentPlanBuy, startPaymentPlan);