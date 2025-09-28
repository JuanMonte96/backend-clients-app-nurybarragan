import express from 'express';
import { loginUser, getAllUsers, profileUser, changePassword, editUser } from '../controllers/userController.js';
import { auth } from '../middlewares/auth.js'; 
import { authorize } from '../middlewares/authorization.js';
import { verifyChangePassword } from '../middlewares/passwordChange.js';

export const userRoute = express.Router();

userRoute.post('/login', loginUser);
userRoute.get('/allUsers', auth, verifyChangePassword, authorize('admin'), getAllUsers);
userRoute.get('/profile/:id_user', auth, verifyChangePassword, profileUser);
userRoute.put('/changePassword', auth, changePassword);
userRoute.put('/editProfile/:id_user', auth, verifyChangePassword, authorize('admin', 'teacher', 'student'), editUser);