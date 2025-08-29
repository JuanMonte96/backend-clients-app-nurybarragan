import express from 'express';
import { startPayment } from '../controllers/paymentController.js';

export const paymentsRoute = express.Router();

paymentsRoute.post('/start-payment', startPayment);
