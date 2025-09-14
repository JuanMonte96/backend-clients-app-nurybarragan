import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";

export const Subscription = sequelize.define('Subscription',
    {
        id_subscription: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            allowNull: false,
            primaryKey: true
        },
        id_user: {
            type: DataTypes.STRING,
            allowNull: false,
            foreignKey: true
        },
        id_package: {
            type: DataTypes.STRING,
            allowNull: false,
            foreignKey: true
        },
        status: {
            type: DataTypes.ENUM('active', 'expired', 'cancelled'),
            defaultValue: 'active'
        },
        start_date: {
            type: DataTypes.DATE,
            allowNull: false
        },
        end_date: {
            type: DataTypes.DATE,
            allowNull: false
        },
        id_payment: {
            type: DataTypes.STRING,
            allowNull: false,
            foreignKey: true
        }

    }, {
    tableName: 'subscriptions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
}
);