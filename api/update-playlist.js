const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
    return;
  }

  const { playlistUrl, adminSecret } = req.body;

  if (!playlistUrl) {
    res.status(400).json({ success: false, error: 'Playlist URL is required' });
    return;
  }

  // Admin secret check
  const systemSecret = process.env.ADMIN_SECRET;
  if (systemSecret && adminSecret !== systemSecret) {
    res.status(401).json({ success: false, error: 'Unauthorized: Invalid admin secret key.' });
    return;
  }

  try {
    const configPath = path.join(process.cwd(), 'config.json');

    // Check if filesystem is writeable (usually local server only)
    let localWriteSuccess = false;
    try {
      if (fs.existsSync(configPath)) {
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        // Encode playlist URL in base64
        configData.playlist = Buffer.from(playlistUrl).toString('base64');
        
        fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');
        localWriteSuccess = true;
      }
    } catch (fsError) {
      console.warn('Filesystem is read-only or error writing config.json:', fsError.message);
    }

    if (localWriteSuccess) {
      res.status(200).json({
        success: true,
        message: 'Successfully updated playlist in local config.json file.',
        writeMode: 'local'
      });
    } else {
      res.status(200).json({
        success: true,
        message: 'Running in Serverless mode. Local config file is read-only. Please set the IPTV_PLAYLIST_URL environment variable in your host dashboard (Vercel/Render) to make it persistent across serverless boots.',
        writeMode: 'serverless'
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error updating playlist configuration',
      message: error.message
    });
  }
};
