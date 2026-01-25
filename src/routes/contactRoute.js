import { Router } from 'express';
import { createContactEntry } from '../controllers/contactUsController.js';

export const contactRouter = Router();

contactRouter.post('/contact', createContactEntry);