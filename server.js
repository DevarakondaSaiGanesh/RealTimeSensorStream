require("dotenv").config();
const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");
const { MongoClient } = require("mongodb");
const http = require("http");

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ CORS setup for Netlify frontend
app.use(
  cors({
    origin: [
      "https://beautiful-bavarois-d3ec62.netlify.app", // your Netlify site
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "x-api-key"],
  })
);

app.use(express.json());

// ✅ MongoDB setup
const mongoClient = new MongoClient(process.env.MONGO_URI);
let readingsCollection;

mongoClient
  .connect()
  .then(() => {
    const db = mongoClient.db("smart-sensor-stream");
    readingsCollection = db.collection("sensor_readings");
    console.log("✅ Connected to MongoDB Atlas");
  })
  .catch((err) => console.error("❌ MongoDB connection failed:", err.message));

// ✅ Create HTTP server and WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Keep track of connected clients
wss.on("connection", (ws) => {
  console.log("🟢 Frontend WebSocket client connected");

  ws.on("close", () => {
    console.log("⚠️ Frontend WebSocket client disconnected");
  });
});

// ✅ Simulate sensor data for testing (Render cannot reach local 192.168.x.x sensors)
const sensorTypes = [
  "android.sensor.accelerometer",
  "android.sensor.gyroscope",
  "android.sensor.light",
];

function generateSensorData() {
  const timestamp = new Date();
  sensorTypes.forEach((type) => {
    const values =
      type === "android.sensor.light"
        ? [Math.random() * 30, 0, 0] // light sensor only X
        : [Math.random() * 10, Math.random() * 10, Math.random() * 10]; // motion sensors

    // Save to MongoDB
    if (readingsCollection) {
      readingsCollection.insertOne({ type, values, timestamp }).catch(console.error);
    }

    // Broadcast to WebSocket clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type, values, timestamp }));
      }
    });
  });
}

// Generate data every 1 second
setInterval(generateSensorData, 1000);

// ✅ API to fetch last 24h readings
app.get("/history", async (req, res) => {
  try {
    const data = await readingsCollection
      .find({ timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
      .toArray();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching history");
  }
});

// ✅ Health check
app.get("/", (req, res) => res.send("✅ Backend is live"));

// ✅ Start server on Render
server.listen(PORT, () => {
  console.log(`🚀 Backend HTTP + WebSocket running on port ${PORT}`);
});
