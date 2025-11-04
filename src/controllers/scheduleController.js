import { db } from "../models/db.js";
import dotenv from 'dotenv'

dotenv.config()
const API_URL = process.env.API_URL

export const createSchedule = async (req, res) => {
    try {
        const { idClass, userId, dateClass, start, end } = req.body;

        const classById = await db.Class.findByPk(idClass);
        if (!classById) {
            return res.status(404).json({
                status: 'Not found',
                message: 'The class does not exist please try it again'
            })
        }


    } catch (error) {

    }
}