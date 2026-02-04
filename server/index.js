import { Server } from "socket.io";

const io = new Server(3000, {
  cors: {
    origin: "https://videocall-beta-gold.vercel.app",
    // origin: "http://localhost:5173",
  },
});

const emailToSocketIdMap = new Map();
const socketIdToEmailMap = new Map();

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("join-room", (data) => {

    const {roomId, email}=data;

    emailToSocketIdMap.set(email, socket.id);
    socketIdToEmailMap.set(socket.id, email);

    io.to((roomId)).emit('user-connected', {email, socketId: socket.id});
    socket.join(roomId);
    io.to(socket.id).emit('join-room', data);

    socket.on('call-user', (data)=>{
      const {to, offer}=data;
      io.to(to).emit('call-made', {
        offer,
        socketId: socket.id
      });
    });
    socket.on('make-answer', (data)=>{
      const {to, answer}=data;
      io.to(to).emit('answer-made', {
        answer,
        socketId: socket.id
      });
    });

    socket.on('peer-nego-needed', (data)=>{
      const {to, offer}=data;
      io.to(to).emit('peer-nego-needed', {
        offer,
        socketId: socket.id
      });
    });
    
    socket.on('peer-nego-done', (data)=>{
      const {to, answer}=data;
      io.to(to).emit('peer-nego-final', {
        answer,
        socketId: socket.id
      });
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);
      const email = socketIdToEmailMap.get(socket.id);
      emailToSocketIdMap.delete(email);
      socketIdToEmailMap.delete(socket.id);
      socket.to(roomId).emit("user-disconnected", email);
    });
  });
}); 