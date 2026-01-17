import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";

export const ClassScheduleTemplate = sequelize.define(
  "ClassScheduleTemplate",
  {
    id_template: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },

    id_class: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: "classes",
        key: "id_class"
      },
      foreignKey: true
    },

    day_of_week: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
        max: 6
      }
      // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    },

    start_time: {
      type: DataTypes.TIME,
      allowNull: false
    },

    end_time: {
      type: DataTypes.TIME,
      allowNull: false
    },

    time_zone: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Europe/Paris"
    },

    interval_days: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 7
    },

    is_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  },
  {
    tableName: "class_schedule_templates",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
);
