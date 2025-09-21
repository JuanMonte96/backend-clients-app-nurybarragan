import express from 'express';
import { loginUser, getAllUsers, profileUser } from '../controllers/userController.js';
import { auth } from '../middlewares/auth.js'; 
import { authorize } from '../middlewares/authorization.js';

export const userRoute = express.Router();

userRoute.post('/login', loginUser);
userRoute.get('/allUsers', auth,authorize('admin'),getAllUsers);
userRoute.get('/profile/:id_user', auth, profileUser);
