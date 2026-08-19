import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";

export const PackageCategory = sequelize.define(
  "PackageCategory",
  {
    id_category: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    category_name_spanish: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    category_name_english: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    category_name_french: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    order_visualization: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "package_category",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);
