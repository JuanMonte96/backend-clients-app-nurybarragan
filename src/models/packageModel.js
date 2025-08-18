import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";

export const Package = sequelize.define('Package',
  {
    id_package: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name_package: DataTypes.TEXT,
    description_package: DataTypes.TEXT,
    price_package: DataTypes.FLOAT,
    duration_package: DataTypes.INTEGER,
    class_limit: DataTypes.INTEGER,
    stripe_product_id: DataTypes.TEXT,
    stripe_price_id: DataTypes.TEXT
  },
  {
    tableName: 'packages',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

