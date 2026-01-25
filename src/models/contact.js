import { DataTypes} from 'sequelize';
import {sequelize} from '../config/conection.js';

export const Contact = sequelize.define('Contact', 
    {
        id_contact: {
            type:DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            allowNull: false
        },
        name_client: {
            type: DataTypes.STRING,
            allowNull: false
        },
        email_client: {
            type: DataTypes.STRING,
            allowNull: false
        },
        telephone_client: {
            type: DataTypes.STRING,
            allowNull: false
        },
        subject: {
            type: DataTypes.STRING,
            defaultValue:'Contact Support Or Sales'
        },
        description : {
            type: DataTypes.TEXT, 
            allowNull: false, 
        },
        type_client: {
            type: DataTypes.ENUM("client", "admin", "teacher"),
            defaultValue: "client"
        },
    },{
        tableName: 'contact_us',
        timestamps: false,  
        createdAt: 'created_at',
        updatedAt: 'update_at' 
        
    }
)