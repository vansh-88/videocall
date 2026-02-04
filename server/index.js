import { Server } from "socket.io";

const io = new Server(3000, {
  cors: {
    // origin: "https://videocall-beta-gold.vercel.app",
    origin: "http://localhost:5173",
  },
});

const emailToSocketIdMap = new Map();
const socketIdToEmailMap = new Map();

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("join-room", async (data) => {

    const { roomId, email } = data;

    // Enforce max 2 participants per room
    const socketsInRoom = await io.in(roomId).allSockets(); // Set of socket ids
    if (socketsInRoom.size >= 2) {
      io.to(socket.id).emit('room-full', { roomId });
      return;
    }

    // save mappings
    emailToSocketIdMap.set(email, socket.id);
    socketIdToEmailMap.set(socket.id, email);

    // send existing members (if any) to joining socket so they know who is already in the room
    const existingSocketIds = Array.from(socketsInRoom).filter(id => id !== socket.id);
    const existingMembers = existingSocketIds.map(id => ({ socketId: id, email: socketIdToEmailMap.get(id) || null }));
    if (existingMembers.length) {
      io.to(socket.id).emit('room-members', { roomId, members: existingMembers });
    }

    // join room and notify others about this new user
    socket.join(roomId);
    socket.to(roomId).emit('user-connected', { email, socketId: socket.id });

    // ack back to joining socket
    io.to(socket.id).emit('join-room', data);

    // allow joining clients to request current room members (avoids race where server emitted before client registered listeners)
    socket.on('request-room-members', async (d) => {
      const { roomId: r } = d || {};
      const socketsInRoom = await io.in(r).allSockets();
      const existingSocketIds = Array.from(socketsInRoom).filter(id => id !== socket.id);
      const existingMembers = existingSocketIds.map(id => ({ socketId: id, email: socketIdToEmailMap.get(id) || null }));
      io.to(socket.id).emit('room-members', { roomId: r, members: existingMembers });
    });

    socket.on('call-user', (data) => {
      const { to, offer } = data;
      const callerEmail = socketIdToEmailMap.get(socket.id);
      console.log(`call-user received from ${socket.id} to ${to} (email: ${callerEmail})`);
      io.to(to).emit('call-made', {
        offer,
        socketId: socket.id,
        email: callerEmail
      });
      console.log(`call-made forwarded to ${to} from ${socket.id}`);
    });

    socket.on('make-answer', (data) => {
      const { to, answer } = data;
      io.to(to).emit('answer-made', {
        answer,
        socketId: socket.id
      });
    });

    socket.on('peer-nego-needed', (data) => {
      const { to, offer } = data;
      io.to(to).emit('peer-nego-needed', {
        offer,
        socketId: socket.id
      });
    });

    socket.on('peer-nego-done', (data) => {
      const { to, answer } = data;
      io.to(to).emit('peer-nego-final', {
        answer,
        socketId: socket.id
      });
    });

    // Forward ICE candidates between peers
    socket.on('ice-candidate', (data) => {
      const { to, candidate } = data || {};
      if (to && candidate) {
        io.to(to).emit('ice-candidate', { candidate, socketId: socket.id });
      }
    });

    // Handle manual hang-up from a client and notify the target peer
    socket.on('hang-up', (data) => {
      const { to } = data || {};
      if (to) {
        io.to(to).emit('peer-hangup', { socketId: socket.id });
      }
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);
      const email = socketIdToEmailMap.get(socket.id);
      emailToSocketIdMap.delete(email);
      socketIdToEmailMap.delete(socket.id);
      socket.to(roomId).emit("user-disconnected", { socketId: socket.id, email });
    });
  });
}); 