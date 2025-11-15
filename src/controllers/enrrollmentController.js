import { db } from '../models/db.js'

export const createEnrrollment = async (req, res) => {
    try {
        const { scheduleId } = req.body;
        const userId = req.user.id;

        const scheduleToEnroll = await db.ClassSchedule.findByPk(scheduleId);

        if (!scheduleToEnroll) {
            return res.status(404).json({
                status: 'Not Found',
                message: 'Schedule not found'
            })
        }

        const user = await db.User.findByPk(userId, {
            include: [
                {
                    model: db.Subscription,
                    where: { status: 'active' },
                    required: false,
                    include: [{
                        model: db.Package,
                        attributes: ['id_package', 'class_limit']
                    }],
                    order: [['created_at', 'ASC']]
                }
            ]
        });

        const alreadyEnroll = await db.ClassEnrollment.findOne({ where: { id_user: userId, id_schedule: scheduleId, status: 'active' } })

        if (alreadyEnroll) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'You are already enroll for this class'
            })
        }

        console.log(user.Subscriptions)


        if (!user || user.is_blocked) {
            return res.status(403).json({
                status: 'Forbiden',
                message: 'you cant enroll to this class'
            })
        } else if (!user.Subscriptions || user.Subscriptions.length === 0) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'You have not active subscriptions'
            })
        }

        let totalClassesAvailable = 0;
        let subscriptionToUse = null;

        for (const subscription of user.Subscriptions) {
            const classesUsed = await db.ClassEnrollment.count({
                where: {
                    id_user: userId,
                    status: 'active'
                }
            })

            const availableClasses = subscription.Package.class_limit - classesUsed

            if (availableClasses > 0 && !subscriptionToUse) {
                subscriptionToUse = subscription;
            }
            totalClassesAvailable += availableClasses;
        }
        

        if (totalClassesAvailable <= 0) {
            console.log(totalClassesAvailable)
            return res.status(400).json({
                status: 'Bad request',
                message: 'You have no available calsses in your subscription anymore'
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
            newEnrollment,
            classesRemaning: totalClassesAvailable - 1
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
        const userId = req.user.id;

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