import express from "express";
import { auth } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorization.js";
import { verifyChangePassword } from "../middlewares/passwordChange.js";
import { createEnrrollment, getEnrollmentsById, removeEnroll } from "../controllers/enrrollmentController.js";


export const enrollmentRoute = express.Router();

enrollmentRoute.post("/enroll",auth,verifyChangePassword,createEnrrollment);
enrollmentRoute.get("/enrollsById", auth,verifyChangePassword,getEnrollmentsById);
enrollmentRoute.delete("/dropById/:id", auth,verifyChangePassword,removeEnroll);