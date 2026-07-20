import { db } from '../models/db.js';
import { utcToLocal, isTimeWithinRange, getNowInTimeZone } from '../services/timezone.js';
import { Op } from 'sequelize';

const resolveAttendanceState = (attendance) => {
    if (!attendance) return 'pending';
    return attendance.status;
};

const resolveRegistrationMethod = ({ attendance, enrollmentStatus }) => {
    if (!attendance) return '-';
    return enrollmentStatus === 'removed' ? 'manual' : 'qr';
};

export const attendanceViaQr = async (req, res) => {
    try {
        const { scheduleId } = req.params;
        const userId = req.user.id;
        const userTimezone = req.user.timezone || 'Europe/Paris';
        const status = req.body?.status || 'attended';

        if (!['attended', 'no_show', 'excused'].includes(status)) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'Invalid attendance status'
            })
        }

        const schedule = await db.ClassSchedule.findByPk(scheduleId, {
            include: [{
                model: db.Class,
                attributes: ['id_class', 'title_class', 'is_blocked']
            }]
        });
        console.log(schedule);
        if (!schedule) {
            return res.status(404).json({
                status: 'Not Found',
                message: 'Schedule not found'
            })
        }
        if (schedule.Class.is_blocked || !schedule.is_active) {
            return res.status(403).json({
                status: 'Forbidden',
                message: 'Class or Schedule is not active for attendance'
            })
        }

        const enrollment = await db.ClassEnrollment.findOne({
            where: {
                id_user: userId,
                id_schedule: scheduleId
            }
        });

        if (!enrollment) {
            return res.status(403).json({
                status: 'Forbidden',
                message: 'you are not enrolled in this class'
            })
        };

        if (enrollment.status !== 'active') {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'Your enrollment is not active'
            })
        };

        const existingAttendance = await db.Attendance.findOne({
            where: {
                id_enrollment: enrollment.id_enrollment,
                id_schedule: scheduleId,
                id_user: userId
            }

        });

        if (existingAttendance) {
            return res.status(400).json({
                status: 'Bad request',
                message: 'Attendance has already been recorded for this schedule'
            })
        }

        
        const now = getNowInTimeZone();
        const startUTC = new Date(schedule.start_timestamp);
        const endUTC = new Date(schedule.end_timestamp);

        const fifteenMinutesBefore = new Date(startUTC.getTime() - 15 * 60000);

        console.log('Now UTC:', now);
        console.log('Start UTC:', startUTC);
        console.log('Fifteen Minutes Before Start UTC:', fifteenMinutesBefore);     
        
        if(!isTimeWithinRange(now, fifteenMinutesBefore, endUTC)) {
            const startLocal = utcToLocal(startUTC, userTimezone);
            const endLocal = utcToLocal(endUTC, userTimezone);
            return res.status(400).json({
                status: 'Bad Request',
                message: `Attendance can only be marked between fifteen minutes before ${startLocal.time} and ${endLocal.time}`
            })
        }

        const transaction = await db.sequelize.transaction();
        let newAttendance;
        try {
            const existingAttendanceInTx = await db.Attendance.findOne({
                where: {
                    id_enrollment: enrollment.id_enrollment,
                    id_schedule: scheduleId,
                    id_user: userId
                },
                transaction,
                lock: transaction.LOCK.UPDATE
            });

            if (existingAttendanceInTx) {
                await transaction.rollback();
                return res.status(409).json({
                    status: 'Conflict',
                    message: 'Attendance has already been recorded for this schedule'
                })
            }

            newAttendance = await db.Attendance.create({
                id_enrollment: enrollment.id_enrollment,
                id_schedule: scheduleId,
                id_user: userId,
                status
            }, { transaction });

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        return res.status(201).json(
            {
                status: 'Created',
                message: 'Attendance recorded successfully',
                newAttendance
            })
    } catch (error) {
        return res.status(500).json({
            status: 'Internal Server error',
            message: `error: ${error.message}`
        })
    }
};

