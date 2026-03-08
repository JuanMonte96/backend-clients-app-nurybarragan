import express from 'express';
import { startPayment } from '../controllers/paymentController.js';
import { validatePaymentMiddleware } from '../middlewares/validate.js';
import { userVerificationPackageBuy } from '../middlewares/buyVerification.js';

export const paymentsRoute = express.Router();

paymentsRoute.post('/start-payment', validatePaymentMiddleware, userVerificationPackageBuy, startPayment);