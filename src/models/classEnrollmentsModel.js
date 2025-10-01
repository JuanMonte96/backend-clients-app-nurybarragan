import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";
import { id } from "zod/locales";

export const ClassEnrollment = sequelize.define('ClassEnrollment',
    {
        id_enrollment: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        id_user: {
            type: DataTypes.STRING,
            allowNull: false,
            foreignKey: true
        },
        id_class: {
            type: DataTypes.STRING,
            allowNull: false,
            foreignKey: true
        },
        status: {
            type:DataTypes.ENUM('active', 'blocked', 'removed'),
            defaultValue: 'active',
            allowNull: false
        }
    },{
        tableName: 'class_enrollments',
        timestamps: true,
        createdAt: 'enrolled_at',
        updatedAt: 'updated_at'
    }
)