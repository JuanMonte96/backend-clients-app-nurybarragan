import express from 'express';
import { createPackage } from '../controllers/packageController.js';

export const packageRoute = express.Router();

packageRoute.post('/create', createPackage)