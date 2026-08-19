import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";

export const StripeEvent = sequelize.define("StripeEvent", {
  id_event: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  stripe_event_id: { type: DataTypes.TEXT, allowNull: false, unique: true },
  event_type: { type: DataTypes.TEXT, allowNull: false },
  object_id: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "PENDING" },
  processed_at: { type: DataTypes.DATE, allowNull: true },
  error_message: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: "stripe_events",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
});
