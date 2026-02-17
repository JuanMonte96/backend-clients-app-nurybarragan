import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { google } from "googleapis";

dotenv.config();

const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_HOST,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const auth = new google.auth.OAuth2(
    process.env.ID_CLIENT_GMAIL,
    process.env.SECRET_CLIENT_GMAIL,
    process.env.REDIRECT_URI_GMAIL
);

auth.setCredentials({
    refresh_token: process.env.REFRESH_TOKEN_GMAIL
});

const gmail = google.gmail({ version: "v1", auth });

export const sendEmail = async (to, name, tempPassword) => {
    try {
        await transporter.sendMail({
            from: `NB Dance & Fitness <${process.env.EMAIL_USER}>`,
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
        console.log('Email send with success to', to);
    } catch (error) {
        console.error('Error al enviar el email:', error);
        throw new Error(`Error al enviar el email: ${error}`);
    }
};


export const sendContactNotificacion = async (name_client, email_client, telephone_client, subject, description) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: `Contacto: ${subject}`,
            html: `<h1>Nuevo Contacto por parte del cliente ${name_client}</h1>
            <p><strong>Correo Electrónico:</strong>${email_client}</p>
            <br>
            <p><strong>Teléfono:</strong> ${telephone_client}</p>
            <br>
            <p><strong>Asunto:</strong> ${subject}</p>
            <br>
            <p><strong>Descripción:</strong> ${description}</p>
            <br>
            <span>Según corresponda contactar por ventas o soporte al cliente</span>`
        })

        console.log("notification send it with success to the admin")

    } catch (error) {
        console.error(`Error sending contact notification by email:${error}`);
        throw new Error(`Error sending contact notification by email: ${error}`);
    }
}


export const sendEmailApiGmail = async (to, name, tempPassword) => {
    try {

        const html = `<div style="background-color:#f4f6f8;padding:30px 0;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);">

    <!-- Header -->
    <div style="text-align:center;padding:30px 20px;border-bottom:1px solid #eeeeee;">
      <img
        src="${process.env.URL_FRONTEND_BASE}/assets/final-logo-nb.webp"
        alt="NB Dance & Fitness"
        style="max-width:160px;margin-bottom:15px;"
      />
      <h1 style="margin:0;font-size:22px;color:#222;">
        Bienvenue chez NB Dance & Fitness
      </h1>
    </div>

    <!-- Body -->
    <div style="padding:30px 25px;color:#444;font-size:15px;line-height:1.6;">
      <p style="margin-top:0;">
        Bonjour <strong>${name}</strong>,
      </p>

      <p>
        Nous sommes ravis de vous accueillir au sein de la communauté
        <strong>NB Dance & Fitness</strong>.
      </p>

      <p>
        Votre abonnement est désormais <strong>actif</strong> et vous pouvez
        profiter immédiatement de l’ensemble de nos cours et contenus exclusifs.
      </p>

      <p style="margin-top:25px;"><strong>Vos identifiants de connexion :</strong></p>

      <div style="background-color:#f8f8f8;padding:15px;border-radius:6px;margin:15px 0;">
        <p style="margin:5px 0;"><strong>Email :</strong> ${to}</p>
        <p style="margin:5px 0;"><strong>Mot de passe temporaire :</strong> ${tempPassword}</p>
      </div>

      <p>
        Pour des raisons de sécurité, nous vous recommandons de modifier votre
        mot de passe lors de votre première connexion.
      </p>

      <p style="margin-top:30px;">
        À très bientôt en cours,<br />
        <strong>L’équipe NB Dance & Fitness</strong>
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color:#fafafa;padding:20px;text-align:center;font-size:12px;color:#777;border-top:1px solid #eeeeee;">
      <p style="margin:5px 0;">
        Cet email a été envoyé automatiquement depuis un compte officiel
        NB Dance & Fitness.
      </p>
      <p style="margin:5px 0;">
        Si vous n’êtes pas à l’origine de cette inscription, vous pouvez ignorer ce message.
      </p>
    </div>

  </div>
</div>
`;

        const message = [
            `To: ${to}`,
            `Subject: Bienvenido a nb dance & Fitness`,
            "MIME-Version: 1.0",
            "Content-Type: text/html; charset=utf-8",
            "",
            html
        ].join("\n");

        const encodedMessage = Buffer.from(message)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

        await gmail.users.messages.send({
            userId: "me",
            requestBody: {
                raw: encodedMessage
            }
        });
        console.log('Email send with success to', to);
    }
    catch (error) {
        console.error(`Error sending email with Gmail API: ${error}`);
    }
}