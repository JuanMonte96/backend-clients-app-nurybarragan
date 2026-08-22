import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";

export const PackagePaymentOption = sequelize.define("PackagePaymentOption", {
  id_payment_option: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  id_package: { type: DataTypes.UUID, allowNull: false },
  payment_mode: { type: DataTypes.STRING, allowNull: false, defaultValue: "FULL" },
  installment_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  interval_unit: { type: DataTypes.STRING, allowNull: true },
  interval_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: "eur" },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  stripe_price_id: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: "package_payment_options",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
});
