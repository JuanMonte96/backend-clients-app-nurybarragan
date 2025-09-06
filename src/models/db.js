import { sequelize } from "../config/conection.js";
import { User } from "./userModel.js";
import { Package } from "./packageModel.js";
import { Payment } from "./paymentModel.js";


export const db = {};

db.sequelize = sequelize;
db.User = User;
db.Package = Package;
db.Payment = Payment;
