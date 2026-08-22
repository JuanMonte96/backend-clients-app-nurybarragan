import { z, } from 'zod';

// Schema de validación para compra de paquetes
export const paymentPackageSchema = z.object({
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
    .trim(),

payment_method: z.enum(['card', 'sepa_debit', 'apple_pay', 'link']).optional().default('card')
 });
 
 // Compra con plan de pago (cuotas): el cliente final elige el numero de cuotas.
 export const paymentPlanPackageSchema = paymentPackageSchema.extend({
   installment_count: z.coerce.number()
     .int('The installment count must be an integer')
     .min(1, 'The minimum is 1 installment')
     .max(4, 'The maximum is 4 installments'),
  payment_method: z.enum(['card', 'sepa_debit', 'apple_pay', 'link']).optional().default('card'),
});

