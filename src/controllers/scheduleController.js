import { db } from "../models/db.js";
import dotenv from 'dotenv'
import QRcode from 'qrcode'
import { localToUTC, utcToLocal, extractDateAndTime } from "../services/timezone.js";


dotenv.config()
const API_URL = process.env.API_URL

export const createSchedule = async (req, res) => {
    try {
        const { idClass, dateClass, startHour, endHour, timeZone } = req.body;

        const userTimezone = req.user.timezone || 'Europe/Paris';

        const classById = await db.Class.findByPk(idClass);
        
        if (!classById) {
            return res.status(404).json({
                status: 'Not found',
                message: 'The class does not exist please try it again'
            })
        }

        const startTimeUTC  = localToUTC(dateClass, startHour, timeZone);
        const endTimeUTC = localToUTC(dateClass, endHour, timeZone);

        const {date: dateDB , time: startTimeDB} = extractDateAndTime(startTimeUTC)
        const {time: endTimeDB} = extractDateAndTime(endTimeUTC)

        const newSchedule = await db.ClassSchedule.create({
            id_class: idClass,
            date_class: dateDB,
            start_time: startTimeDB,
            end_time: endTimeDB,
            time_zone: timeZone,
            start_timestamp: startTimeUTC,
            end_timestamp: endTimeUTC
        })

        if (!newSchedule) return res.status(400).json({
            status: 'Bad Request',
            message: 'schedule was not created the good way please try it again'
        })

        const qrUrl = `${API_URL}/api/attendance/scan-qr/${newSchedule.id_schedule}`;

        const qrImage = await QRcode.toDataURL(qrUrl)

        await newSchedule.update({qr_code_url: qrImage})

        const startLocal = utcToLocal(newSchedule.start_timestamp, userTimezone);
        const endLocal = utcToLocal(newSchedule.end_timestamp, userTimezone);

        console.log(startLocal.time,endLocal.time)

        return res.status(201).json({
            status: 'Created',
            message: 'Schedule created successfully',
            scheduleId: newSchedule.id_schedule,
            date_class: newSchedule.date_class,
            start_time: startLocal.time,
            end_time: endLocal.time,
            time_zone: newSchedule.time_zone,
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
        const userTimezone = req.user.timezone || 'Europe/Paris';

        console.log('User Time Zone:', userTimezone);
        
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

        const startLocal = utcToLocal(scheduleFind.start_timestamp, userTimezone);
        const endLocal = utcToLocal(scheduleFind.end_timestamp, userTimezone);

        console.log(startLocal.time,endLocal.time)

        return res.status(200).json({
            status: 'Success',
            message: 'Schedule found successfully',
            schedule : {
                id_schedule: scheduleFind.id_schedule,
                id_class: scheduleFind.id_class,
                date_class: scheduleFind.date_class,
                start_time: startLocal.time,
                end_time: endLocal.time,
                time_zone: scheduleFind.time_zone,
                start_timestamp: scheduleFind.start_timestamp,
                end_timestamp: scheduleFind.end_timestamp,
                qr_code_url: scheduleFind.qr_code_url,
                is_active: scheduleFind.is_active, 
            }
        })

    } catch (error) {
        return res.status(500).json({
            status: "Error",
            message: `Server connection was lost: ${error}`
        })
    }
}

// export const getAllSchedules = async (req, res) => {
//     try {
//         const 

//     } catch (error) {
        
//     }
// };