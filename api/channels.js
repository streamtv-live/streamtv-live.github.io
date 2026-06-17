const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Base64 helper
function decodeBase64(str) {
  try {
    return Buffer.from(str, 'base64').toString('utf8');
  } catch (e) {
    return str;
  }
}

// Parse M3U playlist string into structured channels array
function parseM3U(m3uString, hostUrl, proxyStreams) {
  const channels = [];
  const lines = m3uString.split('\n');
  let currentMetadata = null;

  const extinfRegex = /#EXTINF:(?:-?\d+)\s*(.*)/;
  const logoRegex = /tvg-logo="([^"]+)"/;
  const groupRegex = /group-title="([^"]+)"/;
  const nameRegex = /tvg-name="([^"]+)"/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      currentMetadata = {
        name: '',
        logo: '',
        group: 'General',
        url: '',
        format: 'hls'
      };

      const commaIndex = line.lastIndexOf(',');
      if (commaIndex !== -1) {
        currentMetadata.name = line.substring(commaIndex + 1).trim();
      }

      const groupMatch = line.match(groupRegex);
      if (groupMatch && groupMatch[1]) {
        currentMetadata.group = groupMatch[1].trim();
      }

      const logoMatch = line.match(logoRegex);
      if (logoMatch && logoMatch[1]) {
        currentMetadata.logo = logoMatch[1].trim();
      }

      if (!currentMetadata.name) {
        const nameMatch = line.match(nameRegex);
        if (nameMatch && nameMatch[1]) {
          currentMetadata.name = nameMatch[1].trim();
        } else {
          currentMetadata.name = 'Unnamed Channel';
        }
      }
    } else if (line.startsWith('http') || line.startsWith('/') || line.startsWith('./')) {
      if (currentMetadata) {
        let originalUrl = line;
        
        // Determine format
        const lowercaseUrl = originalUrl.toLowerCase();
        if (lowercaseUrl.includes('.ts') || lowercaseUrl.includes('/ts') || lowercaseUrl.includes('mpegts')) {
          currentMetadata.format = 'mpegts';
        } else if (lowercaseUrl.includes('.mp4') || lowercaseUrl.includes('.mkv') || lowercaseUrl.includes('.mov')) {
          currentMetadata.format = 'mp4';
        } else {
          currentMetadata.format = 'hls';
        }

        // If proxyStreams is requested, obfuscate and rewrite stream URL to go through proxy API
        if (proxyStreams) {
          const encodedUrl = Buffer.from(originalUrl).toString('base64');
          currentMetadata.url = `${hostUrl}/api/proxy?stream=${encodedUrl}`;
        } else {
          currentMetadata.url = originalUrl;
        }

        channels.push(currentMetadata);
        currentMetadata = null;
      }
    }
  }

  return channels;
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Determine M3U Playlist URL: Check environment variable first, then fallback to local config.json
    let playlistUrl = process.env.IPTV_PLAYLIST_URL;

    if (!playlistUrl) {
      // Read local config.json file
      const configPath = path.join(process.cwd(), 'config.json');
      if (fs.existsSync(configPath)) {
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        playlistUrl = decodeBase64(configData.playlist);
      }
    }

    if (!playlistUrl) {
      throw new Error('M3U Playlist URL not configured in environment variables or config.json');
    }

    // Fetch the M3U content
    const response = await axios.get(playlistUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const hostUrl = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
    const proxyStreams = req.query.proxyStreams === 'true';

    const channels = parseM3U(response.data, hostUrl, proxyStreams);

    res.status(200).json({
      success: true,
      count: channels.length,
      channels: channels
    });
  } catch (error) {
    console.error('Error fetching M3U:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to load and parse IPTV playlist',
      message: error.message
    });
  }
};
