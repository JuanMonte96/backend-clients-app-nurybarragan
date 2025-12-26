import express from "express";
import { auth } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorization.js";
import { verifyChangePassword } from "../middlewares/passwordChange.js";
import { createSchedule, getScheduleById, getAllSchedulesByClass } from "../controllers/scheduleController.js";

export const scheduleRoute = express.Router();

scheduleRoute.post("/create",auth,verifyChangePassword,authorize('teacher','admin'), createSchedule);
scheduleRoute.get("/scheduleBy/:id", auth,verifyChangePassword,getScheduleById);
scheduleRoute.get("/schedulesByClass/:classId", auth,verifyChangePassword,getAllSchedulesByClass);