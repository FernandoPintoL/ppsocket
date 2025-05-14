// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const http = require('http');
const {Server} = require('socket.io');
const cors = require('cors');
const { connectDB } = require('./config/database');
const Room = require('./models/Room');
const FormBuilder = require('./models/Form-builder');

// Production dependencies
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Get environment variables with defaults
const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Connect to MongoDB
connectDB();

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Configure CORS based on environment
const corsOptions = {
  origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(',')
};

// Initialize Socket.io with CORS options
const io = new Server(server, {cors: corsOptions});

// Apply middleware
app.use(cors(corsOptions));
app.use(express.json());

// Add endpoint for emitting events from external sources (like PHP)
app.post('/emit-event', (req, res) => {
    const { event, data } = req.body;

    if (!event || !data) {
        return res.status(400).json({ error: 'Event and data are required' });
    }

    console.log(`Emitting event ${event} with data:`, data);

    // If roomId is provided, emit to that room, otherwise emit globally
    if (data.roomId) {
        io.to(data.roomId).emit(event, data);
    } else {
        io.emit(event, data);
    }

    return res.status(200).json({ success: true, message: 'Event emitted successfully' });
});

// Apply production middleware if in production mode
if (NODE_ENV === 'production') {
  // Enable compression
  app.use(compression());

  // Set security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "'unsafe-inline'"],
        "connect-src": ["'self'", "ws:", "wss:"]
      }
    }
  }));

  // Apply rate limiting
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Demasiadas solicitudes desde esta IP, inténtelo de nuevo después de 15 minutos'
  });

  // Apply rate limiting to API routes
  app.use('/api', apiLimiter);

  // Disable X-Powered-By header
  app.disable('x-powered-by');
}

