import { validateData } from '../helpers/zodValidate.js';
import { paymentPackageSchema } from '../validators/validatePackages.js';
import { loginSchema, passwordSchema } from '../validators/validateLogin.js';
import { contactSchema } from '../validators/validateContact.js';

export const validatePaymentMiddleware = (req, res, next) => {
    try {
        const { stripe_price_id, name, email, id_package, telephone } = req.body;

        // Validar los datos
        const validation = validateData({
            stripe_price_id,
            name,
            email,
            telephone,
            id_package
        }, paymentPackageSchema);

        if (!validation.success) {
            return res.status(400).json({
                status: 'Validation Error',
                errors: validation.errors
            });
        }

        // Pasar datos validados al siguiente middleware/controlador
        req.validatedPayment = validation.data;
        next();

    } catch (error) {
        res.status(500).json({
            status: 'Internal Server Error',
            message: `Error validating payment data: ${error.message}`
        });
    }
};


export const validateLoginMiddleware = (req, res, next) => {
    try {
        const { email, timezone } = req.body;
        if (!email) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'Email is required'
            })
        }

        const validateUserData = validateData({ email, timezone }, loginSchema);

        if (!validateUserData.success) {
            return res.status(400).json({
                status: 'validation Error',
                errors: validateUserData.errors
            })
        }
        req.validateUserData = validateUserData.data;
        next();

    } catch (error) {
        return res.status(500).json({
            status: 'Internal Server Error',
            message: `Error validating login data: ${error.message}`
        })
    }
}

export const validatePasswordMiddleware = (req, res, next) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword) {
            return res.status(400).json({
                status: 'Bad Request',
                message: 'New password is required'
            })
        }
        const validatePasswordData = validateData({ password: newPassword }, passwordSchema);

        if (!validatePasswordData.success) {
            return res.status(400).json({
                status: 'Validation Error',
                errors: validatePasswordData.errors
            })
        }

        req.validatePasswordData = validatePasswordData.data;
        next();

    } catch (error) {
        return res.status(500).json({
            status: 'Internal server Error',
            message: `Error middleware validate Paasword ${error.message}`
        })
    }
}; 

export const validateContactMiddleware = (req,res,next) => {
    try {
        const {name_client, email_client, telephone_client, subject, description} = req.body;

        if(!name_client || !email_client || !telephone_client || !subject || !description){
            return res.status(400).json({
                status: 'Bad Request',
                message: 'All fields are required'
            })
        }

        const validation = validateData({
            name_client,
            email_client,
            telephone_client,
            subject,
            description
        }, contactSchema);

        if (!validation.success) {
            return res.status(400).json({
                status: 'Validation Error',
                errors: validation.errors
            });
        }

        req.validatedContact = validation.data;
        next();

    } catch (error) {
        return res.status(500).json({
            status: 'Internal Server Error',
            message: `Error validating contact data: ${error.message}`
        })
    }
}