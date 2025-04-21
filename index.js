const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const puerto = 4000;

app.use(cors());
app.use(express.json());

let formData = {}; // Guardará los formularios
//Servir archivos estáticos desde la raiz del proyecto

/*aplicacion.use(express.static(__dirname));

aplicacion.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});*/
app.use(express.static(__dirname));
app.get('/', (req, res) => {
    console.log('clientes desde get');
    res.sendFile(__dirname + '/index.html');
});
app.get('/api/data', (req, res) => {
    res.json({ message: 'Hello from Node.js' });
});

io.on('connection', (socket) => {
    console.log('Nuevo cliente conectado', socket.id);
    socket.on('chat message', (msg) => {
        console.log('Mensaje recibido:', msg);
        io.emit('chat message', msg);
    });

    // Enviar el formulario actual al usuario recién conectado
    socket.emit("loadForm", formData);

    // Escuchar cambios en el formulario
    socket.on("updateForm", (data) => {
        formData = data;
        socket.broadcast.emit("updateForm", data);
    });

    socket.on('mensaje', (data) => {
        console.log("mensaje en el socket"+data);
        io.emit('mensaje', data);
    });

    socket.on('escribiendo',(data) => {
        socket.broadcast.emit('escribiendo', data);
    });

    socket.on('disconnect', () => {
        console.log('Cliente desconectado');
    });
});

server.listen(puerto, () => {
    console.log(`Servidor escuchando en http://localhost:${puerto}`);
});