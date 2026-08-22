import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";

export const PaymentPlanInstallment = sequelize.define("PaymentPlanInstallment", {
  id_installment: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  id_payment_plan: { type: DataTypes.UUID, allowNull: false },
  installment_number: { type: DataTypes.INTEGER, allowNull: false },
  expected_amount_minor: { type: DataTypes.BIGINT, allowNull: false },
  paid_amount_minor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  expected_at: { type: DataTypes.DATE, allowNull: false },
  processing_at: { type: DataTypes.DATE, allowNull: true },
  paid_at: { type: DataTypes.DATE, allowNull: true },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "SCHEDULED" },
  stripe_invoice_id: { type: DataTypes.TEXT, allowNull: true, unique: true },
  stripe_payment_intent_id: { type: DataTypes.TEXT, allowNull: true, unique: true },
  stripe_charge_id: { type: DataTypes.TEXT, allowNull: true, unique: true },
  failure_code: { type: DataTypes.TEXT, allowNull: true },
  failure_message: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: "payment_plan_installments",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
});
