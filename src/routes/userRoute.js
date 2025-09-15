import express from 'express';
import { loginUser, getAllUsers } from '../controllers/userController.js';
import { auth } from '../middlewares/auth.js'; 

export const userRoute = express.Router();

userRoute.post('/login', loginUser);
userRoute.get('/allUsers', auth, getAllUsers);