// Socket.io connection handling
io.on('connection', async (socket) => {
    console.log('Nuevo cliente conectado', socket.id);

    // Handle joining a room
    socket.on('joinRoom', async (data) => {
        const { formBuilderId, userId ,roomId, user } = data;
        console.log(`Usuario ${user} unido a la sala ${roomId} del formBuilder ${formBuilderId}`);

        try {
            // Find or create room
            let room = await Room.findOne({ where: {room_id: roomId}});
            if (!room) {
                // como agregar una nueva sala
                room = new Room({
                    room_id: roomId,
                    users: [user], // Convierte el array a JSON
                    last_activity: new Date()
                });
                await room.save();
            }else{
                // Si la sala ya existe, actualiza el campo `users` correctamente
                const currentUsers = Array.isArray(room.users) ? room.users : []; // Asegúrate de que sea un array
                if (!currentUsers.includes(user)) {
                    currentUsers.push(user);
                    room.users = currentUsers; // Asigna el array actualizado
                }
                room.last_activity = new Date();
                await room.save();
            }

            // Join the socket.io room
            socket.join(roomId);

            // Get form data if it exists and formBuilderId is defined
            let formBuilder = null;
            if (formBuilderId !== undefined && formBuilderId !== null && formBuilderId !== 'undefined') {
                formBuilder = await FormBuilder.findOne({where: {id: formBuilderId}});
                if (formBuilder) {
                    await formBuilder.updateRoomId(roomId);
                    console.log('elementos: ', formBuilder.elements);

                    // Ensure elements is always an array
                    let elements = [];
                    if (formBuilder.elements) {
                        if (Array.isArray(formBuilder.elements)) {
                            elements = formBuilder.elements;
                        } else if (typeof formBuilder.elements === 'string') {
                            try {
                                elements = JSON.parse(formBuilder.elements);
                            } catch (e) {
                                console.error('Error parsing elements JSON:', e);
                            }
                        }
                    }

                    // Send elements to the client
                    socket.emit('formUpdate', {
                        elements: elements,
                        user: 'server',
                        roomId
                    });

                    if (formBuilder.name) {
                        socket.emit('formNameChange', {
                            formBuilderId: formBuilder.id,
                            userId: userId,
                            name: formBuilder.name,
                            user: 'server',
                            roomId
                        });
                    }
                }
            }

            // Notify other users in the room
            socket.to(roomId).emit('userJoined', { user, roomId });

            // Send updated room users to all clients
            const updatedRoom = await Room.findOne({where : {room_id: roomId}});
            io.to(roomId).emit('roomUsers', {
                users: updatedRoom.users,
                roomId
            });
        } catch (error) {
            console.error('Error al unirse a la sala:', error);
            socket.emit('error', { message: 'Error joining room' });
        }
    });

    // Handle leaving a room
    socket.on('leaveRoom', async (data) => {
        const { roomId, user } = data;
        console.log(`User ${user} left room ${roomId}`);

        try {
            const room = await Room.findOne({ where : {room_id: roomId} });
            if (room) {
                await room.removeUser(user);
                await room.updateActivity();

                // Notify other users
                socket.to(roomId).emit('userLeft', { user, roomId });

                // Send updated room users
                const updatedRoom = await Room.findOne({ roomId });
                io.to(roomId).emit('roomUsers', {
                    users: updatedRoom.users,
                    roomId
                });

                // If room is empty, you might want to clean it up
                if (updatedRoom.users.length === 0) {
                    // Optional: Delete room and form data after some time of inactivity
                    // await Room.deleteOne({ roomId });
                    // await FormData.deleteOne({ roomId });
                }
            }

            socket.leave(roomId);
        } catch (error) {
            console.error('Error in leaveRoom:', error);
        }
    });

    // Handle form updates
    socket.on('formUpdate', async (data) => {
        const { elements, roomId, user, saveToDatabase = true, formBuilderId } = data;
        console.log(`Actualización de formulario en la sala ${roomId} por el user ${user}`);

        try {
            // First try to find by formBuilderId if provided
            let formBuilder = null;
            if (formBuilderId) {
                formBuilder = await FormBuilder.findOne({where: {id: formBuilderId}});
            }

            // If not found by formBuilderId, try to find by room_id
            if (!formBuilder) {
                formBuilder = await FormBuilder.findOne({where: {room_id: roomId}});
            }

            console.log('FormBuilder found:', formBuilder ? 'yes' : 'no');

            // Always save to database if formBuilder is found, regardless of saveToDatabase flag
            if (formBuilder) {
                // Ensure elements is properly formatted before saving
                let elementsToSave = elements;
                if (typeof elements === 'string') {
                    try {
                        elementsToSave = JSON.parse(elements);
                    } catch (e) {
                        console.error('Error parsing elements JSON:', e);
                    }
                }

                await formBuilder.updateElementsFormBuilder(elementsToSave, user);
                console.log('Form saved to database');
            } else {
                console.log('FormBuilder not found, cannot save to database');
            }

            // Broadcast the update to all other users in the room
            socket.to(roomId).emit('formUpdate', { elements, user, roomId });
        } catch (error) {
            console.error('Error in formUpdate:', error);
            socket.emit('error', { message: 'Error updating form' });
        }
    });

    // Handle form name changes
    socket.on('formNameChange', async (data) => {
        const { name, roomId, formBuilderId, userId, user } = data;
        console.log(`Cambio de nombre ${name} en la sala ${roomId} por el user ${user} del formulario ${formBuilderId}`);

        try {
            let formBuilder = await FormBuilder.findOne({ where: { id: formBuilderId } });
            if (formBuilder) {
                await formBuilder.updateNameProyecto(name, userId);
                console.log('Form name updated in database');
            } else {
                console.log('FormBuilder not found, cannot update name');
            }

            //Transmitir el cambio de nombre a todos los demás usuarios de la sala
            socket.to(roomId).emit('formNameChange', { name, formBuilderId, userId, user });
        } catch (error) {
            console.error('Error in formNameChange:', error);
            socket.emit('error', { message: 'Error updating form name' });
        }
    });

    // Handle chat messages
    socket.on('chatMessage', async (data) => {
        const { text, user, timestamp, roomId } = data;
        console.log(`Mensaje de chat en la sala ${roomId} por el usuario ${user}: ${text}`);

        try {
            // Broadcast the message to all other users in the room
            socket.to(roomId).emit('chatMessage', { text, user, timestamp, roomId });
        } catch (error) {
            console.error('Error in chatMessage:', error);
            socket.emit('error', { message: 'Error sending chat message' });
        }
    });

    // Handle typing indicator for chat
    socket.on('escribiendo', (data) => {
        const { user, roomId } = data;
        console.log(`Usuario ${user} está escribiendo en la sala ${roomId}`);

        // Broadcast typing indicator to all other users in the room
        socket.to(roomId).emit('escribiendo', { user, roomId });
    });

    // Handle typing indicator for form element editing
    socket.on('typing', (data) => {
        const { user, roomId } = data;
        console.log(`Usuario ${user} está editando un elemento en la sala ${roomId}`);

        // Broadcast typing indicator to all other users in the room
        socket.to(roomId).emit('typing', { user, roomId });
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
        console.log('Client disconnected', socket.id);
        // The room cleanup will be handled by the leaveRoom event
    });
});

// Error handling for the server
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Puerto ${PORT}, Ya está en uso. Utilice un puerto diferente.`);
    } else {
        console.error('Servidor error: ', error);
    }
    process.exit(1);
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server listening at http://localhost:${PORT}`);
});
