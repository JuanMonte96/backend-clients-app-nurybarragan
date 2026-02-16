import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";

export const Class = sequelize.define('Class',
    {
        id_class:{
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull:false,
        },
        title_class: DataTypes.TEXT,
        description_english: DataTypes.TEXT,
        description_spanish: DataTypes.TEXT,
        description_french: DataTypes.TEXT,
        level_class: {
            type: DataTypes.ENUM('beginner', 'intermediate', 'advanced'),
            defaultValue:'beginner'
        },
        teacher_id: {
            type: DataTypes.STRING,
            allowNull: false,
            foreignKey: true
        },
        is_blocked: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    },{
        tableName: 'classes',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
)


