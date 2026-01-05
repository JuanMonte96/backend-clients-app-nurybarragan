import { sequelize } from "../config/conection.js";
import { User } from "./userModel.js";
import { Package } from "./packageModel.js";
import { Payment } from "./paymentModel.js";
import { Subscription } from "./suscriptionModel.js";
import { Class } from "./classModel.js";
import { ClassEnrollment } from "./classEnrollmentsModel.js";
import { ClassSchedule } from "./classScheduleModel.js";
import { Attendance } from "./attendance.js";

export const db = {};

db.sequelize = sequelize;
db.User = User;
db.Package = Package;
db.Payment = Payment;
db.Subscription = Subscription;
db.Class = Class; 
db.ClassEnrollment = ClassEnrollment;
db.ClassSchedule = ClassSchedule;
db.Attendance = Attendance;

db.User.hasMany(db.Subscription,{foreignKey:"id_user"});
db.Subscription.belongsTo(db.User, {foreignKey:"id_user"});

db.Package.hasMany(db.Subscription, {foreignKey: "id_package"});
db.Subscription.belongsTo(db.Package, {foreignKey: "id_package"});

db.User.hasMany(db.ClassEnrollment, { foreignKey: "id_user" });
db.ClassEnrollment.belongsTo(db.User, { foreignKey: "id_user" });

db.ClassSchedule.hasMany(db.ClassEnrollment, { foreignKey: "id_schedule" });
db.ClassEnrollment.belongsTo(db.ClassSchedule, { foreignKey: "id_schedule" });

db.Class.hasMany(db.ClassSchedule, { foreignKey: "id_class" });
db.ClassSchedule.belongsTo(db.Class, { foreignKey: "id_class" });
 
// Association between Class and User (teacher)
db.User.hasMany(db.Class, { foreignKey: 'teacher_id', as: 'classes' });
db.Class.belongsTo(db.User, { foreignKey: 'teacher_id', targetKey: 'id_user', as: 'teacher' });