const axios = require('axios');
const url = require('url');

// Base64 helper
function decodeBase64(str) {
  try {
    return Buffer.from(str, 'base64').toString('utf8');
  } catch (e) {
    return str;
  }
}

// Resolve relative URL against base URL
function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch (e) {
    return relative;
  }
}

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Get stream URL from query (either 'stream' base64 encoded, or 'url' encoded query)
  const queryUrl = req.query.stream || req.query.url;
  if (!queryUrl) {
    res.status(400).send('Missing stream URL parameter.');
    return;
  }

  const targetUrl = decodeBase64(queryUrl);

  try {
    const isPlaylist = targetUrl.toLowerCase().includes('.m3u8') || targetUrl.toLowerCase().includes('.m3u');

    // Headers to mock typical media requests
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': targetUrl
    };

    if (isPlaylist) {
      // Fetch playlist as text
      const response = await axios.get(targetUrl, {
        headers,
        timeout: 8000,
        responseType: 'text'
      });

      const originalContent = response.data;
      const hostUrl = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
      
      // Rewrite playlist to proxy all internal URLs
      const lines = originalContent.split('\n');
      const rewrittenLines = [];

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();

        if (!line) {
          rewrittenLines.push('');
          continue;
        }

        if (line.startsWith('#')) {
          // Check for URI parameters inside tags (e.g. #EXT-X-KEY:METHOD=AES-128,URI="...")
          if (line.includes('URI=')) {
            line = line.replace(/URI="([^"]+)"/g, (match, p1) => {
              const absUrl = resolveUrl(targetUrl, p1);
              const b64Url = Buffer.from(absUrl).toString('base64');
              return `URI="${hostUrl}/api/proxy?stream=${b64Url}"`;
            });
          }
          rewrittenLines.push(line);
        } else {
          // Resolve relative stream path to absolute
          const absoluteUrl = resolveUrl(targetUrl, line);
          const base64Url = Buffer.from(absoluteUrl).toString('base64');
          
          // Re-route segment chunk back through proxy
          rewrittenLines.push(`${hostUrl}/api/proxy?stream=${base64Url}`);
        }
      }

      const contentType = response.headers['content-type'] || 'application/x-mpegURL';
      res.setHeader('Content-Type', contentType);
      res.status(200).send(rewrittenLines.join('\n'));

    } else {
      // Fetch TS / MP4 media chunks as binary buffer stream
      const response = await axios.get(targetUrl, {
        headers,
        timeout: 10000,
        responseType: 'arraybuffer'
      });

      // Pass content type
      const contentType = response.headers['content-type'] || 'video/mp2t';
      res.setHeader('Content-Type', contentType);
      
      // Cache media segments for 1 minute to optimize Vercel execution and player speed
      res.setHeader('Cache-Control', 'public, max-age=60');

      res.status(200).send(Buffer.from(response.data));
    }

  } catch (error) {
    console.error(`Proxy error for ${targetUrl}:`, error.message);
    res.status(502).send(`Gateway Error: Failed to fetch media segment. ${error.message}`);
  }
};
