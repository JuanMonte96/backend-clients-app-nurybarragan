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
        id_enrollment: {
            type: DataTypes.STRING,
            allowNull: true,
            foreignKey: true
        },
        status:{
            type: DataTypes.ENUM('attended','no_show','excused'),
            defaultValue: 'no_show',
            allowNull: false
        }
    },{
        tableName: 'attendance',
        timestamps: false,  
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
)