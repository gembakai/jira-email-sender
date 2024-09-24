import express from 'express';
import nodemailer from 'nodemailer';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Necesitas estas dos líneas para manejar __dirname en ES Moduless
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
                `jira.grupodim@gmail.com:${process.env.JIRA_API_TOKEN}`
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
        const customField10038 = issueData.issue.fields.customfield_10038 || 'No disponible'; // Institución
        const customField10039 = issueData.issue.fields.customfield_10039 || 'No disponible';  // Número de procedimiento
        const customField10042 = issueData.issue.fields.customfield_10042 || 'No disponible'; // Vencimiento de respuesta
        const customField10046 = issueData.issue.fields.customfield_10046 || 'No disponible'; // Observaciones

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

        // Formatear el contenido del correo en HTML
        const emailContent = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Nueva Oportunidad - Grupo DIM</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 0;
                    background-color: #f4f4f4;
                    color: #333;
                }
                .container {
                    width: 80%;
                    margin: 20px auto;
                    background-color: #fff;
                    padding: 20px;
                    box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                }
                .header {
                    width: 50px;
                    text-align: left;
                    margin-bottom: 30px;
                }
                .header img {
                    max-width: 200px;
                    height: auto;
                }
                .divider {
                    border-top: 5px solid #8d8d8d; /* Azul */
                    margin: 20px 0;
                }
                .content {
                    margin-top: 10px;
                    font-size: 16px;
                    line-height: 1.4;
                    color: #1a1a1a;
                }
                .content p {
                    margin-bottom: 4px;
                }
                .footer {
                    margin-top: 20px;
                    text-align: center;
                    font-size: 12px;
                    color: #777;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <img src="https://static.wixstatic.com/media/49738c_f42431ee087d4c618729e3f1480ccc73~mv2.jpg" alt="Grupo DIM Logo">
                </div>
                <div class="divider"></div>
                <div class="content">
                    <h2>NUEVA OPORTUNIDAD</h2>
                    <p><strong>Institucion: </strong>${customField10038}</p>
                    <p><strong>Número de procedimiento: </strong>${customField10039}</p>
                    <p><strong>Dirigido a:</strong> ${customField10057Values}</p>
                    <p><strong>Fecha de respuesta:</strong> ${customField10042}</p>
                    <h3>Observaciones:</h3>
                    <p>${customField10046}</p>
                    <div class="divider"></div>
                    <p>Sírvase encontrar en el correo adjunto los elementos necesarios para tramitar esta solicitud. Si tiene alguna duda puede contactarse con Paola Chaves Mora 2228-8191.</p>
                </div>
                <div class="footer">
                    <p>www.grupodim.net | San José, Costa Rica</p>
                    <p>Antes de imprimir piensa en tu responsabilidad con el medio ambiente.</p>
                    <p>Before printing think about your environmental responsibility</p>
                </div>
            </div>
        </body>
        </html>`;

        let info = await transporter.sendMail({
            from: '"Gembakai" <admin@gembakai.com>', // Remitente
            to: 'wballestero@gembakai.com,contratacionadm@grupodim.net', // Destinatarios
            subject: `Nueva Oportunidad: ${customField10038}`, // Asunto del correo
            html: emailContent, // Contenido del correo en HTML
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
