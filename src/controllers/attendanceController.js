import { db } from '../models/db.js';

export const attendanceViaQr = async (req, res) => {
    try {
        const { scheduleId } = req.params;
        const userId = req.user.id;

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
                ststaus: 'Bad Request',
                message: 'Your enrollmet is not active'
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

        const now = new Date();

        const scheduleStart = new Date(schedule.date_class);
        const [startHours, startMinutes] = schedule.start_time.split(':');
        scheduleStart.setHours(parseInt(startHours), parseInt(startMinutes), 0);

        const scheduleEnd = new Date(schedule.date_class);
        const [endHours, endMinutes] = schedule.end_time.split(':');
        scheduleEnd.setHours(parseInt(endHours), parseInt(endMinutes), 0);

        const fifteenMinutesBefore = new Date(scheduleStart.getTime() - 15 * 60000);

        if (now < fifteenMinutesBefore) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'You can only mark attendance within 15 minutes before the class starts'
            })
        };

        if (now > scheduleEnd) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'The class has already ended, attendance can no longer be marked'
            })
        };

        const newAttendance = await db.Attendance.create({
            id_enrollment: enrollment.id_enrollment,
            id_schedule: scheduleId,
            id_user: userId,
            status: true
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
                    include: ['id_schedule', 'date_class', 'start_time', 'end_time', 'is_active']
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

        if (req.user.role !== 'admin' || req.user.id !== 'teacher') {
            return res.status(403).json({
                status: 'Forbidden',
                message: 'You cannot mark your own attendance'
            })
        };

        const existingAttendance = await db.Attendance.findOne({
            where: { id_enrollment: enrollmentId }
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

        return res.status(201).json({
            status: 'Created',
            message: 'Attendance marked successfully',
            attendance
        });
    } catch (error) {
        return res.status(500).json({
            status: 'Internal Server Error',
            message: `Error: ${error.message}`
        })
    }

};

export const getAttendanceByUser = async (req, res) => {
    try {

    } catch (error) {

    }
}