import {z} from 'zod';

export const contactSchema = z.object({
    name_client: z.string()
        .min(2, 'The name must have at least 2 characters')
        .max(100, 'The name cannot exceed 100 characters')
        .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, 'The name should only contain letters and spaces')
        .trim(),
    email_client: z.email()
        .toLowerCase()
        .trim(),
    telephone_client: z
        .string()
        .regex(/^(\+?[1-9]\d{1,14}|[0-9]{7,15})$/, 'Please enter a valid phone number')
        .trim(),
    subject: z
        .string()
        .min(5, 'The subject must have at least 5 characters')
        .max(150, 'The subject cannot exceed 150 characters'),
    description: z
        .string()
        .min(10, 'The description must have at least 10 characters')
        .max(500, 'The description cannot exceed 500 characters')
});