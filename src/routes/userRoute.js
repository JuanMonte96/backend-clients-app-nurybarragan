import express from 'express';
import { loginUser, getAllUsers, profileUser, changePassword, editUser, blockUser, createAdminUser, getUserClassCounts, uploadMedicalCertificate, getAdminUsersList, getUserDetail, getUserPayments, getUserSubscriptions, getMedicalCertificateSignedUrl } from '../controllers/userController.js';
import { auth } from '../middlewares/auth.js'; 
import { authorize } from '../middlewares/authorization.js';
import { verifyChangePassword } from '../middlewares/passwordChange.js';
import { uploadMedicalCertificated } from '../middlewares/upload.js';
import { validateLoginMiddleware, validatePasswordMiddleware } from '../middlewares/validate.js';

export const userRoute = express.Router();

userRoute.post('/login', validateLoginMiddleware, loginUser);
userRoute.get('/allUsers', auth, verifyChangePassword, authorize('admin'), getAllUsers);
userRoute.get('/admin/list', auth, verifyChangePassword, authorize('admin'), getAdminUsersList);
userRoute.get('/profile/:id_user', auth, verifyChangePassword, profileUser);
userRoute.get('/me/detail', auth, verifyChangePassword, (req, res, next) => {
	req.params.id_user = req.user.id;
	next();
}, getUserDetail);
userRoute.get('/:id_user/detail', auth, verifyChangePassword, getUserDetail);
userRoute.get('/:id_user/payments', auth, verifyChangePassword, getUserPayments);
userRoute.get('/:id_user/subscriptions', auth, verifyChangePassword, getUserSubscriptions);
userRoute.get('/:id_user/medical-certificate/url', auth, verifyChangePassword, getMedicalCertificateSignedUrl);
userRoute.put('/changePassword', auth, validatePasswordMiddleware, changePassword);
userRoute.put('/editProfile/:id_user', auth, verifyChangePassword, editUser);
userRoute.patch('/blockUser/:id_user', auth, verifyChangePassword, blockUser);
userRoute.post('/register',auth,verifyChangePassword,authorize('admin'),createAdminUser);
userRoute.get('/classRemaining', auth,verifyChangePassword, getUserClassCounts);
userRoute.patch('/upload-certificated', auth,verifyChangePassword,uploadMedicalCertificated.single('certificate'), uploadMedicalCertificate);