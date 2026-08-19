import express from "express";
import {
  archivePromotion,
  createPromotion,
  getPublicPromotions,
  listAdminPromotions,
  markNonMonetaryBenefitUsed,
  setPromotionStatus,
  updatePromotion,
} from "../controllers/promotionController.js";
import { auth } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorization.js";

export const promotionRoute = express.Router();

promotionRoute.get("/public", getPublicPromotions);
promotionRoute.get("/admin", auth, authorize("admin"), listAdminPromotions);
promotionRoute.post("/admin", auth, authorize("admin"), createPromotion);
promotionRoute.patch("/admin/:id_promotion", auth, authorize("admin"), updatePromotion);
promotionRoute.patch("/admin/:id_promotion/status", auth, authorize("admin"), setPromotionStatus);
promotionRoute.post("/admin/:id_promotion/archive", auth, authorize("admin"), archivePromotion);
promotionRoute.post("/admin/:id_promotion/benefit-used", auth, authorize("admin"), markNonMonetaryBenefitUsed);
