import express from "express";
import { attendanceViaQr, markAttendance, getAttendanceByUser, getAdminScheduleRoster } from "../controllers/attendanceController.js";
import { auth } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorization.js";
import { verifyChangePassword } from "../middlewares/passwordChange.js";

export const attendanceRoute = express.Router();

attendanceRoute.get("/admin/roster/:scheduleId",auth,verifyChangePassword,authorize('admin','teacher'), getAdminScheduleRoster);
attendanceRoute.post("/scan-qr/:scheduleId",auth,verifyChangePassword, attendanceViaQr);
attendanceRoute.post("/manual-attendance",auth,verifyChangePassword,authorize('teacher','admin'), markAttendance);
attendanceRoute.get("/attendance-records",auth,verifyChangePassword,authorize('student'), getAttendanceByUser);