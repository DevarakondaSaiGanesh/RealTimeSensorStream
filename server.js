require('dotenv').config();
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_WS_PORT = process.env.FRONTEND_WS_PORT || 8081;

app.use(cors());
app.use(express.json());

// MongoDB setup
const mongoClient = new MongoClient(process.env.MONGO_URI);
let readingsCollection;

mongoClient.connect()
  .then(() => {
    const db = mongoClient.db('smart-sensor-stream');
    readingsCollection = db.collection('sensor_readings');
    console.log('✅ Connected to MongoDB Atlas');
  })
  .catch(err => console.error('❌ MongoDB connection failed:', err.message));

// Frontend WebSocket server
const frontendWSS = new WebSocket.Server({ port: FRONTEND_WS_PORT });
console.log(`📡 Frontend WebSocket running on ws://localhost:${FRONTEND_WS_PORT}`);

let sensorSocket = null;

// Connect to sensor dynamically
function connectToSensor(type, ip) {
  const SENSOR_URL = `ws://${ip}:8080/sensor/connect?type=${type}`;

  if (sensorSocket && sensorSocket.readyState === WebSocket.OPEN) {
    sensorSocket.close(1000, 'Switching sensor');
    console.log('🔌 Previous sensor connection closed');
  }

  sensorSocket = new WebSocket(SENSOR_URL);

  sensorSocket.on('open', () => {
    console.log(`✅ Connected to Sensor Server: ${type} at ${ip}`);
  });

  sensorSocket.on('message', async (data) => {
    try {
      const parsed = JSON.parse(data);
      const { values } = parsed;
      const timestamp = new Date();

      if (readingsCollection) {
        await readingsCollection.insertOne({ type, values, timestamp });
      }

      frontendWSS.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type, values, timestamp }));
        }
      });
    } catch (err) {
      console.error('❌ Error processing sensor data:', err.message);
    }
  });

  sensorSocket.on('error', err => console.error('❌ Sensor WebSocket error:', err.message || err));
  sensorSocket.on('close', (code, reason) => console.warn(`⚠️ Sensor WebSocket closed: ${code} - ${reason}`));
}

// API: Switch sensor
app.post('/switch-sensor', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) return res.status(403).send('Forbidden: Invalid API Key');

  const { type, ip } = req.body;
  if (!type || !ip) return res.status(400).send('Sensor type and IP required');

  try {
    connectToSensor(type, ip);
    res.send({ status: 'switched', type, ip });
  } catch (err) {
    console.error('❌ Failed to switch sensor:', err.message);
    res.status(500).send('Internal Server Error');
  }
});

// API: Fetch history
app.get('/history', async (req, res) => {
  try {
    const data = await readingsCollection.find({
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }).toArray();
    res.json(data);
  } catch (err) {
    console.error('❌ Error fetching history:', err.message);
    res.status(500).send('Error fetching history');
  }
});

app.listen(PORT, () => console.log(`🚀 Backend HTTP server running on http://localhost:${PORT}`));
