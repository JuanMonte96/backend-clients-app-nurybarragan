import { sequelize } from "../config/conection.js";
import { User } from "./userModel.js";
import { Package } from "./packageModel.js";
import { PackageCategory } from "./packageCategoryModel.js";
import { Payment } from "./paymentModel.js";
import { Subscription } from "./suscriptionModel.js";
import { Class } from "./classModel.js";
import { ClassEnrollment } from "./classEnrollmentsModel.js";
import { ClassSchedule } from "./classScheduleModel.js";
import { Attendance } from "./attendance.js";
import { ClassScheduleTemplate } from "./classScheduleTemplateModel.js";
import { Contact } from "./contact.js";
import { Promotion } from "./promotionModel.js";
import { PromotionPackage } from "./promotionPackageModel.js";
import { PurchaseOrder } from "./purchaseOrderModel.js";
import { PromotionRedemption } from "./promotionRedemptionModel.js";
import { StripeEvent } from "./stripeEventModel.js";

export const db = {};

db.sequelize = sequelize;
db.User = User;
db.Package = Package;
db.PackageCategory = PackageCategory;
db.Payment = Payment;
db.Subscription = Subscription;
db.Class = Class; 
db.ClassEnrollment = ClassEnrollment;
db.ClassSchedule = ClassSchedule;
db.Attendance = Attendance;
db.ClassScheduleTemplate = ClassScheduleTemplate; 
db.Contact = Contact;
db.Promotion = Promotion;
db.PromotionPackage = PromotionPackage;
db.PurchaseOrder = PurchaseOrder;
db.PromotionRedemption = PromotionRedemption;
db.StripeEvent = StripeEvent;

db.PackageCategory.hasMany(db.Package, { foreignKey: "id_category", sourceKey: "id_category" });
db.Package.belongsTo(db.PackageCategory, { foreignKey: "id_category", targetKey: "id_category" });

db.User.hasMany(db.Subscription,{foreignKey:"id_user"});
db.Subscription.belongsTo(db.User, {foreignKey:"id_user"});

db.Package.hasMany(db.Subscription, {foreignKey: "id_package"});
db.Subscription.belongsTo(db.Package, {foreignKey: "id_package"});

db.User.hasMany(db.Payment, { foreignKey: "id_user" });
db.Payment.belongsTo(db.User, { foreignKey: "id_user" });

db.Package.hasMany(db.Payment, { foreignKey: "id_package" });
db.Payment.belongsTo(db.Package, { foreignKey: "id_package" });

db.Payment.hasMany(db.Subscription, { foreignKey: "id_payment" });
db.Subscription.belongsTo(db.Payment, { foreignKey: "id_payment" });

db.User.hasMany(db.ClassEnrollment, { foreignKey: "id_user" });
db.ClassEnrollment.belongsTo(db.User, { foreignKey: "id_user" });

db.ClassSchedule.hasMany(db.ClassEnrollment, { foreignKey: "id_schedule" });
db.ClassEnrollment.belongsTo(db.ClassSchedule, { foreignKey: "id_schedule" });

db.Class.hasMany(db.ClassSchedule, { foreignKey: "id_class" });
db.ClassSchedule.belongsTo(db.Class, { foreignKey: "id_class" });
 
// Association between Class and User (teacher)
db.User.hasMany(db.Class, { foreignKey: 'teacher_id', as: 'classes' });
db.Class.belongsTo(db.User, { foreignKey: 'teacher_id', targetKey: 'id_user', as: 'teacher' });

db.ClassSchedule.belongsTo(db.ClassScheduleTemplate, {foreignKey:'id_template'}); 
db.ClassScheduleTemplate.hasMany(db.ClassSchedule, {foreignKey:'id_template'});

db.Promotion.belongsToMany(db.Package, {
	through: db.PromotionPackage,
	foreignKey: "id_promotion",
	otherKey: "id_package",
});
db.Package.belongsToMany(db.Promotion, {
	through: db.PromotionPackage,
	foreignKey: "id_package",
	otherKey: "id_promotion",
});
db.Promotion.hasMany(db.PromotionPackage, { foreignKey: "id_promotion" });
db.PromotionPackage.belongsTo(db.Promotion, { foreignKey: "id_promotion" });
db.Package.hasMany(db.PromotionPackage, { foreignKey: "id_package" });
db.PromotionPackage.belongsTo(db.Package, { foreignKey: "id_package" });

db.User.hasMany(db.PurchaseOrder, { foreignKey: "id_user" });
db.PurchaseOrder.belongsTo(db.User, { foreignKey: "id_user" });
db.Package.hasMany(db.PurchaseOrder, { foreignKey: "id_package" });
db.PurchaseOrder.belongsTo(db.Package, { foreignKey: "id_package" });
db.Promotion.hasMany(db.PurchaseOrder, { foreignKey: "id_promotion" });
db.PurchaseOrder.belongsTo(db.Promotion, { foreignKey: "id_promotion" });

db.Promotion.hasMany(db.PromotionRedemption, { foreignKey: "id_promotion" });
db.PromotionRedemption.belongsTo(db.Promotion, { foreignKey: "id_promotion" });
db.User.hasMany(db.PromotionRedemption, { foreignKey: "id_user" });
db.PromotionRedemption.belongsTo(db.User, { foreignKey: "id_user" });
db.Package.hasMany(db.PromotionRedemption, { foreignKey: "id_package" });
db.PromotionRedemption.belongsTo(db.Package, { foreignKey: "id_package" });
db.PurchaseOrder.hasMany(db.PromotionRedemption, { foreignKey: "id_purchase_order" });
db.PromotionRedemption.belongsTo(db.PurchaseOrder, { foreignKey: "id_purchase_order" });
db.Payment.hasMany(db.PromotionRedemption, { foreignKey: "id_payment" });
db.PromotionRedemption.belongsTo(db.Payment, { foreignKey: "id_payment" });