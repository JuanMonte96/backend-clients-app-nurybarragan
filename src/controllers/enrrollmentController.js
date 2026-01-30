import { db } from '../models/db.js'
import { utcToLocal } from '../services/timezone.js';
import { DateTime } from 'luxon';

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

        const startTime = DateTime.fromJSDate(scheduleToEnroll.start_timestamp, { zone: 'utc' })

        const limitRange = startTime.minus({ minutes: 15 });

        const now = DateTime.utc()

        if (now >= limitRange) {
            return res.status(403).json({
                status: "Forbidden",
                message: "The Class already start or its about to start please wait for the next schedule"
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

        if(user.medical_certificated === 'Defaultcertificate.pdf'){
            return res.status(403).json({
                status:"Forbidden",
                message:"You Have to upload your certificated in configurations firts"
            })
        }; 

        const alreadyEnroll = await db.ClassEnrollment.findOne({ where: { id_user: userId, id_schedule: scheduleId, status: 'active' } })

        if (alreadyEnroll) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'You are already enroll for this class'
            })
        }

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
        const userTimezone = req.user.timezone || 'Europe/Paris'

        const user = await db.User.findByPk(userId);

        if (!user || user.is_blocked) {
            return res.status(403).json({
                status: 'Forbiden',
                message: 'You can not get your enrollments'
            })
        }


        const enrollments = await db.ClassEnrollment.findAll({
            where: { id_user: userId, status: 'active' },
            attributes: ['id_enrollment', 'status'],
            include: [
                {
                    model: db.ClassSchedule,
                    attributes: ['id_schedule', 'date_class', 'start_timestamp', 'end_timestamp'],
                    include: [
                        {
                            model: db.Class,
                            attributes: ['title_class', 'description_class', 'level_class', 'is_blocked'],
                            include: [
                                {
                                    model: db.User, as: 'teacher',
                                    attributes: ['id_user', 'name_user']
                                }
                            ]
                        }
                    ]

                }

            ]

        })

        if (!enrollments.length) {
            return res.status(204).json({
                status: 'No content',
                message: 'No enrollments yet',
            })
        }

        const enrollmentsFormatted = enrollments.map(enrollment => {
            const schedule = enrollment.ClassSchedule.toJSON();

            const startTimeLocal = utcToLocal(schedule.start_timestamp, userTimezone); 
            const endTimeLocal = utcToLocal(schedule.end_timestamp, userTimezone); 

            schedule.start_local = startTimeLocal.time; 
            schedule.end_local = endTimeLocal.time; 

            return {
                ...enrollment.toJSON(),
                ClassSchedule: schedule
            };
        });

        return res.status(200).json({
            status: 'Success',
            message: 'Enrollments found successfully',
            enrollments: enrollmentsFormatted
        })

    } catch (error) {
        return res.status(500).json({
            status: 'Internal server error',
            message: `error message: ${error.message}`
        })
    }
}

export const removeEnroll = async (req, res) => {
    try {

        const { id } = req.params
        const userRole = req.user.role;

        if (userRole != 'admin') {
            return res.status(403).json({
                status: 'Forbiden',
                message: 'You dont have permissions to delete a enrollment'
            })
        }

        const enrollmentDelete = await db.ClassEnrollment.findByPk(id)

        console.log(enrollmentDelete)

        if (!enrollmentDelete) {
            return res.status(404).json({
                status: 'Not Found',
                message: 'there are not enrollment created'
            })
        }

        await enrollmentDelete.destroy()
        return res.status(200).json({
            status: 'Success',
            message: 'enrollments remove successfully'
        })

    } catch (error) {
        return res.status(500).json({
            status: 'Internal server error',
            message: `error: ${error.message}`
        })
    }
};

export const updateEnrollment = async (req, res) => {
    try {
        const { id } = req.params;
        const { newStatus } = req.body
        const userId = req.user.id

        if (!newStatus) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'Status is required'
            })
        }

        const enrollment = await db.ClassEnrollment.findByPk(id)

        if (enrollment.id_user != userId && req.user.role != 'admin') {
            return res.status(403).json({
                status: 'Forbidden',
                message: 'You can only update your own enrollments'
            })
        }

        await enrollment.update({ status: newStatus })

        return res.status(200).json({
            status: 'Success',
            message: 'Enrollment updated succesfully',
            enrollment
        })

    } catch (error) {
        return res.status(500).json({
            status: 'Internal server error',
            message: `error: ${error.message}`
        })
    }
}

export const softDeleteEnrollment = async (req, res) => {
    try {
        const { idEnrollment } = req.params;
        const { softDelete } = req.body;
        const { userId } = req.user.id


        const enrollmentToBlock = await db.ClassEnrollment.findByPk(idEnrollment)
        if (!enrollmentToBlock) {
            return res.status(404).json({
                status: "Not Found",
                message: "enrollment has not found"
            })
        }

        if (userId != enrollmentToBlock.id_user && req.user.role != "admin") {
            return res.status(403).json({
                status: "Forbidden",
                message: "You are not available to use this "
            })
        }

        await enrollmentToBlock.update({ status: softDelete })

        return res.status(200).json({
            status: "Success",
            message: "Enrollment Dealete succesfully"
        })


    } catch (error) {
        return res.status(500).json({
            status: "Internal Server Error",
            message: `An Error has ocurre ${error.message}`
        })
    }

}