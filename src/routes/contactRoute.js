import { Router } from 'express';
import { createContactEntry } from '../controllers/contactUsController.js';
import { validateContactMiddleware } from '../middlewares/validate.js';

export const contactRouter = Router();

contactRouter.post('/contact', validateContactMiddleware, createContactEntry);