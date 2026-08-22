import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";

export const PaymentPlan = sequelize.define("PaymentPlan", {
  id_payment_plan: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  id_purchase_order: { type: DataTypes.UUID, allowNull: false, unique: true },
  id_user: { type: DataTypes.UUID, allowNull: false },
  id_package: { type: DataTypes.UUID, allowNull: false },
  id_promotion: { type: DataTypes.UUID, allowNull: true },
  id_payment_option: { type: DataTypes.UUID, allowNull: false },

  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: "eur" },
  package_price_minor: { type: DataTypes.BIGINT, allowNull: false },
  promotion_discount_minor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  contractual_total_minor: { type: DataTypes.BIGINT, allowNull: false },
  paid_total_minor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  outstanding_total_minor: { type: DataTypes.BIGINT, allowNull: false },

  installment_count: { type: DataTypes.INTEGER, allowNull: false },
  interval_unit: { type: DataTypes.STRING, allowNull: true },
  interval_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },

  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "PENDING" },

  stripe_customer_id: { type: DataTypes.TEXT, allowNull: true },
  stripe_payment_method_id: { type: DataTypes.TEXT, allowNull: true },
  stripe_subscription_id: { type: DataTypes.TEXT, allowNull: true, unique: true },
  stripe_subscription_schedule_id: { type: DataTypes.TEXT, allowNull: true, unique: true },
  stripe_checkout_session_id: { type: DataTypes.TEXT, allowNull: true, unique: true },

  package_snapshot: { type: DataTypes.JSONB, allowNull: false },
  promotion_snapshot: { type: DataTypes.JSONB, allowNull: true },
  installment_snapshot: { type: DataTypes.JSONB, allowNull: false },

  started_at: { type: DataTypes.DATE, allowNull: true },
  expected_end_at: { type: DataTypes.DATE, allowNull: true },
  completed_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: "payment_plans",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
});
