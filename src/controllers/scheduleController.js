import { db } from "../models/db.js";
import dotenv from 'dotenv'
import QRcode from 'qrcode'
import { Op } from "sequelize";
import { localToUTC, utcToLocal, extractDateAndTime } from "../services/timezone.js";
import { DateTime } from "luxon";
import { sendScheduleCancellationEmail } from "../services/sendEmail.js";

dotenv.config()
const API_URL = process.env.API_URL
// La variable real configurada en el .env de este proyecto es URL_FRONTEND_BASE.
// Se mantienen FRONTEND_URL/APP_URL como alternativas por compatibilidad.
const FRONTEND_URL = process.env.URL_FRONTEND_BASE || process.env.FRONTEND_URL || process.env.APP_URL || null;

const buildQrAttendanceUrl = (scheduleId) => {
    const frontendBase = FRONTEND_URL?.replace(/\/$/, '');
    const apiBase = API_URL?.replace(/\/$/, '');

    if (frontendBase) {
        return `${frontendBase}/attendance/scan/${scheduleId}`;
    }

    return `${apiBase}/api/attendance/scan-qr/${scheduleId}`;
};

const buildLocalSchedulePayload = (dateClass, startHour, endHour, timeZone) => {
    const startTimeUTC = localToUTC(dateClass, startHour, timeZone);
    const endTimeUTC = localToUTC(dateClass, endHour, timeZone);
    const { date: dateDB, time: startTimeDB } = extractDateAndTime(startTimeUTC);
    const { time: endTimeDB } = extractDateAndTime(endTimeUTC);

    return {
        date_class: dateDB,
        start_time: startTimeDB,
        end_time: endTimeDB,
        time_zone: timeZone,
        start_timestamp: startTimeUTC,
        end_timestamp: endTimeUTC,
    };
};

