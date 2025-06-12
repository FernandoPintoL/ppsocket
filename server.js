// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const http = require('http');
const {Server} = require('socket.io');
const cors = require('cors');
const { connectDB } = require('./config/database');
const Pizarra = require('./models/Pizarra');
const PizarraCollaborators = require('./models/PizarraCollaborators');
const User = require('./models/User');

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
        const { pizarraId, userId, roomId, userName } = data;
        console.log(`Usuario ${userId} unido a la sala ${roomId} del pizarra ${pizarraId}`);
        if (pizarraId === undefined || pizarraId === null || pizarraId === 'undefined') return;
        try {
            // Find or create room
            let pizarra = await Pizarra.findOne({ where: { id: pizarraId } });

            // If pizarra doesn't exist, create it
            if (!pizarra) {
                pizarra = await Pizarra.create({
                    id: pizarraId,
                    room_id: roomId,
                    user_id: userId,
                    name: 'New Pizarra',
                    elements: [],
                    users: []
                });
            }

            // Join the socket.io room
            socket.join(roomId);

            // Get user information
            const user = await User.findOne({ where: { id: userId } });

            // Add user to collaborators if not already a collaborator
            const collaborator = await PizarraCollaborators.findOne({
                where: {
                    pizarra_id: pizarraId,
                    user_id: userId
                }
            });

            if (!collaborator && user) {
                await PizarraCollaborators.create({
                    pizarra_id: pizarraId,
                    user_id: userId,
                    status: 'active'
                });
            }

            // Add user to the pizarra's users array if not already present
            if (pizarra.users && Array.isArray(pizarra.users)) {
                const userExists = pizarra.users.some(u => u.id === userId);
                if (!userExists && user) {
                    pizarra.users.push({
                        id: userId,
                        name: user.name || userName,
                        status: 'active'
                    });
                    await pizarra.save();
                }
            } else {
                // Initialize users array if it doesn't exist
                if (user) {
                    pizarra.users = [{
                        id: userId,
                        name: user.name || userName,
                        status: 'active'
                    }];
                    await pizarra.save();
                }
            }

            // Ensure elements is always an array
            let elements = [];
            if (pizarra.elements) {
                if (Array.isArray(pizarra.elements)) {
                    elements = pizarra.elements;
                } else if (typeof pizarra.elements === 'string') {
                    try {
                        elements = JSON.parse(pizarra.elements);
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

            if (pizarra.name) {
                socket.emit('formNameChange', {
                    pizarraId: pizarra.id,
                    userId: userId,
                    name: pizarra.name,
                    user: 'server',
                    roomId
                });
            }

            // Notify other users in the room
            socket.to(roomId).emit('userJoined', { userName, roomId });

            // Send updated room users to all clients
            io.to(roomId).emit('roomUsers', {
                users: pizarra.users,
                roomId
            });

            // Send collaborator list to the client
            const collaborators = await PizarraCollaborators.findAll({
                where: { pizarra_id: pizarraId }
            });

            socket.emit('collaboratorList', {
                pizarraId,
                collaborators
            });
        } catch (error) {
            console.error('Error al unirse a la sala:', error);
            socket.emit('error', { message: 'Error joining room' });
        }
    });

    // Handle leaving a room
    socket.on('leaveRoom', async (data) => {
        const { roomId, user, pizarraId } = data;
        console.log(`User ${user} left room ${roomId}`);

        try {
            const pizarra = await Pizarra.findOne({ where: { room_id: roomId } });
            if (pizarra) {
                // Remove user from the users array
                if (pizarra.users && Array.isArray(pizarra.users)) {
                    pizarra.users = pizarra.users.filter(u => u.id !== user);
                    await pizarra.save();
                }

                // Notify other users
                socket.to(roomId).emit('userLeft', { user, roomId });

                // Send updated room users
                io.to(roomId).emit('roomUsers', {
                    users: pizarra.users,
                    roomId
                });

                // If room is empty, you might want to clean it up
                if (pizarra.users.length === 0) {
                    // Optional: Delete room and form data after some time of inactivity
                    // await Pizarra.destroy({ where: { room_id: roomId } });
                }
            }

            socket.leave(roomId);
        } catch (error) {
            console.error('Error in leaveRoom:', error);
        }
    });

    // Handle form updates
    socket.on('formUpdate', async (data) => {
        const { elements, roomId, user, saveToDatabase = true, pizarraId } = data;
        console.log(`Actualización de formulario en la sala ${roomId} por el user ${user}`);

        try {
            // First try to find by pizarraId if provided
            let pizarra = null;
            if (pizarraId) {
                pizarra = await Pizarra.findOne({where: {id: pizarraId}});
            }

            // If not found by pizarraId, try to find by room_id
            if (!pizarra) {
                pizarra = await Pizarra.findOne({where: {room_id: roomId}});
            }

            console.log('Pizarra found:', pizarra ? 'yes' : 'no');

            // Always save to database if pizarra is found, regardless of saveToDatabase flag
            if (pizarra) {
                // Ensure elements is properly formatted before saving
                let elementsToSave = elements;
                if (typeof elements === 'string') {
                    try {
                        elementsToSave = JSON.parse(elements);
                    } catch (e) {
                        console.error('Error parsing elements JSON:', e);
                    }
                }

                // Update elements using the updateElements method
                await pizarra.updateElements(elementsToSave);
                console.log('Form saved to database');
            } else {
                console.log('Pizarra not found, cannot save to database');
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
        const { name, roomId, pizarraId, userId, user } = data;
        console.log(`Cambio de nombre ${name} en la sala ${roomId} por el user ${user} del pizarra ${pizarraId}`);

        try {
            let pizarra = await Pizarra.findOne({ where: { id: pizarraId } });
            if (pizarra) {
                await pizarra.updateName(name);
                console.log('Pizarra name updated in database');
            } else {
                console.log('Pizarra not found, cannot update name');
            }

            //Transmitir el cambio de nombre a todos los demás usuarios de la sala
            socket.to(roomId).emit('formNameChange', { name, pizarraId, userId, user });
        } catch (error) {
            console.error('Error in formNameChange:', error);
            socket.emit('error', { message: 'Error updating pizarra name' });
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

    // Handle collaborator management
    socket.on('manageCollaborator', async (data) => {
        const { action, pizarraId, userId, status, roomId } = data;
        console.log(`Acción de colaborador: ${action} para pizarra ${pizarraId}, usuario ${userId}, estado ${status}`);

        try {
            // Find the pizarra
            const pizarra = await Pizarra.findOne({ where: { id: pizarraId } });

            if (!pizarra) {
                console.log('Pizarra not found, cannot manage collaborator');
                socket.emit('error', { message: 'Pizarra not found' });
                return;
            }

            // Handle different actions
            switch (action) {
                case 'add':
                    // Create a new collaborator record
                    await PizarraCollaborators.create({
                        pizarra_id: pizarraId,
                        user_id: userId,
                        status: status || 'active'
                    });

                    // Update the users array in the pizarra if it exists
                    if (pizarra.users && Array.isArray(pizarra.users)) {
                        // Find the user
                        const user = await User.findOne({ where: { id: userId } });
                        if (user) {
                            // Add user to the array if not already present
                            const userExists = pizarra.users.some(u => u.id === userId);
                            if (!userExists) {
                                pizarra.users.push({
                                    id: userId,
                                    name: user.name,
                                    status: status || 'active'
                                });
                                await pizarra.save();
                            }
                        }
                    }
                    break;

                case 'remove':
                    // Remove the collaborator record
                    await PizarraCollaborators.destroy({
                        where: {
                            pizarra_id: pizarraId,
                            user_id: userId
                        }
                    });

                    // Update the users array in the pizarra if it exists
                    if (pizarra.users && Array.isArray(pizarra.users)) {
                        pizarra.users = pizarra.users.filter(u => u.id !== userId);
                        await pizarra.save();
                    }
                    break;

                case 'update':
                    // Update the collaborator status
                    await PizarraCollaborators.update(
                        { status },
                        {
                            where: {
                                pizarra_id: pizarraId,
                                user_id: userId
                            }
                        }
                    );

                    // Update the users array in the pizarra if it exists
                    if (pizarra.users && Array.isArray(pizarra.users)) {
                        pizarra.users = pizarra.users.map(u => {
                            if (u.id === userId) {
                                return { ...u, status };
                            }
                            return u;
                        });
                        await pizarra.save();
                    }
                    break;

                default:
                    console.log('Invalid action');
                    socket.emit('error', { message: 'Invalid action' });
                    return;
            }

            // Notify all users in the room about the collaborator change
            io.to(roomId).emit('collaboratorUpdate', {
                action,
                pizarraId,
                userId,
                status,
                users: pizarra.users
            });

            console.log('Collaborator management successful');
        } catch (error) {
            console.error('Error in manageCollaborator:', error);
            socket.emit('error', { message: 'Error managing collaborator' });
        }
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
