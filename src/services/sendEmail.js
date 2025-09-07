import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_HOST,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

export const sendEmail = async (to, name, tempPassword) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to,
            subject: 'Bienvenido a nb dance & Fitness',
            html: `<h1>Hola ${name}</h1>
            <p>Gracias por registrarte a esta familia de bailarines</p>
            <p>Tu Suscripción ya esta activa para que la uses y disfrutes de todas nuestras clases.</p>
            <p> Estos son tus datos de acceso: </p>
            <ul>
                <li>Email: ${to}</li>
                <li>Contraseña temporal: ${tempPassword}</li>
            </ul>
            <p>Recuerda cambiar tu contraseña una vez inicies sesión.</p>
            <p>¡Nos vemos en clase!</p>
            <p>NB Dance & Fitness</p>`
        })
        console.log('Email enviado con exito a', to);
    } catch (error) {
        console.error('Error al enviar el email:', error);
    }
};
