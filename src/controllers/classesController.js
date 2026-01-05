import { db } from '../models/db.js';

export const createClass = async (req, res) => {
  try {
    const { title, classDescription, level, teacherId } = req.body;

    // 1️⃣ Validar si el profesor existe y está activo
    const teacher = await db.User.findOne({
      where: { id_user: teacherId }
    });

    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    if (teacher.is_blocked) {
      return res.status(400).json({ message: "Teacher is blocked" });
    }

    if (teacher.role !== "teacher" && teacher.role !== "admin") {
      return res.status(403).json({ message: "User is not authorized to create classes" });
    }

    const existingClass = await db.Class.findOne({
      where: { title_class: title }
    });

    if (existingClass) {
      return res.status(400).json({ message: "Class with this title already exists" });
    }

    const newClass = await db.Class.create({
      title_class: title,
      description_class: classDescription,
      level_class: level,
      teacher_id: teacherId
    });

    return res.status(201).json({
      status: "Created",
      message: "Class created successfully",
      class: newClass
    });

  } catch (error) {
    console.error("Error creating class:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
};

export const getAllClasses = async (req, res) => {
  try {

    const userRole = req.user.role;

    let whereCondition = {}

    if (userRole === 'student') {
      whereCondition = { is_blocked: false };
    }

    const classes = await db.Class.findAll({ 
      where: whereCondition,
      include: [{
        model: db.User,
        as: 'teacher',
        attributes: ['id_user', 'name_user', 'email_user']
      }]
    });

    if (!classes || classes.length === 0) {
      return res.status(404).json({
        status: 'Not Found',
        message: 'classes not found'
      })
    }

    const classesWithTeacher = classes.map(c => {
      const cls = c.toJSON();
      return {
        id_class: cls.id_class,
        title_class: cls.title_class,
        description_class: cls.description_class,
        level_class: cls.level_class,
        is_blocked: cls.is_blocked,
        created_at: cls.created_at,
        teacher: cls.teacher ? {
          id_user: cls.teacher.id_user,
          name_user: cls.teacher.name_user,
          email_user: cls.teacher.email_user
        } : null
      }
    });

    return res.status(200).json({
      status: 'success',
      message: 'Classes retrieved succesfully',
      classes: classesWithTeacher
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
}

// export const getClassById = async(res,req)=> {
//   try{
//     const {id} = req.params; 
//     const classById = await db.Class.findByPk(id);
//     if(!classById){
//       return res.status(404).json({
//         status: 'error',
//         message: 'Class not found'
//       });
//     }
//   }catch (error) {
//     res.status(500).json({
//       message: "Internal server error",
//       error: error.message
//     });
//   }
// }

export const updatedClass = async (req, res) => {
  try {
    const { id, title, classDescription, level, teacherId, isBlocked } = req.body;
    const classToUpdated = await db.Class.findByPk(id);
    if (!classToUpdated) {
      return res.status(404).json({
        status: 'Not Found',
        message: 'Class not found'
      });
    }
    await classToUpdated.update({
      title_class: title,
      description_class: classDescription,
      level_class: level,
      teacher_id: teacherId,
      is_blocked: isBlocked
    });
    return res.status(200).json({
      status: 'success',
      message: 'class updated successfully',
      class: classToUpdated
    })
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
}

export const deleteClass = async (req, res) => {
  try {
    const { id } = req.params;
    const classToDelete = await db.Class.findByPk(id);
    if (!classToDelete) {
      return res.status(404).json({
        status: 'Not Found',
        message: 'Class not found'
      });
    }
    await classToDelete.destroy();
    return res.status(200).json({
      status: 'success',
      message: 'class deleted successfully'
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
}

export const getAvailableClasses = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await db.User.findByPk(userId, {
      include: [{
        model: db.Subscription,
        where: { status: 'active' },
        required: false,
        include: [{
          model: db.Package,
          attributes: ['id_package', 'class_limit']
        }]
      }]
    });

    if (!user || !user.Subscriptions || user.Subscriptions.length === 0) {
      return res.status(200).json({
        status: 'Success',
        totalAvailable: 0,
        subscriptions: []
      })
    }

    let subscriptionsDetails = [];
    let totalAvailable = 0;

    for (const subscription of user.Subscriptions) {
      const classesUsed = await db.ClassEnrollment.count({
        where: {
          id_user: userId,
          status: 'active'
        }
      });

      const available = subscription.Package.class_limit - classesUsed;
      totalAvailable += available;

      subscriptionsDetails.push({
        id_subscription: subscription.id_subscription,
        package_name: subscription.Package.name_package,
        total_classes: subscription.Package.class_limit,
        classes_used: classesUsed,
        classes_available: available,
        created_at: subscription.created_at
      })
    }

    return res.status(200).json({
      status: 'Success',
      totalAvailable,
      subscriptions: subscriptionsDetails
    })
  } catch (error) {
    return res.status(500).json({
      status: 'internal server error',
      message: `the error is: ${error.message}`
    })
  }
}