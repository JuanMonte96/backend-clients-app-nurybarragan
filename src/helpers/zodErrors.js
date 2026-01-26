import { ZodError } from 'zod';

// Función helper para obtener errores de forma legible
export const getErrorMessages = (error) => {
  if (error instanceof ZodError) {
    const issues = error.issues.reduce((acc, issue) => {
      const field = issue.path[0] || 'general';
      if (!acc[field]) {
        acc[field] = [];
      }
      acc[field].push(issue.message);
      return acc;
    }, {});
    return issues;
  }
  return {};
};