export const markAttendance = async (req, res) => {
    try {
        const { enrollmentId, userId, status = 'attended' } = req.body;

        if (!enrollmentId || !userId) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'enrollmentId and userId are required'
            })
        }

        if (!['attended', 'no_show', 'excused'].includes(status)) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'Invalid attendance status'
            })
        }

        const enrollment = await db.ClassEnrollment.findByPk(enrollmentId, {
            include: [
                {
                    model: db.ClassSchedule,
                    attributes: ['id_schedule', 'date_class', 'start_timestamp', 'end_timestamp', 'is_active']
                }
            ]
        });

        if (!enrollment) {
            return res.status(404).json({
                status: 'Not found',
                message: 'Enrollment not found'
            })
        };

        if (enrollment.id_user !== userId) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'enrollmentId does not belong to userId'
            })
        }

        if (enrollment.status !== 'active') {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'Enrollment is not active'
            })
        }

        if (!enrollment.ClassSchedule.is_active) {
            return res.status(403).json({
                status: 'Forbidden',
                message: 'Cannot mark attendance for an inactive schedule'
            })
        };

        if (req.user.role !== 'admin' && req.user.id === userId) {
            return res.status(403).json({
                status: 'Forbidden',
                message: 'You cannot mark your own attendance'
            })
        };

        const transaction = await db.sequelize.transaction();
        let attendance;
        try {
            const existingAttendance = await db.Attendance.findOne({
                where: { id_enrollment: enrollmentId, id_user: userId, id_schedule: enrollment.ClassSchedule.id_schedule },
                transaction,
                lock: transaction.LOCK.UPDATE
            });

            if (existingAttendance) {
                await transaction.rollback();
                return res.status(409).json({
                    status: 'Conflict',
                    message: 'Attendance has already been marked for this enrollment'
                })
            }

            attendance = await db.Attendance.create({
                id_enrollment: enrollmentId,
                id_user: userId,
                id_schedule: enrollment.ClassSchedule.id_schedule,
                status
            }, { transaction })

            enrollment.status = 'removed'
            await enrollment.save({ transaction })

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        return res.status(201).json({
            status: 'Created',
            message: 'Attendance marked successfully',
            attendance
        });
    } catch (error) {
        return res.status(500).json({
            status: 'Internal Server Error',
            message: `Error Marking Attendance: ${error.message}`
        })
    }

};

export const getAttendanceByUser = async (req, res) => {
    try {
        const userId = req.user.id; 
        const attenadanceByUser = await db.Attendance.findAll({
            where: {id_user: userId}
        })

        if(!attenadanceByUser) {
            return res.status(404).json({
                status: 'Not found',
                message: 'You dont have attendance records yet'
            })
        };

        return res.status(200).json({
            status: 'success',
            message: 'Attendance records retrieved successfully',
            attenadanceByUser
        })
    } catch (error) {
        return res.status(500).json({
            status: 'Internal Server Error',
            message: `Error: ${error.message}`
        })
    }
}

