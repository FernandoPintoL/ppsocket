// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const http = require('http');
const {Server} = require('socket.io');
const cors = require('cors');

// Production dependencies
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Get environment variables with defaults
const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

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
    message: 'Too many requests from this IP, please try again after 15 minutes'
  });

  // Apply rate limiting to API routes
  app.use('/api', apiLimiter);

  // Disable X-Powered-By header
  app.disable('x-powered-by');
}

// Store for form data and room users
let formData = {}; // Will store form data by room ID
let roomUsers = {}; // Will track users in each room

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    console.log('Client request received');
    res.sendFile(__dirname + '/index.html');
});

app.get('/api/data', (req, res) => {
    res.json({message: 'Hello from Node.js'});
});

// API endpoint to get server information
app.get('/api/port', (req, res) => {
    const host = req.get('host');
    res.json({
        port: PORT,
        url: `${req.protocol}://${host}`,
        environment: NODE_ENV
    });
});

io.on('connection', (socket) => {
    console.log('New client connected', socket.id);

    // Store socket ID to user mapping
    const socketToUser = {};

    // Handle joining a room
    socket.on('joinRoom', (data) => {
        const {roomId, user} = data;
        console.log(`User ${user} joined room ${roomId}`);

        // Store the socket to user mapping
        socketToUser[socket.id] = {user, roomId};

        // Join the socket.io room
        socket.join(roomId);

        // Initialize room users array if it doesn't exist
        if (!roomUsers[roomId]) {
            roomUsers[roomId] = [];
        }

        // Add user to room users
        roomUsers[roomId].push(user);

        // Send current form data to the new user
        if (formData[roomId]) {
            socket.emit('formUpdate', {
                elements: formData[roomId].elements,
                user: 'server',
                roomId
            });

            if (formData[roomId].name) {
                socket.emit('formNameChange', {
                    name: formData[roomId].name,
                    user: 'server',
                    roomId
                });
            }
        }

        // Notify other users in the room that a new user joined
        socket.to(roomId).emit('userJoined', {user, roomId});

        // Send the list of users in the room to all users
        io.to(roomId).emit('roomUsers', {
            users: roomUsers[roomId],
            roomId
        });
    });

    // Handle leaving a room
    socket.on('leaveRoom', (data) => {
        const {roomId, user} = data;
        console.log(`User ${user} left room ${roomId}`);

        // Remove user from room users
        if (roomUsers[roomId]) {
            roomUsers[roomId] = roomUsers[roomId].filter(u => u !== user);

            // Notify other users in the room that a user left
            socket.to(roomId).emit('userLeft', {user, roomId});

            // Send the updated list of users in the room to all users
            io.to(roomId).emit('roomUsers', {
                users: roomUsers[roomId],
                roomId
            });
        }

        // Leave the socket.io room
        socket.leave(roomId);

        // Clean up the socket to user mapping
        delete socketToUser[socket.id];
    });

    // Handle form updates
    socket.on('formUpdate', (data) => {
        const {elements, roomId, user} = data;
        console.log(`Form update in room ${roomId} by user ${user}`);

        // Store the form data
        if (!formData[roomId]) {
            formData[roomId] = {};
        }
        formData[roomId].elements = elements;

        // Broadcast the update to all other users in the room
        socket.to(roomId).emit('formUpdate', {elements, user, roomId});
    });

    // Handle form name changes
    socket.on('formNameChange', (data) => {
        const {name, roomId, user} = data;
        console.log(`Form name change in room ${roomId} by user ${user}`);

        // Store the form name
        if (!formData[roomId]) {
            formData[roomId] = {};
        }
        formData[roomId].name = name;

        // Broadcast the name change to all other users in the room
        socket.to(roomId).emit('formNameChange', {name, user, roomId});
    });

    // Handle typing events
    socket.on('typing', (data) => {
        const {user, roomId} = data;
        console.log(`User ${user} is typing in room ${roomId}`);

        // Broadcast the typing event to all other users in the room
        socket.to(roomId).emit('typing', {user, roomId});
    });

    // Legacy chat message handling
    socket.on('chat message', (msg) => {
        console.log('Message received:', msg);
        io.emit('chat message', msg);
    });

    socket.on('mensaje', (data) => {
        console.log("Message in socket: " + data);
        io.emit('mensaje', data);
    });

    socket.on('escribiendo', (data) => {
        socket.broadcast.emit('escribiendo', data);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected', socket.id);

        // Check if we have user info for this socket
        if (socketToUser[socket.id]) {
            const {user, roomId} = socketToUser[socket.id];

            // Remove user from room users
            if (roomUsers[roomId]) {
                roomUsers[roomId] = roomUsers[roomId].filter(u => u !== user);

                // Notify other users in the room that a user left
                io.to(roomId).emit('userLeft', {user, roomId});

                // Send the updated list of users in the room to all users
                io.to(roomId).emit('roomUsers', {
                    users: roomUsers[roomId],
                    roomId
                });
            }

            // Clean up the socket to user mapping
            delete socketToUser[socket.id];
        }
    });
});

// Error handling for the server
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please use a different port.`);
    } else {
        console.error('Server error:', error);
    }
    process.exit(1);
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server running in ${NODE_ENV} mode on port ${PORT}`);
    console.log(`http://localhost:${PORT}`);
});
