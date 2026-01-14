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

		// Sum total class limits across active subscriptions
		let totalClassesAvailable = 0;
		for (const subscription of user.Subscriptions) {
			const limit = subscription.Package && subscription.Package.class_limit ? subscription.Package.class_limit : 0;
			totalClassesAvailable += limit;
		}

		const classesUsed = await db.ClassEnrollment.count({
			where: {
				id_user: userId,
				status: 'active'
			}
		});

		if (totalClassesAvailable - classesUsed <= 0) {
			return res.status(400).json({
				status: 'Bad request',
				message: 'You have no available classes in your subscription anymore'
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
			totalClassLimit: totalClassesAvailable,
			classesUsed: classesUsed + 1,
			classesRemaining: Math.max(0, totalClassesAvailable - (classesUsed + 1))
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

		const activeSubscriptions = user && user.Subscriptions ? user.Subscriptions : [];
		const totalClassLimit = activeSubscriptions.reduce((sum, sub) => sum + (sub.Package && sub.Package.class_limit ? sub.Package.class_limit : 0), 0);
		const classesUsed = await db.ClassEnrollment.count({
			where: {
				id_user: userId,
				status: 'active'
			}
		});
		const classesRemaining = Math.max(0, totalClassLimit - classesUsed);

		if (!enrollments.length) {
			return res.status(200).json({
				status: 'Success',
				message: 'No enrollments yet',
				enrollments: [],
				totalClassLimit,
				classesUsed,
				classesRemaining
			})
		}

		return res.status(200).json({
			status: 'Success',
			message: 'Enrollments found successfully',
			enrollments,
			totalClassLimit,
			classesUsed,
			classesRemaining
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

		if (!enrollment) {
			return res.status(404).json({
				status: 'Not Found',
				message: 'Enrollment not found'
			})
		}

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
		const userId = req.user.id


		const enrollmentToBlock = await db.ClassEnrollment.findByPk(idEnrollment)
		if(!enrollmentToBlock){
			return res.status(404).json({
				status:"Not Found",
				message: "enrollment has not found"
			})
		}
        
		if(userId != enrollmentToBlock.id_user && req.user.role != "admin"){
			return res.status(403).json({
				status:"Forbidden",
				message:"You are not available to use this "
			})
		}

		await enrollmentToBlock.update({status: softDelete})

		return res.status(200).json({
			status:"Success",
			message:"Enrollment Delete succesfully"
		})


	} catch (error) {
		return res.status(500).json({
			status:"Internal Server Error",
			message: `An Error has occur ${error.message}`
		})
	}

}
