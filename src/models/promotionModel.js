import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";

export const Promotion = sequelize.define("Promotion", {
  id_promotion: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  name_spanish: { type: DataTypes.TEXT, allowNull: false },
  name_english: { type: DataTypes.TEXT, allowNull: false },
  name_french: { type: DataTypes.TEXT, allowNull: false },
  description_spanish: { type: DataTypes.TEXT, allowNull: false },
  description_english: { type: DataTypes.TEXT, allowNull: false },
  description_french: { type: DataTypes.TEXT, allowNull: false },
  promotion_type: { type: DataTypes.STRING, allowNull: false },
  discount_percentage: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  discount_amount_minor: { type: DataTypes.BIGINT, allowNull: true },
  currency: { type: DataTypes.STRING(3), allowNull: true },
  benefit_code: { type: DataTypes.TEXT, allowNull: true },
  benefit_snapshot: { type: DataTypes.JSONB, allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  first_purchase_only: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  applies_to_all_packages: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  starts_at: { type: DataTypes.DATE, allowNull: true },
  ends_at: { type: DataTypes.DATE, allowNull: true },
  stripe_coupon_id: { type: DataTypes.TEXT, allowNull: true },
  archived_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: "promotions",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
});
