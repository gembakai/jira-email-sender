const sendEmail = require('./sendEmail');

// Datos de ejemplo de una incidencia
const issueData = {
    summary: 'Problema en el servidor',
    description: 'El servidor está experimentando un alto consumo de CPU.',
};

// Llamar a la función para enviar el corressos
sendEmail(issueData);
