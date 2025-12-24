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
      allowNull: false,
      unique: true,
    },
    telephone_user: {
      type: DataTypes.NUMBER,
      allowNull: false,
      unique: true
    },
    password_user: DataTypes.TEXT,
    role: {
      type: DataTypes.ENUM('student', 'teacher', 'admin'),
      defaultValue: 'student'
    },
    medical_certificated: {
      type: DataTypes.TEXT,
      defaultValue: "Defaultcertificate.pdf"
    },
    is_blocked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    must_change_pass :{
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false
    },
    time_zone:{
      type: DataTypes.STRING,
      defaultValue: 'Europe/Paris',
      allowNull: false
    }
  }, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'update_at'
  }
);

