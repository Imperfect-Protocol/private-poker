// signal-server.js
const io = require("socket.io")(3001, {
  cors: { origin: "*" }
});

console.log("🚀 Signaling Server: Aggressive Mode Active");

io.on("connection", (socket) => {
  console.log(`📡 Node Connected: ${socket.id}`);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`👤 ${socket.id} joined ${roomId}`);
    
    const clients = io.sockets.adapter.rooms.get(roomId);
    if (clients) {
      const otherPlayers = Array.from(clients).filter(id => id !== socket.id);
      
      // Tell the NEW player who is already there
      if (otherPlayers.length > 0) {
        console.log(`📢 Telling ${socket.id} about existing peers: ${otherPlayers}`);
        socket.emit("existing-peers", otherPlayers);
      }

      // Tell the EXISTING players a new peer arrived
      socket.to(roomId).emit("player-joined", socket.id);
    }
  });

  socket.on("signal", ({ to, signal }) => {
    socket.to(to).emit("signal", { from: socket.id, signal });
  });

  socket.on("disconnect", () => console.log(`❌ Node Left: ${socket.id}`));
});