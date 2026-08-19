import express from 'express';
import {
	avalibalityPackage,
	backfillPackageCategories,
	createAdminCategory,
	createAdminPackage,
	createPackage,
	deleteAdminCategory,
	getAdminCategoryById,
	getAdminCategoryList,
	getAdminPackageById,
	getAdminPackages,
	getPackages,
	getPublicCatalog,
	reorderAdminCategories,
	reorderAdminPackages,
	retryPackageStripeSync,
	setAdminCategoryStatus,
	setAdminPackageAvailability,
	updateAdminCategory,
	updateAdminPackage,
} from '../controllers/packageController.js';
import { auth } from '../middlewares/auth.js';
import { authorize } from '../middlewares/authorization.js';

export const packageRoute = express.Router();

packageRoute.post('/create', auth, authorize('admin'), createPackage);
packageRoute.get('/all', getPackages);
packageRoute.get('/public/catalog', getPublicCatalog);
packageRoute.patch('/availability/:id', auth, authorize('admin'), avalibalityPackage);

packageRoute.get('/admin/categories', auth, authorize('admin'), getAdminCategoryList);
packageRoute.get('/admin/categories/:id_category', auth, authorize('admin'), getAdminCategoryById);
packageRoute.post('/admin/categories', auth, authorize('admin'), createAdminCategory);
packageRoute.patch('/admin/categories/reorder', auth, authorize('admin'), reorderAdminCategories);
packageRoute.patch('/admin/categories/:id_category', auth, authorize('admin'), updateAdminCategory);
packageRoute.patch('/admin/categories/:id_category/status', auth, authorize('admin'), setAdminCategoryStatus);
packageRoute.delete('/admin/categories/:id_category', auth, authorize('admin'), deleteAdminCategory);

packageRoute.get('/admin/list', auth, authorize('admin'), getAdminPackages);
packageRoute.get('/admin/:id_package', auth, authorize('admin'), getAdminPackageById);
packageRoute.post('/admin/create', auth, authorize('admin'), createAdminPackage);
packageRoute.patch('/admin/reorder', auth, authorize('admin'), reorderAdminPackages);
packageRoute.patch('/admin/:id_package', auth, authorize('admin'), updateAdminPackage);
packageRoute.patch('/admin/:id_package/availability', auth, authorize('admin'), setAdminPackageAvailability);
packageRoute.post('/admin/:id_package/retry-stripe-sync', auth, authorize('admin'), retryPackageStripeSync);

packageRoute.post('/admin/backfill-id-category', auth, authorize('admin'), backfillPackageCategories);