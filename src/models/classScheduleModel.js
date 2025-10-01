import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";


export const ClassSchedule = sequelize.define('ClassSchedule',
    {
        id_schedule: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        id_class: {
            type: DataTypes.STRING,
            allowNull: false,
            foreignKey: true
        },
        date_class: {
            type: DataTypes.DATE,
            allowNull: false
        },
        start_time: {
            type: DataTypes.TIME,
            allowNull: false
        },
        end_time: {
            type: DataTypes.TIME,
            allowNull: false
        },
        qr_code_url:DataTypes.TEXT,

    },{
        tablename: 'class_schedules',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at' 
    }   
);