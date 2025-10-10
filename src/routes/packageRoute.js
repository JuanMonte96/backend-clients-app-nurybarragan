import express from 'express';
import { createPackage, getPackages } from '../controllers/packageController.js';
import { auth } from '../middlewares/auth.js';
import { authorize } from '../middlewares/authorization.js';

export const packageRoute = express.Router();

packageRoute.post('/create', auth, authorize('admin'), createPackage);
packageRoute.get('/all', getPackages);
