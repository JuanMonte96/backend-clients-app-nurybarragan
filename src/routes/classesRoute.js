import express from "express";
import { createClass } from "../controllers/classesController.js";
import { auth } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorization.js";
import { verifyChangePassword } from "../middlewares/passwordChange.js";

export const classesRoute = express.Router();

classesRoute.post("/create",auth,verifyChangePassword,authorize('teacher','admin'), createClass);

