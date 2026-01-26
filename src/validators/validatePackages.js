import { z, } from 'zod';

// Schema de validación para compra de paquetes
export const paymentPackageSchema = z.object({
  stripe_price_id: z.string()
    .min(1, 'The stripe_price_id is required')
    .trim(),
  
  name: z.string()
    .min(2, 'The name must have at least 2 characterers')
    .max(100, 'The name cannot exceed 100 characters')
    .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, 'The name only should contain letters and spaces')
    .trim(),

  email: z.email('Please enter a valid email address')
    .toLowerCase()
    .trim(),
  
  telephone: z.string()
    .regex(/^(\+?[1-9]\d{1,14}|[0-9]{7,15})$/, 'Please enter a valid phone number')
    .trim(),
  
  id_package: z.string()
    .min(1, 'The package ID is required')
    .trim()
});
