import express from "express";
import { auth } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorization.js";
import { verifyChangePassword } from "../middlewares/passwordChange.js";
import { createUnicSchedule, getScheduleById, getAllSchedulesByClass, createdScheduleTemplate } from "../controllers/scheduleController.js";

export const scheduleRoute = express.Router();

scheduleRoute.post("/create-schedule-unic",auth,verifyChangePassword,authorize('teacher','admin'), createUnicSchedule);
scheduleRoute.get("/scheduleBy/:id", auth,verifyChangePassword,getScheduleById);
scheduleRoute.get("/schedulesByClass/:classId", auth,verifyChangePassword,getAllSchedulesByClass);
scheduleRoute.post("/class-schedule-template", auth, verifyChangePassword,authorize('teacher', 'admin'), createdScheduleTemplate); 