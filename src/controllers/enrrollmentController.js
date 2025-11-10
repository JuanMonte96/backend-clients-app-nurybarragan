import { db } from '../models/db.js'

export const createEnrrollment = async (req, res) => {
    try {
        const { scheduleId } = req.body;
        const userId = req.user.id;

        const scheduleToEnroll = await db.ClassSchedule.findByPk(scheduleId);
        console.log(scheduleToEnroll)
        console.log(userId)

        if (!scheduleToEnroll) {
            return res.status(404).json({
                status: 'Not Found',
                message: 'Scheduel not found'
            })
        }

        const userBlocked = await db.User.findByPk(userId);

        if (!userBlocked || userBlocked.is_blocked) {
            return res.status(403).json({
                status: 'Forbiden',
                message: 'you cant enroll to this class'
            })
        }

        const alreadyEnroll = await db.ClassEnrollment.findOne({ where: { id_user: userId, id_schedule: scheduleId, status: 'active' } })

        if (alreadyEnroll) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'You are already enroll for this class'
            })
        }

        const newEnrollment = await db.ClassEnrollment.create({
            id_schedule: scheduleId,
            id_user: userId,
            status: 'active'
        })

        return res.status(201).json({
            status: 'create',
            message: 'enrollment created succesfully',
            newEnrollment
        })
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            status: 'internal server error',
            message: `the error is: ${error.message}`
        })
    }
}

export const getEnrollmentsById = async (req, res) => {
    try {
        const  userId  = req.user.id;

        const user = await db.User.findByPk(userId);

        if (!user || user.is_blocked) {
            return res.status(403).json({
                status: 'Forbiden',
                message: 'You can not get your enrollments'
            })
        }


        const enrollments = await db.ClassEnrollment.findAll({
            where: { id_user: userId },
            attributes: ['id_enrollment', 'status'],
            include: [
                {
                    model: db.ClassSchedule,
                    attributes: ['id_schedule', 'date_class', 'start_time', 'end_time'],
                    include: [
                        {
                            model: db.Class,
                            attributes: ['title_class', 'description_class', 'level_class', 'is_blocked']
                        }
                    ]

                }

            ]

        })

        if (!enrollments.length) {
            return res.status(404).json({
                status: 'not found',
                message: 'Enrrolments not found at the moment'
            })
        }

        return res.status(200).json({
            status: 'Success',
            message: 'Enrollments found successfully',
            enrollments
        })

    } catch (error) {
        return res.status(500).json({
            status: 'Internal server error',
            message: `error message: ${error.message}`
        })
    }
} 