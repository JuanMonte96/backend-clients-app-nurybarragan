import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";

export const Attendance = sequelize.define('Attendance', 
    {
        id_attendance: {
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
        id_schedule: {
            type: DataTypes.STRING,
            allowNull: false,
            foreignKey: true
        },
        validated_by: {
            type: DataTypes.STRING,
            allowNull: true,
            foreignKey: true
        }
    },{
        tableName: 'attendances',
        timestamps: false,  
        createdAt: 'scanned_at',
        updatedAt: false
    }
)