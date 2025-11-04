import { ca } from 'zod/locales';
import {db} from '../models/db.js';

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
  try{
    const classes = await db.Class.findAll();
    return res.status(200).json({
      status: 'success', 
      message: 'Classes retrieved succesfully',
      classes
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

export const updatedClass = async(req,res)=> {
  try {
    const {id, title, classDescription, level, teacherId, isBlocked } = req.body;
    const classToUpdated = await db.Class.findByPk(id);
    if(!classToUpdated){
      return res.status(404).json({
        status:'Not Found',
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
      status:'success',
      message:'class updated successfully',
      class: classToUpdated
    })  
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
}

export const deleteClass = async(req,res)=> {
  try {
    const { id } = req.params;
    const classToDelete = await db.Class.findByPk(id);
    if(!classToDelete){
      return res.status(404).json({
        status:'Not Found',
        message: 'Class not found'
      });
    }
    await classToDelete.destroy();
    return res.status(200).json({
      status:'success',
      message:'class deleted successfully'
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
}
