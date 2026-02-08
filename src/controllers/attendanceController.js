import { db } from '../models/db.js';
import { utcToLocal, isTimeWithinRange, getNowInTimeZone } from '../services/timezone.js';

export const attendanceViaQr = async (req, res) => {
    try {
        const { scheduleId } = req.params;
        const userId = req.user.id;
        const userTimezone = req.user.timezone || 'Europe/Paris';
        const status = req.body;

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
        const startUTC = new Date(schedule.start_time);
        const endUTC = new Date(schedule.end_time);

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

        const newAttendance = await db.Attendance.create({
            id_enrollment: enrollment.id_enrollment,
            id_schedule: scheduleId,
            id_user: userId,
            status: status
        });

        return res.status(201).json(
            {
                status: 'Created',
                message: 'attendance recorden successfully',
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
        const { enrollmentId, userId, status } = req.body;

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

        const existingAttendance = await db.Attendance.findOne({
            where: { id_enrollment: enrollmentId, id_user: userId, id_schedule: enrollment.ClassSchedule.id_schedule }
        });

        if (existingAttendance) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'Attendance has already been marked for this enrollment'
            })
        };

        const attendance = await db.Attendance.create({
            id_enrollment: enrollmentId,
            id_user: userId,
            id_schedule: enrollment.ClassSchedule.id_schedule,
            status: status
        })

        if (attendance){
            enrollment.status = 'removed'
            await enrollment.save()
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