import { db } from "../models/db.js";
import dotenv from 'dotenv'
import QRcode from 'qrcode'

dotenv.config()
const API_URL = process.env.API_URL

export const createSchedule = async (req, res) => {
    try {
        const { idClass, dateClass, startHour, endHour } = req.body;

        const classById = await db.Class.findByPk(idClass);
        if (!classById) {
            return res.status(404).json({
                status: 'Not found',
                message: 'The class does not exist please try it again'
            })
        }

        const qrUrl = `${API_URL}/api/attendance/checkIn`;

        const qrImage = await QRcode.toDataURL(qrUrl)

        const newSchedule = await db.ClassSchedule.create({
            id_class: idClass,
            date_class: dateClass,
            start_time: startHour,
            end_time: endHour,
            qr_code_url: qrImage
        })

        if (!newSchedule) return res.status(400).json({
            status: 'Bad Request',
            message: 'schedule was not created the good way please try it again'
        })


        return res.status(201).json({
            status: 'Created',
            message: 'Schedule created successfully',
            newSchedule
        })


    } catch (error) {
        return res.status(500).json({
            status: "Error",
            message: `Sever connection was lost: ${error}`
        })
    }
}

export const getScheduleById = async (req, res) => {
    try {
        const { id } = req.params
        if (!id) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'Schedule id is required'
            })
        }

        const scheduleFind = await db.ClassSchedule.findByPk(id)

        if (!scheduleFind) {
            return res.status(404).json({
                status: 'Not found',
                message: 'Schedule was not found in the database'
            })
        }

        return res.status(200).json({
            status: 'Success',
            message: 'Schedule found successfully',
            scheduleFind
        })

    } catch (error) {
        return res.status(500).json({
            status: "Error",
            message: `Server connection was lost: ${error}`
        })
    }
}

