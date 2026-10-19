// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// WebRTC Signaling Logic
io.on('connection', (socket) => {
  console.log(`[+] User connected: ${socket.id}`);

  // Host joins a room
  socket.on('join-room-as-host', (roomId) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.role = 'host';
    console.log(`[Host] Created and joined room: ${roomId}`);
  });

  // Viewer joins a room
  socket.on('join-room-as-viewer', (roomId) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.role = 'viewer';
    console.log(`[Viewer] ${socket.id} joined room: ${roomId}`);
    // Notify the host in this room that a viewer arrived
    socket.to(roomId).emit('viewer-joined', socket.id);
  });

  // Relay WebRTC Offers, Answers, and ICE Candidates
  socket.on('offer', (data) => {
    socket.to(data.target).emit('offer', {
      sender: socket.id,
      sdp: data.sdp
    });
  });

  socket.on('answer', (data) => {
    socket.to(data.target).emit('answer', {
      sender: socket.id,
      sdp: data.sdp
    });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.target).emit('ice-candidate', {
      sender: socket.id,
      candidate: data.candidate
    });
  });

  socket.on('disconnect', () => {
    console.log(`[-] User disconnected: ${socket.id}`);
    if (socket.role === 'viewer' && socket.roomId) {
      socket.to(socket.roomId).emit('viewer-disconnected', socket.id);
    }
  });
});

// Utility to get Local Wi-Fi IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const PORT = process.env.PORT || 3000;
const IP = getLocalIP();

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n=======================================');
  console.log('🚀 Streaming Server is running!');
  console.log('=======================================');
  console.log(`Host Interface: http://localhost:${PORT}`);
  console.log(`Network Access: http://${IP}:${PORT}`);
  console.log('=======================================\n');
});