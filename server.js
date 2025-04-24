const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Importar el módulo de socket.io
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const puerto = 4000;

app.use(cors());
app.use(express.json());

// Store for form data and room users
let formData = {}; // Will store form data by room ID
let roomUsers = {}; // Will track users in each room

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    console.log('Client request received');
    res.sendFile(__dirname + '/index.html');
});

app.get('/api/data', (req, res) => {
    res.json({ message: 'Hello from Node.js' });
});

io.on('connection', (socket) => {
    console.log('New client connected', socket.id);

    // Store socket ID to user mapping
    const socketToUser = {};

    // Handle joining a room
    socket.on('joinRoom', (data) => {
        const { roomId, user } = data;
        console.log(`User ${user} joined room ${roomId}`);

        // Store the socket to user mapping
        socketToUser[socket.id] = { user, roomId };

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
        socket.to(roomId).emit('userJoined', { user, roomId });

        // Send the list of users in the room to all users
        io.to(roomId).emit('roomUsers', {
            users: roomUsers[roomId],
            roomId
        });
    });

    // Handle leaving a room
    socket.on('leaveRoom', (data) => {
        const { roomId, user } = data;
        console.log(`User ${user} left room ${roomId}`);

        // Remove user from room users
        if (roomUsers[roomId]) {
            roomUsers[roomId] = roomUsers[roomId].filter(u => u !== user);

            // Notify other users in the room that a user left
            socket.to(roomId).emit('userLeft', { user, roomId });

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
        const { elements, roomId, user } = data;
        console.log(`Form update in room ${roomId} by user ${user}`);

        // Store the form data
        if (!formData[roomId]) {
            formData[roomId] = {};
        }
        formData[roomId].elements = elements;

        // Broadcast the update to all other users in the room
        socket.to(roomId).emit('formUpdate', { elements, user, roomId });
    });

    // Handle form name changes
    socket.on('formNameChange', (data) => {
        const { name, roomId, user } = data;
        console.log(`Form name change in room ${roomId} by user ${user}`);

        // Store the form name
        if (!formData[roomId]) {
            formData[roomId] = {};
        }
        formData[roomId].name = name;

        // Broadcast the name change to all other users in the room
        socket.to(roomId).emit('formNameChange', { name, user, roomId });
    });

    // Handle typing events
    socket.on('typing', (data) => {
        const { user, roomId } = data;
        console.log(`User ${user} is typing in room ${roomId}`);

        // Broadcast the typing event to all other users in the room
        socket.to(roomId).emit('typing', { user, roomId });
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
            const { user, roomId } = socketToUser[socket.id];

            // Remove user from room users
            if (roomUsers[roomId]) {
                roomUsers[roomId] = roomUsers[roomId].filter(u => u !== user);

                // Notify other users in the room that a user left
                io.to(roomId).emit('userLeft', { user, roomId });

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

server.listen(puerto, () => {
    console.log(`Server listening at http://localhost:${puerto}`);
});
