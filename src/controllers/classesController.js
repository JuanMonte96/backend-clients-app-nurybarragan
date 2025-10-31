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

    // 2️⃣ Verificar si ya existe una clase con ese título
    const existingClass = await db.Class.findOne({
      where: { title_class: title }
    });

    if (existingClass) {
      return res.status(400).json({ message: "Class with this title already exists" });
    }

    // 3️⃣ Crear la clase
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
