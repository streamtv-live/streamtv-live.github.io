const express = require('express');
const path = require('path');
const cors = require('cors');

// Import Serverless route handlers directly to reuse logic
const channelsHandler = require('./api/channels');
const proxyHandler = require('./api/proxy');
const updatePlaylistHandler = require('./api/update-playlist');

const app = express();

// Enable Global CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Server APIs (Mounting Vercel serverless functions directly)
app.get('/api/channels', channelsHandler);
app.get('/api/proxy', proxyHandler);
app.post('/api/update-playlist', updatePlaylistHandler);

// Serve static frontend assets (HTML, CSS, JS, manifest, sw)
app.use(express.static(path.join(__dirname, '.')));

// Fallback index.html router for SPA behavior
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start listening
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('===================================================');
  console.log(`🚀 StreamTV Local Server running at:`);
  console.log(`   http://localhost:${PORT}`);
  console.log('===================================================');
});
