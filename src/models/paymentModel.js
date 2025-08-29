import { DataTypes } from "sequelize";
import { sequelize } from "../config/conection.js";

export const Payment = sequelize.define('Payment',
    {
        id_payment: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        id_user: {
            type: DataTypes.UUID,
            allowNull: false,
            foreignKey: true
        },
        id_subscription: {
            type: DataTypes.UUID,
            allowNull: false,
            foreignKey: true
        },
        payment_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        method: {
            type: DataTypes.STRING,
            allowNull: false
        },
        external_ref: {
            type: DataTypes.STRING,
            allowNull: false
        }
    }, {
    tableName: 'payments',
    timestamps: true,
    created_at: 'created_at',
    updated_at: 'updated_at'
}
);