export const createdScheduleTemplate = async (req, res) => {
    try {
        const { idClass, startDate, startHour, endHour, timeZone = 'Europe/Paris', intervaleDays = 7, isEnable = true } = req.body;

        const classVerify = await db.Class.findByPk(idClass);

        if (!classVerify) {
            return res.status(404).json({
                status: "Not Found",
                message: "the class doesnt exist anymore"
            })
        }

        if (classVerify.is_blocked) {
            return res.status(409).json({
                status: 'Conflict',
                message: 'Blocked classes cannot create schedules'
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

        const schedulePayload = buildLocalSchedulePayload(startDate, startHour, endHour, timeZone);

        const scheduleInstance = await db.ClassSchedule.create({
            id_class: idClass,
            id_template: template.id_template,
            ...schedulePayload,
            is_active: true
        })

        if (!scheduleInstance) return res.status(400).json({
            status: 'Bad Request',
            message: 'schedule was not created the good way please try it again'
        })

        return res.status(201).json({
            status: "created",
            message: "template and Instance created correctly",
            templateId: template.id_template,
            scheduleId: scheduleInstance.id_schedule,
            firstDate: schedulePayload.date_class,
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

        if (classById.is_blocked) {
            return res.status(409).json({
                status: 'Conflict',
                message: 'Blocked classes cannot create schedules'
            })
        }

        const schedulePayload = buildLocalSchedulePayload(dateClass, startHour, endHour, timeZone);

        const newSchedule = await db.ClassSchedule.create({
            id_class: idClass,
            ...schedulePayload
        })

        if (!newSchedule) return res.status(400).json({
            status: 'Bad Request',
            message: 'schedule was not created the good way please try it again'
        })

        const qrUrl = buildQrAttendanceUrl(newSchedule.id_schedule);

        const qrImage = await QRcode.toDataURL(qrUrl)

        await newSchedule.update({ qr_code_url: qrImage })

        const startLocal = utcToLocal(newSchedule.start_timestamp, userTimezone);
        const endLocal = utcToLocal(newSchedule.end_timestamp, userTimezone);

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
                is_active: scheduleFind.is_active
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
        const { date, schedule_status = 'active' } = req.query;
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

        const whereSchedule = {
            id_class: classId
        };

        if (schedule_status === 'active') {
            whereSchedule.is_active = true;
        } else if (schedule_status === 'inactive') {
            whereSchedule.is_active = false;
        }

        if (date) {
            const parsedDate = new Date(date);
            if (Number.isNaN(parsedDate.getTime())) {
                return res.status(400).json({
                    status: 'Bad Request',
                    message: 'Invalid date format. Use YYYY-MM-DD.'
                })
            }

            const startDate = new Date(parsedDate);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(parsedDate);
            endDate.setHours(23, 59, 59, 999);

            whereSchedule.date_class = { [Op.between]: [startDate, endDate] };
        }

        // Traer todos los horarios asociados a la clase
        const schedules = await db.ClassSchedule.findAll({
            where: whereSchedule,
            order: [['start_timestamp', 'ASC']]
        });

        if (!schedules || schedules.length === 0) {
            return res.status(200).json({
                status: 'Success',
                message: 'No schedules found for this class',
                total: 0,
                schedules: []
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

export const updateScheduleById = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            idClass,
            dateClass,
            startHour,
            endHour,
            timeZone,
            isActive,
            scope = 'single'
        } = req.body;

        const schedule = await db.ClassSchedule.findByPk(id);

        if (!schedule) {
            return res.status(404).json({ status: 'Not Found', message: 'Schedule not found' });
        }

        const nextClassId = idClass || schedule.id_class;
        const classData = await db.Class.findByPk(nextClassId);

        if (!classData) {
            return res.status(404).json({ status: 'Not Found', message: 'Class not found' });
        }

        if (classData.is_blocked) {
            return res.status(409).json({ status: 'Conflict', message: 'Blocked classes cannot update schedules' });
        }

        const nextDateClass = dateClass || schedule.date_class;
        const nextStartHour = startHour || schedule.start_time;
        const nextEndHour = endHour || schedule.end_time;
        const nextTimeZone = timeZone || schedule.time_zone || 'Europe/Paris';
        const nextPayload = buildLocalSchedulePayload(nextDateClass, nextStartHour, nextEndHour, nextTimeZone);

        if (scope === 'series' && schedule.id_template) {
            const futureSchedules = await db.ClassSchedule.findAll({
                where: {
                    id_template: schedule.id_template,
                    start_timestamp: { [Op.gte]: schedule.start_timestamp }
                }
            });

            for (const futureSchedule of futureSchedules) {
                const futurePayload = buildLocalSchedulePayload(
                    futureSchedule.date_class,
                    nextStartHour,
                    nextEndHour,
                    nextTimeZone
                );

                await futureSchedule.update({
                    id_class: nextClassId,
                    ...futurePayload,
                    is_active: typeof isActive === 'boolean' ? isActive : futureSchedule.is_active,
                });
            }

            const template = await db.ClassScheduleTemplate.findByPk(schedule.id_template);
            if (template) {
                await template.update({
                    id_class: nextClassId,
                    start_time: nextStartHour,
                    end_time: nextEndHour,
                    time_zone: nextTimeZone,
                });
            }

            return res.status(200).json({
                status: 'Success',
                message: 'Schedule series updated successfully'
            });
        }

        await schedule.update({
            id_class: nextClassId,
            ...nextPayload,
            is_active: typeof isActive === 'boolean' ? isActive : schedule.is_active,
        });

        return res.status(200).json({
            status: 'Success',
            message: 'Schedule updated successfully',
            schedule
        });
    } catch (error) {
        return res.status(500).json({ status: 'Internal Server Error', message: error.message });
    }
};

export const toggleScheduleStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ status: 'Bad Request', message: 'isActive must be boolean' });
        }

        const schedule = await db.ClassSchedule.findByPk(id);
        if (!schedule) {
            return res.status(404).json({ status: 'Not Found', message: 'Schedule not found' });
        }

        await schedule.update({ is_active: isActive });

        return res.status(200).json({
            status: 'Success',
            message: isActive ? 'Schedule activated successfully' : 'Schedule inactivated successfully',
            schedule
        });
    } catch (error) {
        return res.status(500).json({ status: 'Internal Server Error', message: error.message });
    }
};

export const cancelScheduleById = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason = '', notify = true, scope = 'single' } = req.body;

        const schedule = await db.ClassSchedule.findByPk(id, {
            include: [{ model: db.Class, attributes: ['id_class', 'title_class', 'is_blocked'] }]
        });

        if (!schedule) {
            return res.status(404).json({ status: 'Not Found', message: 'Schedule not found' });
        }

        let targets = [schedule];

        if (scope !== 'single' && schedule.id_template) {
            targets = await db.ClassSchedule.findAll({
                where: {
                    id_template: schedule.id_template,
                    start_timestamp: { [Op.gte]: schedule.start_timestamp }
                }
            });

            const template = await db.ClassScheduleTemplate.findByPk(schedule.id_template);
            if (template) {
                await template.update({ is_enabled: false });
            }
        }

        if (!schedule.is_active) {
            const existingEnrollments = await db.ClassEnrollment.findAll({
                where: { id_schedule: schedule.id_schedule, status: 'active' },
                include: [{ model: db.User, attributes: ['id_user', 'name_user', 'email_user'] }],
            });

            const existingAttendances = await db.Attendance.findAll({
                where: {
                    id_schedule: { [Op.in]: targets.map((item) => item.id_schedule) },
                    status: { [Op.ne]: 'excused' },
                }
            });

            if (existingEnrollments.length === 0 && existingAttendances.length === 0) {
                return res.status(200).json({
                    status: 'Success',
                    message: 'Schedule already cancelled',
                    summary: {
                        reason,
                        affected_users: 0,
                        emails_sent: 0,
                        emails_failed: 0,
                    },
                    emails_failed: [],
                    cancellation_log: [],
                });
            }
        }

        const transaction = await db.sequelize.transaction();
        const affectedUsers = [];
        const cancellationLog = [];

        try {
            for (const targetSchedule of targets) {
                const enrollments = await db.ClassEnrollment.findAll({
                    where: { id_schedule: targetSchedule.id_schedule, status: 'active' },
                    include: [{ model: db.User, attributes: ['id_user', 'name_user', 'email_user'] }],
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                });

                for (const enrollment of enrollments) {
                    affectedUsers.push({
                        id_user: enrollment.User?.id_user,
                        name_user: enrollment.User?.name_user,
                        email_user: enrollment.User?.email_user,
                        schedule: targetSchedule,
                    });

                    const attendance = await db.Attendance.findOne({
                        where: {
                            id_enrollment: enrollment.id_enrollment,
                            id_schedule: targetSchedule.id_schedule,
                            id_user: enrollment.id_user,
                        },
                        transaction,
                        lock: transaction.LOCK.UPDATE,
                    });

                    if (attendance) {
                        if (attendance.status !== 'excused') {
                            await attendance.update({ status: 'excused' }, { transaction });
                        }
                    } else {
                        await db.Attendance.create({
                            id_enrollment: enrollment.id_enrollment,
                            id_schedule: targetSchedule.id_schedule,
                            id_user: enrollment.id_user,
                            status: 'excused',
                        }, { transaction });
                    }

                    cancellationLog.push({
                        scheduleId: targetSchedule.id_schedule,
                        enrollmentId: enrollment.id_enrollment,
                        userId: enrollment.id_user,
                    });
                }

                await targetSchedule.update({ is_active: false }, { transaction });
            }

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        const emailsSent = [];
        const emailsFailed = [];

        if (notify) {
            const uniqueNotifications = new Map();

            for (const item of affectedUsers) {
                if (!item?.email_user) continue;
                const key = `${item.email_user}:${item.schedule.id_schedule}`;
                if (!uniqueNotifications.has(key)) {
                    uniqueNotifications.set(key, item);
                }
            }

            for (const item of uniqueNotifications.values()) {
                const dateTimeLocal = utcToLocal(item.schedule.start_timestamp, item.schedule.time_zone || 'Europe/Paris');
                const result = await sendScheduleCancellationEmail({
                    to: item.email_user,
                    userName: item.name_user || 'client',
                    className: schedule.Class?.title_class || 'Cours',
                    classDate: dateTimeLocal.date || String(item.schedule.date_class || '').slice(0, 10),
                    classTime: dateTimeLocal.time || item.schedule.start_time,
                });

                if (result.success) {
                    emailsSent.push(item.email_user);
                } else {
                    emailsFailed.push({ email: item.email_user, error: result.error });
                }
            }
        }

        return res.status(200).json({
            status: 'Success',
            message: 'Schedule cancelled successfully',
            summary: {
                reason,
                affected_users: affectedUsers.length,
                emails_sent: emailsSent.length,
                emails_failed: emailsFailed.length,
            },
            emails_failed: emailsFailed,
            cancellation_log: cancellationLog,
        });
    } catch (error) {
        return res.status(500).json({ status: 'Internal Server Error', message: error.message });
    }
};

export const qrAttendaceShow = async (req, res) => {
    try {
        const { scheduleId } = req.params;

        const schedule = await db.ClassSchedule.findByPk(scheduleId);

        if (!schedule) {
            return res.status(404).json({
                status: "Not Found",
                message: "Schedule doesnt was not found"
            })
        }

        // Regeneramos siempre a partir de la URL correcta del frontend.
        // Esto auto-corrige QRs antiguos (que apuntaban al backend por el
        // desajuste de variable de entorno) y cubre horarios creados por
        // plantilla que se guardaron sin qr_code_url. QRcode.toDataURL es
        // determinista, por lo que solo persistimos cuando realmente cambia.
        const qrUrl = buildQrAttendanceUrl(schedule.id_schedule);
        const qrImage = await QRcode.toDataURL(qrUrl);
        if (schedule.qr_code_url !== qrImage) {
            await schedule.update({ qr_code_url: qrImage });
        }

        return res.status(200).json({
            status:"Success",
            message:"Qr found it correctly",
            qrImage
        })
    } catch (error) {
        return res.status(500).json({
            status:"internal server error",
            message: `There was an error:${error.message}`
        })
    }
}