import express from "express";
import { attendanceViaQr, markAttendance, getAttendanceByUser } from "../controllers/attendanceController.js";
import { auth } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorization.js";
import { verifyChangePassword } from "../middlewares/passwordChange.js";

export const attendanceRoute = express.Router();

attendanceRoute.post("/scan-qr/:scheduleId",auth,verifyChangePassword,authorize('student'), attendanceViaQr);
attendanceRoute.post("/manual-attendance",auth,verifyChangePassword,authorize('teacher','admin'), markAttendance);
attendanceRoute.get("/attendance-records",auth,verifyChangePassword,authorize('student'), getAttendanceByUser);