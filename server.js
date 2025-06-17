// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const http = require('http');
const {Server} = require('socket.io');
const cors = require('cors');
const { Op } = require('sequelize');
const { connectDB } = require('./config/database');
const Pizarra = require('./models/Pizarra');
const PizarraCollaborators = require('./models/PizarraCollaborators');
const User = require('./models/User');
const Message = require('./models/Message');

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

// Inicializar Socket.io con opciones CORS
const io = new Server(server, {cors: corsOptions});

// Apply middleware
app.use(cors(corsOptions));
app.use(express.json());

// Agregar un punto final para emitir eventos desde fuentes externas (como PHP)
app.post('/emit-event', (req, res) => {
    const { event, data } = req.body;

    if (!event || !data) {
        return res.status(400).json({ error: 'Se requieren el evento y los datos' });
    }

    console.log(`Emitiendo evento ${event} with data:`, data);

    // Si se proporciona roomId, se emite a esa sala; de lo contrario, se emite globalmente.
    if (data.roomId) {
        io.to(data.roomId).emit(event, data);
    } else {
        io.emit(event, data);
    }

    return res.status(200).json({ success: true, message: 'Evento emitido exitosamente' });
});

// Endpoint to get chat history for a room
app.get('/chat-history/:roomId', async (req, res) => {
    try {
        const { roomId } = req.params;
        const limit = req.query.limit ? parseInt(req.query.limit) : 50;

        const messages = await Message.getMessagesByRoom(roomId, limit);

        return res.status(200).json({
            success: true,
            messages: messages.reverse() // Return in chronological order
        });
    } catch (error) {
        console.error('Error fetching chat history:', error);
        return res.status(500).json({
            success: false,
            error: 'Error fetching chat history'
        });
    }
});

// Endpoint to save a chat message
app.post('/chat/message', async (req, res) => {
    try {
        const { pizarra_id, message, is_system_message, user_id, user_name, room_id } = req.body;

        if (!pizarra_id || !message) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: pizarra_id and message are required'
            });
        }

        // Create the message in the database
        const newMessage = await Message.create({
            pizarra_id: pizarra_id,
            room_id: room_id || `room_${pizarra_id}`, // Use provided room_id or generate one
            user_id: user_id || null,
            user_name: user_name || 'Anonymous',
            text: message,
            timestamp: new Date()
        });

        console.log('Message saved to database via HTTP endpoint');

        return res.status(200).json({
            success: true,
            message: 'Message saved successfully',
            data: newMessage
        });
    } catch (error) {
        console.error('Error saving chat message:', error);
        return res.status(500).json({
            success: false,
            error: 'Error saving chat message'
        });
    }
});

