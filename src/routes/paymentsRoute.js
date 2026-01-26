import express from 'express';
import { startPayment } from '../controllers/paymentController.js';
import { validatePaymentMiddleware } from '../middlewares/validate.js';

export const paymentsRoute = express.Router();

paymentsRoute.post('/start-payment', validatePaymentMiddleware, startPayment);