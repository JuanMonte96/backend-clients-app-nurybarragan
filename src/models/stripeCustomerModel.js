import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";

export const StripeCustomer = sequelize.define("StripeCustomer", {
  id_stripe_customer: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  id_user: { type: DataTypes.UUID, allowNull: false, unique: true },
  stripe_customer_id: { type: DataTypes.TEXT, allowNull: false, unique: true },
}, {
  tableName: "stripe_customers",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
});
