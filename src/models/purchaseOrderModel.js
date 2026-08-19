import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";

export const PurchaseOrder = sequelize.define("PurchaseOrder", {
  id_purchase_order: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  id_user: { type: DataTypes.UUID, allowNull: true },
  id_package: { type: DataTypes.UUID, allowNull: false },
  id_promotion: { type: DataTypes.UUID, allowNull: true },
  email: { type: DataTypes.TEXT, allowNull: false },
  normalized_email: { type: DataTypes.TEXT, allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: "eur" },
  price_before_minor: { type: DataTypes.BIGINT, allowNull: false },
  discount_amount_minor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  price_after_minor: { type: DataTypes.BIGINT, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "PENDING" },
  stripe_checkout_session_id: { type: DataTypes.TEXT, allowNull: true, unique: true },
  stripe_payment_intent_id: { type: DataTypes.TEXT, allowNull: true },
  expires_at: { type: DataTypes.DATE, allowNull: false },
}, {
  tableName: "purchase_orders",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
});
