import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";

export const PromotionRedemption = sequelize.define("PromotionRedemption", {
  id_redemption: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  id_promotion: { type: DataTypes.UUID, allowNull: false },
  id_user: { type: DataTypes.UUID, allowNull: true },
  id_package: { type: DataTypes.UUID, allowNull: false },
  id_purchase_order: { type: DataTypes.UUID, allowNull: false },
  id_payment: { type: DataTypes.UUID, allowNull: true },
  email: { type: DataTypes.TEXT, allowNull: false },
  normalized_email: { type: DataTypes.TEXT, allowNull: false },
  stripe_checkout_session_id: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "PENDING" },
  promotion_type_snapshot: { type: DataTypes.STRING, allowNull: false },
  promotion_name_snapshot: { type: DataTypes.JSONB, allowNull: false },
  price_before_minor: { type: DataTypes.BIGINT, allowNull: false },
  discount_amount_minor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  price_after_minor: { type: DataTypes.BIGINT, allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false },
  benefit_snapshot: { type: DataTypes.JSONB, allowNull: true },
  redeemed_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: "promotion_redemptions",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
});
