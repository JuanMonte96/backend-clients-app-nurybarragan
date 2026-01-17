import { db } from "../models/db.js";
import dotenv from 'dotenv'
import QRcode from 'qrcode'
import { localToUTC, utcToLocal, extractDateAndTime } from "../services/timezone.js";
import { DateTime } from "luxon";

dotenv.config()
const API_URL = process.env.API_URL

export const createdScheduleTemplate = async (req, res) => {
    try {
        const { idClass, startDate, startHour, endHour, timeZone='Europe/Paris', intervaleDays=7, isEnable=true } = req.body;

        const classVerify = await db.Class.findByPk(idClass);

        if (!classVerify) {
            return res.status(404).json({
                status: "Not Found",
                message: "the class doesnt exist anymore"
            })
        }

        // Validar que no exista un template idéntico
        const dayOfWeek = DateTime.fromISO(startDate, { zone: timeZone }).weekday % 7;
        
        const existingTemplate = await db.ClassScheduleTemplate.findOne({
            where: {
                id_class: idClass,
                day_of_week: dayOfWeek,
                start_time: startHour,
                end_time: endHour,
                time_zone: timeZone
            }
        });

        if (existingTemplate) {
            return res.status(409).json({
                status: "Conflict",
                message: "A template with the same characteristics (day, time, and timezone) already exists for this class"
            })
        }

        const template = await db.ClassScheduleTemplate.create({
            id_class: idClass,
            day_of_week: dayOfWeek,
            start_time: startHour,
            end_time: endHour,
            time_zone: timeZone,
            interval_days: intervaleDays,
            is_enabled: isEnable
        })

        if (!template) {
            return res.status(400).json({
                status: "Bad Request",
                message: "The template has not created correctly"
            })
        }

        const startTimeUtc = localToUTC(startDate, startHour, timeZone);
        const endTimeUtc = localToUTC(startDate, endHour, timeZone);

        const { date: dateDB, time: startTimeDB } = extractDateAndTime(startTimeUtc)
        const { time: endTimeDB } = extractDateAndTime(endTimeUtc)

        const scheduleInstance = await db.ClassSchedule.create({
            id_class: idClass,
            id_template: template.id_template,
            date_class: dateDB,
            start_time: startTimeDB,
            end_time: endTimeDB,
            time: timeZone,
            start_timestamp: startTimeUtc,
            end_timestamp: endTimeUtc,
            is_active: true
        })

        if (!scheduleInstance) return res.status(400).json({
            status: 'Bad Request',
            message: 'schedule was not created the good way please try it again'
        })

        const qrUrl = `${API_URL}/api/attendance/scan-qr/${scheduleInstance.id_schedule}`;

        const qrImage = await QRcode.toDataURL(qrUrl)

        await scheduleInstance.update({ qr_code_url: qrImage })

        return res.status(201).json({
            status: "created",
            message: "template and Instance created correctly",
            templateId: template.id_template,
            scheduleId: scheduleInstance.id_schedule,
            firstDate: dateDB,
            startHour,
            endHour,
            timeZone,
        })
    } catch (error) {
        return res.status(500).json({
            status: "Internal Server Error",
            message: `An error has ocurred:${error}`
        })
    }
}


export const createUnicSchedule = async (req, res) => {
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

        const startTimeUTC = localToUTC(dateClass, startHour, timeZone);
        const endTimeUTC = localToUTC(dateClass, endHour, timeZone);

        const { date: dateDB, time: startTimeDB } = extractDateAndTime(startTimeUTC)
        const { time: endTimeDB } = extractDateAndTime(endTimeUTC)

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

        await newSchedule.update({ qr_code_url: qrImage })

        const startLocal = utcToLocal(newSchedule.start_timestamp, userTimezone);
        const endLocal = utcToLocal(newSchedule.end_timestamp, userTimezone);

        console.log(startLocal.time, endLocal.time)

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

        console.log(startLocal.time, endLocal.time)

        return res.status(200).json({
            status: 'Success',
            message: 'Schedule found successfully',
            schedule: {
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

export const getAllSchedulesByClass = async (req, res) => {
    try {
        const { classId } = req.params;
        const userTimezone = req.user.timezone || 'Europe/Paris';

        if (!classId) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'Class id is required'
            })
        }

        // Verificar que la clase existe
        const classExists = await db.Class.findByPk(classId);
        if (!classExists) {
            return res.status(404).json({
                status: 'Not found',
                message: 'The class does not exist'
            })
        }

        // Traer todos los horarios asociados a la clase
        const schedules = await db.ClassSchedule.findAll({
            where: { id_class: classId }
        });

        if (!schedules || schedules.length === 0) {
            return res.status(404).json({
                status: 'Not found',
                message: 'No schedules found for this class'
            })
        }

        // Convertir timestamps a zona horaria local del usuario
        const schedulesWithLocalTime = schedules.map(schedule => {
            const startLocal = utcToLocal(schedule.start_timestamp, userTimezone);
            const endLocal = utcToLocal(schedule.end_timestamp, userTimezone);

            return {
                id_schedule: schedule.id_schedule,
                id_class: schedule.id_class,
                date_class: schedule.date_class,
                start_time: startLocal.time,
                end_time: endLocal.time,
                time_zone: schedule.time_zone,
                time_zone_user: userTimezone,
                start_timestamp: schedule.start_timestamp,
                end_timestamp: schedule.end_timestamp,
                qr_code_url: schedule.qr_code_url,
                is_active: schedule.is_active
            }
        });

        return res.status(200).json({
            status: 'Success',
            message: 'Schedules retrieved successfully',
            total: schedulesWithLocalTime.length,
            schedules: schedulesWithLocalTime
        })

    } catch (error) {
        return res.status(500).json({
            status: "Error",
            message: `Server connection was lost: ${error}`
        })
    }
};