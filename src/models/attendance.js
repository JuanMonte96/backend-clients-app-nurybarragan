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
        // La tabla real tiene created_at/updated_at (timestamptz NOT NULL DEFAULT now()).
        // Con timestamps:false Sequelize no los seleccionaba y el roster devolvia
        // attendance_registered_at en null. Se habilitan mapeados a las columnas snake_case,
        // igual que ClassEnrollment y ClassSchedule.
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
)