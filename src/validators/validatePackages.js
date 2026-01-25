import { z } from 'zod';

// Schema de validación para compra de paquetes
export const paymentPackageSchema = z.object({
  stripe_price_id: z.string()
    .min(1, 'El ID del precio de Stripe es requerido')
    .trim(),
  
  name: z.string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres')
    .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, 'El nombre solo debe contener letras y espacios')
    .trim(),
  
  email: z.string()
    .email('Por favor ingresa un email válido')
    .toLowerCase()
    .trim(),
  
  telephone: z.string()
    .regex(/^(\+?[1-9]\d{1,14}|[0-9]{7,15})$/, 'Por favor ingresa un número de teléfono válido')
    .trim(),
  
  id_package: z.string()
    .min(1, 'El ID del paquete es requerido')
    .trim()
});

// Función para validar y retornar errores formateados
export const validatePaymentData = (data) => {
  try {
    const validatedData = paymentPackageSchema.parse(data);
    return {
      success: true,
      data: validatedData,
      errors: null
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Formatear errores de manera amigable
      const formattedErrors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
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

// Función alternativa que retorna objeto con errores por campo
export const validatePaymentDataByField = (data) => {
  try {
    const validatedData = paymentPackageSchema.parse(data);
    return {
      success: true,
      data: validatedData,
      errors: {}
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Agrupar errores por campo
      const errorsByField = {};
      error.errors.forEach(err => {
        const field = err.path[0];
        if (!errorsByField[field]) {
          errorsByField[field] = [];
        }
        errorsByField[field].push(err.message);
      });
      
      return {
        success: false,
        data: null,
        errors: errorsByField
      };
    }
    throw error;
  }
};
