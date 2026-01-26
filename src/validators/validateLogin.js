import { z } from 'zod';

// Lista de timezones válidos de IANA
const VALID_TIMEZONES = Intl.supportedValuesOf('timeZone');

export const loginSchema = z.object({
    email: z
    .email('Please enter a valid email address')
    .toLowerCase().trim(),
    
    // OPCIÓN 1: Validar contra timezones soportados del sistema
    timezone: z.string()
        .refine(
            (tz) => VALID_TIMEZONES.includes(tz),
            { message: 'Timezone is not valid' }
        )
})

export const passwordSchema = z.object({
    password: z.string()
        .min(8, 'The password must have at least 8 characters')
        .max(100, 'The password cannot exceed 100 characters')
        .regex(/[A-Z]/, 'The password must contain at least one uppercase letter')
        .regex(/\d/, 'The password must contain at least one number')
        .regex(/[!@#$%^&*(),.?":{}|<>]/, 'The password must contain at least one special character')
        .trim()
});