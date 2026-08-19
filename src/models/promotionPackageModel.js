import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";

export const PromotionPackage = sequelize.define("PromotionPackage", {
  id_promotion: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
  id_package: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
}, {
  tableName: "promotion_packages",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: false,
});
