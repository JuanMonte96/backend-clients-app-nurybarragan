import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";

export const User = sequelize.define('User', 
    {
    id_user: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name_user: DataTypes.TEXT,
    email_user: {
      type: DataTypes.TEXT,
      unique: true,
    },
    password_user: DataTypes.TEXT,
    role: {
      type: DataTypes.ENUM('student', 'teacher', 'admin'),
      defaultValue: 'student'
    },
    medical_certificate: DataTypes.TEXT,
    is_blocked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
  }, {
    tableName: 'users',
    timestamps: true,
    created_at: 'created_at',
    updated_at: 'updated_at'
  }
);

