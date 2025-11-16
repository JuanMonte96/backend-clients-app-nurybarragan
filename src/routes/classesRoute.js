import express from "express";
import { createClass, deleteClass, getAllClasses, getAvailableClasses, updatedClass } from "../controllers/classesController.js";
import { auth } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorization.js";
import { verifyChangePassword } from "../middlewares/passwordChange.js";

export const classesRoute = express.Router();

classesRoute.post("/create",auth,verifyChangePassword,authorize('teacher','admin'), createClass);
classesRoute.get("/all",auth,verifyChangePassword,getAllClasses);
classesRoute.put("/update",auth,verifyChangePassword,authorize('teacher','admin'), updatedClass);
classesRoute.delete("/delete/:id",auth, verifyChangePassword,authorize('teacher','admin'),deleteClass);
classesRoute.get("/available",auth,verifyChangePassword, getAvailableClasses)