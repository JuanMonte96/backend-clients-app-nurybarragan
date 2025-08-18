import express from 'express';
import { createUser } from '../controllers/userController.js';

export const userRoute = express.Router();

userRoute.get('/create', createUser)