export const getAdminScheduleRoster = async (req, res) => {
    try {
        const { scheduleId } = req.params;
        const {
            enrollment_status,
            attendance_status,
            name,
            email,
            identifier,
            page = 1,
            limit = 25
        } = req.query;

        const pageNumber = Number.parseInt(page, 10) > 0 ? Number.parseInt(page, 10) : 1;
        const pageLimit = Number.parseInt(limit, 10) > 0 ? Math.min(Number.parseInt(limit, 10), 100) : 25;
        const offset = (pageNumber - 1) * pageLimit;

        const schedule = await db.ClassSchedule.findByPk(scheduleId, {
            include: [{
                model: db.Class,
                attributes: ['id_class', 'title_class', 'is_blocked']
            }]
        });

        if (!schedule) {
            return res.status(404).json({
                status: 'Not Found',
                message: 'Schedule not found'
            })
        }

        const whereEnrollment = { id_schedule: scheduleId };
        if (enrollment_status) {
            whereEnrollment.status = enrollment_status;
        }

        const userWhere = {};
        if (name) userWhere.name_user = { [Op.iLike]: `%${name}%` };
        if (email) userWhere.email_user = { [Op.iLike]: `%${email}%` };
        if (identifier) userWhere.id_user = { [Op.iLike]: `%${identifier}%` };

        const enrollments = await db.ClassEnrollment.findAll({
            where: whereEnrollment,
            include: [{
                model: db.User,
                attributes: ['id_user', 'name_user', 'email_user'],
                where: userWhere,
                required: true
            }],
            order: [['enrolled_at', 'DESC']]
        });

        const enrollmentIds = enrollments.map((item) => item.id_enrollment);
        const attendances = enrollmentIds.length
            ? await db.Attendance.findAll({ where: { id_enrollment: { [Op.in]: enrollmentIds } } })
            : [];

        const attendanceByEnrollment = attendances.reduce((acc, current) => {
            acc[String(current.id_enrollment)] = current;
            return acc;
        }, {});

        const userIds = [...new Set(enrollments.map((item) => String(item.id_user)))];
        const subscriptions = userIds.length
            ? await db.Subscription.findAll({
                where: {
                    id_user: { [Op.in]: userIds },
                    status: 'active'
                },
                include: [{
                    model: db.Package,
                    attributes: ['id_package', 'name_package']
                }],
                order: [['created_at', 'DESC']]
            })
            : [];

        const packageByUser = {};
        for (const subscription of subscriptions) {
            const key = String(subscription.id_user);
            if (packageByUser[key]) continue;
            packageByUser[key] = {
                subscription_id: subscription.id_subscription,
                package_name: subscription.Package?.name_package || null
            };
        }

        let rows = enrollments.map((enrollment) => {
            const user = enrollment.User;
            const attendance = attendanceByEnrollment[String(enrollment.id_enrollment)] || null;
            return {
                id_enrollment: enrollment.id_enrollment,
                id_user: user?.id_user || null,
                user_name: user?.name_user || '-',
                user_email: user?.email_user || '-',
                enrollment_status: enrollment.status,
                enrolled_at: enrollment.enrolled_at,
                attendance_status: resolveAttendanceState(attendance),
                attendance_id: attendance?.id_attendance || null,
                attendance_registered_at: attendance?.created_at || null,
                registration_method: resolveRegistrationMethod({ attendance, enrollmentStatus: enrollment.status }),
                package_name: packageByUser[String(user?.id_user)]?.package_name || null,
                subscription_id: packageByUser[String(user?.id_user)]?.subscription_id || null
            };
        });

        if (attendance_status) {
            rows = rows.filter((item) => item.attendance_status === attendance_status);
        }

        const total = rows.length;
        const paginatedRows = rows.slice(offset, offset + pageLimit);
        const totalAttended = rows.filter((item) => item.attendance_status === 'attended').length;
        const totalNoShow = rows.filter((item) => item.attendance_status === 'no_show').length;
        const totalExcused = rows.filter((item) => item.attendance_status === 'excused').length;
        const totalPending = rows.filter((item) => item.attendance_status === 'pending').length;

        return res.status(200).json({
            status: 'Success',
            message: 'Schedule roster retrieved successfully',
            page: pageNumber,
            limit: pageLimit,
            total,
            pages: Math.ceil(total / pageLimit),
            summary: {
                total_enrolled: total,
                total_attended: totalAttended,
                total_pending: totalPending,
                total_no_show: totalNoShow,
                total_excused: totalExcused,
                attendance_rate: total > 0 ? Number(((totalAttended / total) * 100).toFixed(2)) : 0
            },
            schedule: {
                id_schedule: schedule.id_schedule,
                id_class: schedule.id_class,
                class_title: schedule.Class?.title_class || null,
                class_is_blocked: schedule.Class?.is_blocked || false,
                date_class: schedule.date_class,
                start_timestamp: schedule.start_timestamp,
                end_timestamp: schedule.end_timestamp,
                is_active: schedule.is_active
            },
            roster: paginatedRows
        })
    } catch (error) {
        return res.status(500).json({
            status: 'Internal Server Error',
            message: `Error retrieving schedule roster: ${error.message}`
        })
    }
}