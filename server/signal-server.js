const io = require("socket.io")(3001, {
  cors: {
    origin: "http://localhost:3000", // Allow your Next.js app to connect
    methods: ["GET", "POST"]
  }
});

console.log("🚀 Protocol Signaling Server running on port 3001");

io.on("connection", (socket) => {
  console.log(`📡 Node Connected: ${socket.id}`);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`👤 Player ${socket.id} joined room: ${roomId}`);
    
    // Tell others in the room a new peer is ready to handshake
    socket.to(roomId).emit("player-joined", socket.id);
  });

  // The "Mailman" logic: Just pass WebRTC offers/answers through
  socket.on("signal", ({ to, from, signal }) => {
    io.to(to).emit("signal", { from, signal });
  });

  socket.on("disconnect", () => {
    console.log(`❌ Node Disconnected: ${socket.id}`);
  });
});