import express from 'express';
import nodemailer from 'nodemailer';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Necesitas estas dos líneas para manejar __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuración del transporte de correo utilizando el servidor SMTP de Namecheap
let transporter = nodemailer.createTransport({
    host: 'mail.privateemail.com', // Servidor SMTP de Namecheap
    port: 587, // Puerto común para SMTP sin SSL/TLS
    secure: false, // true para conexiones seguras (SSL/TLS), false para no seguras
    auth: {
        user: 'admin@gembakai.com', // Tu dirección de correo
        pass: process.env.EMAIL_PASSWORD, // Usa la variable de entorno para la contraseña
    },
});

// Función para descargar un adjunto de JIRA
const downloadAttachment = async (attachment) => {
    const response = await fetch(attachment.content, {
        method: 'GET',
        headers: {
            'Authorization': `Basic ${Buffer.from(
                `admin@gembakai.com:${process.env.JIRA_API_TOKEN}`
            ).toString('base64')}`,
            'Accept': 'application/json'
        }
    });

    // Guardar el archivo en un directorio temporal
    const filePath = path.join(__dirname, attachment.filename);
    const fileStream = fs.createWriteStream(filePath);
    await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on('error', reject);
        fileStream.on('finish', resolve);
    });

    return filePath;
};

// Función para enviar el correo electrónico con adjuntos
const sendEmail = async (issueData) => {
    try {
        // Extraer los valores específicos que necesitas
        const issueKey = issueData.issue.key || 'No disponible';
        const customField10038 = issueData.issue.fields.customfield_10038 || 'No disponible';

        // Extraer los valores de la lista múltiple (customfield_10057)
        const customField10057Array = issueData.issue.fields.customfield_10057 || [];
        const customField10057Values = customField10057Array.map(item => item.value).join(', ') || 'No disponible';

        // Descargar y preparar los adjuntos
        const attachments = issueData.issue.fields.attachment || [];
        const attachmentFiles = await Promise.all(
            attachments.map(async (attachment) => {
                const filePath = await downloadAttachment(attachment);
                return {
                    filename: attachment.filename,
                    path: filePath
                };
            })
        );

        // Formatear el contenido del correo
        const emailContent = `
        Detalles de la incidencia:
        - Clave de la incidencia: ${issueKey}
        - Custom Field 10038: ${customField10038}
        - Departamentos: ${customField10057Values}
        `;

        let info = await transporter.sendMail({
            from: '"Gembakai" <admin@gembakai.com>', // Remitente
            to: 'wballestero@gembakai.com, info@gembakai.com', // Destinatarios
            subject: `Nueva Incidencia: ${issueKey}`, // Asunto del correo
            text: emailContent, // Contenido del correo con los datos específicos
            attachments: attachmentFiles // Adjuntar los archivos descargados
        });

        console.log('Correo enviado: %s', info.messageId);

        // Limpiar los archivos temporales después de enviar el correo
        attachmentFiles.forEach(file => {
            fs.unlinkSync(file.path);
        });

    } catch (error) {
        console.error('Error al enviar el correo:', error);
    }
};

// Iniciar servidor Express
const app = express();
const port = process.env.PORT || 3000;

// Middleware para analizar JSON entrante
app.use(express.json());

app.post('/', async (req, res) => {
    try {
        const issueData = req.body; // Los datos de la incidencia que envía JIRA
        await sendEmail(issueData); // Llamar a la función para enviar el correo
        res.status(200).send('Correo enviado exitosamente');
    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        res.status(500).send('Error al enviar el correo');
    }
});

app.listen(port, () => {
    console.log(`Servidor escuchando en el puerto ${port}`);
});
