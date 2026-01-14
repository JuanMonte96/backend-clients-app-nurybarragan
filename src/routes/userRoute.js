import express from 'express';
import { loginUser, getAllUsers, profileUser, changePassword, editUser, blockUser, createAdminUser, getUserClassCounts,  } from '../controllers/userController.js';
import { auth } from '../middlewares/auth.js'; 
import { authorize } from '../middlewares/authorization.js';
import { verifyChangePassword } from '../middlewares/passwordChange.js';

export const userRoute = express.Router();

userRoute.post('/login', loginUser);
userRoute.get('/allUsers', auth, verifyChangePassword, authorize('admin'), getAllUsers);
userRoute.get('/profile/:id_user', auth, verifyChangePassword, profileUser);
userRoute.put('/changePassword', auth, changePassword);
userRoute.put('/editProfile/:id_user', auth, verifyChangePassword, editUser);
userRoute.patch('/blockUser/:id_user', auth, verifyChangePassword, blockUser);
userRoute.post('/register',auth,verifyChangePassword,authorize('admin'),createAdminUser);
userRoute.get('/classRemaining', auth,verifyChangePassword, getUserClassCounts)