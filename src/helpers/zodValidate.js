import { getErrorMessages } from "./zodErrors.js";
import { ZodError } from "zod";

// Función para validar y retornar errores formateados (array)
export const validateData = (data, schema) => {
  try {
    const validatedData = schema.parse(data);
    return {
      success: true,
      data: validatedData,
      errors: null
    };
  } catch (error) {
    if (error instanceof ZodError) {
      const errorMessages = getErrorMessages(error);
      
      const formattedErrors = Object.entries(errorMessages).map(([field, messages]) => ({
        field,
        message: messages[0] || 'Error de validación'
      }));
      
      return {
        success: false,
        data: null,
        errors: formattedErrors
      };
    }
    throw error;
  }
};
