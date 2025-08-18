import { sequelize } from "../config/conection.js";
import { User } from "./userModel.js";
import { Package } from "./packageModel.js";


export const db = {};

db.sequelize = sequelize;
db.User = User;
db.Package = Package;