// Aplicar middleware de producción si está en modo de producción
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

    // Manejar unirse a una habitación
    socket.on('joinRoom', async (data) => {
        const { pizarraId, userId, roomId, userName } = data;
        console.log(`UserId : ${userId}, UserName: ${userName} se unirá a la, sala: ${roomId}, del pizarra: ${pizarraId}`);
        if (pizarraId === undefined || pizarraId === null || pizarraId === 'undefined') return;
        try {
            // Buscar o crear habitación
            let pizarra = await Pizarra.findOne({ where: { id: pizarraId } });
            console.log('Pizarra encontrada:', pizarra ? 'sí' : 'no');

            // Si pizarra no existe, créala
            if (!pizarra && Number.isInteger(pizarraId) && pizarraId > 0) {
                pizarra = await Pizarra.create({
                    id: pizarraId,
                    room_id: roomId,
                    user_id: userId,
                    name: 'New Pizarra',
                    elements: [],
                    users: []
                });
            }
            // Únete a la sala socket.io
            socket.join(roomId);
            // get the user from the database
            let user;
            if(Number.isInteger(userId) && pizarraId > 0){
                user = await User.findOne({ where: { id: userId } });
            }else{
                user = await User.findOne({ where: { name: userName } });
            }
            console.log('Usuario encontrado:', user ? 'yes' : 'no');
            // Agregar usuario a colaboradores si aún no es colaborador
            const collaborator = await PizarraCollaborators.findOne({ where: { pizarra_id: pizarraId} });
            console.log('Colaborador encontrado:', collaborator ? 'yes' : 'no');
            // Si el usuario no es colaborador, crear un nuevo registro de colaborador
            if (!collaborator && user && Number.isInteger(userId) && pizarraId > 0) {
                await PizarraCollaborators.create({
                    pizarra_id: pizarraId,
                    user_id: userId,
                    status: 'active'
                });
            }
            // Agregar usuario a la matriz de usuarios de pizarra si aún no está presente
            if (pizarra.users && Array.isArray(pizarra.users)) {
                const userExists = pizarra.users.some(u => u.id === userId || u.name === userName);
                if (!userExists && user) {
                    pizarra.users.push({
                        id: userId,
                        name: user.name || userName,
                        status: 'active'
                    });
                    await pizarra.save();
                }
            } else {
                // Inicializar la matriz de usuarios si no existe
                if (user) {
                    pizarra.users = [{
                        id: userId,
                        name: user.name || userName,
                        status: 'active'
                    }];
                    await pizarra.save();
                }
            }
            // Asegúrese de que los elementos sean siempre una matriz
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
            // Enviar elementos al cliente
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
            // Notificar a otros usuarios en la sala
            socket.to(roomId).emit('userJoined', { userName, roomId });

            // Enviar usuarios actualizados a todos los clientes.
            io.to(roomId).emit('roomUsers', {
                users: pizarra.users,
                roomId
            });
            // Enviar lista de colaboradores al cliente
            const collaborators = await PizarraCollaborators.findAll({ where: { pizarra_id: pizarraId }});
            const userIds = collaborators.map(collaborator => collaborator.user_id);

            const users = await User.findAll({ where: { id: userIds } });

            console.log('Lista de usuarios:', users);

            socket.emit('collaboratorList', {
                pizarraId,
                collaborators,
                users
            });

            // Fetch and send chat message history
            try {
                const messages = await Message.getMessagesByRoom(roomId);
                if (messages && messages.length > 0) {
                    socket.emit('chatHistory', {
                        messages: messages.reverse(), // Send in chronological order
                        roomId
                    });
                }
            } catch (error) {
                console.error('Error fetching chat history:', error);
            }
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
        const { text, user, timestamp, roomId, pizarraId, userId } = data;
        console.log(`Mensaje de chat en la sala ${roomId} por el usuario ${user}: ${text}`);

        try {
            // Store the message in the database
            if (pizarraId) {
                await Message.create({
                    pizarra_id: pizarraId,
                    room_id: roomId,
                    user_id: userId || null,
                    user_name: user,
                    text: text,
                    timestamp: timestamp || new Date()
                });
                console.log('Message saved to database');
            } else {
                console.log('No pizarraId provided, message not saved to database');
            }

            // Broadcast the message to all other users in the room
            socket.to(roomId).emit('chatMessage', { text, user, timestamp, roomId, pizarraId, userId });
        } catch (error) {
            console.error('Error in chatMessage:', error);
            socket.emit('error', { message: 'Error sending chat message' });
        }
    });

    // Handle typing indicator for chat (Spanish: 'escribiendo' = 'typing')
    // This event is kept in Spanish for compatibility with the frontend
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

    // Handle Flutter widget added event
    socket.on('flutter-widget-added', (data) => {
        const { roomId, widget, userId, screenId } = data;
        console.log(`Widget added in room ${roomId} by user ${userId}`);

        // Broadcast the widget added event to all other users in the room
        socket.to(roomId).emit('flutter-widget-added', { roomId, widget, userId, screenId });
    });

    // Handle Flutter widget updated event
    socket.on('flutter-widget-updated', (data) => {
        const { roomId, widget, userId, screenId } = data;
        console.log(`Widget updated in room ${roomId} by user ${userId}`);

        // Broadcast the widget updated event to all other users in the room
        socket.to(roomId).emit('flutter-widget-updated', { roomId, widget, userId, screenId });
    });

    // Handle Flutter widget removed event
    socket.on('flutter-widget-removed', (data) => {
        const { roomId, widgetIndex, userId, screenId } = data;
        console.log(`Widget removed in room ${roomId} by user ${userId}`);

        // Broadcast the widget removed event to all other users in the room
        socket.to(roomId).emit('flutter-widget-removed', { roomId, widgetIndex, userId, screenId });
    });

    // Handle Flutter widget selected event
    socket.on('flutter-widget-selected', (data) => {
        const { roomId, widget, userId, screenId } = data;
        console.log(`Widget selected in room ${roomId} by user ${userId}`);

        // Broadcast the widget selected event to all other users in the room
        socket.to(roomId).emit('flutter-widget-selected', { roomId, widget, userId, screenId });
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
