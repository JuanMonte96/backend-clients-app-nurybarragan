import { sequelize } from "../config/conection.js";
import { User } from "./userModel.js";
import { Package } from "./packageModel.js";
import { Payment } from "./paymentModel.js";
import { Subscription } from "./suscriptionModel.js";


export const db = {};

db.sequelize = sequelize;
db.User = User;
db.Package = Package;
db.Payment = Payment;
db.Subscription = Subscription;

db.User.hasMany(db.Subscription,{foreignKey:"id_user"});
db.Subscription.belongsTo(db.User, {foreignKey:"id_user"});

db.Package.hasMany(db.Subscription, {foreignKey: "id_package"});
db.Subscription.belongsTo(db.Package, {foreignKey: "id_package"});