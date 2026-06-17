# StreamTV Live - Premium IPTV Web Application

StreamTV Live is a high-fidelity, responsive, glassmorphic IPTV player interface designed to watch live streams directly from your web browser. 

The application is dual-architected:
1. **Frontend-Only Mode:** Hostable as a static site (e.g., GitHub Pages).
2. **Full-Stack Mode:** Hostable as a combined static app and Serverless/API backend (e.g., Vercel, Render) to resolve HTTP mixed-content stream blocks, hide stream sources, and update playlists securely.

---

## Key Features

- **Automated M3U Parsing:** Automatically loads, cleans, and groups channels.
- **Adaptive Formats Playback:** Native HLS (`.m3u8`), MPEG-TS (`.ts`) via MSE, and VOD/MP4 playback.
- **Audible Compliance:** Graceful autoplay support with click-to-unmute alerts.
- **State Persistence:** Local storage tracking for Favorites, Recently Played, and Restoring Last Watched channel.
- **Premium UI:** Glassmorphism animations, dark theme, sidebar, grid views, clock, settings, and shortcuts guide.
- **Keyboard Shortcuts:** Full keyboard hotkey mapping for desktop power users.
- **PWA Ready:** Installable on Android, iOS, and Desktop with offline cache loaders.
- **HTTP Stream Proxying:** Serverless media proxy rewriting playlist URLs to bypass browser HTTPS block on HTTP streams.

---

## Project Structure

```text
├── api/
│   ├── channels.js          # API: Fetch & parse M3U (hides source URL)
│   ├── proxy.js             # API: HTTP-to-HTTPS reverse stream proxy
│   └── update-playlist.js   # API: Securely update playlist source
├── config.json              # Config: Defaults & obfuscated playlist url
├── manifest.json            # PWA: Install metadata
├── sw.js                    # PWA: Cache service worker
├── index.html               # UI Shell & player layouts
├── styles.css               # Premium CSS glass styles
├── app.js                   # Client controller logic
├── server.js                # Local Express development server
└── package.json             # Node dependencies and dev scripts
```

---

## Getting Started (Local Development)

To run the application locally on your computer:

1. **Install Node.js** (v16 or higher recommended).
2. **Navigate to the workspace** and install dependencies:
   ```bash
   npm install
   ```
3. **Start the local server**:
   ```bash
   npm start
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your web browser.

*Note: Running locally over HTTP allows you to play HTTP streams directly without a proxy, since browsers do not enforce Mixed Content blocks on localhost/HTTP.*

---

## Deployment Guide

### 1. Static Deploy (GitHub Pages - https://streamtv-live.github.io/)

To host the player on GitHub Pages, you only need to push the frontend files.

1. Create a GitHub repository and push your files.
2. Go to **Settings > Pages**.
3. Under **Build and deployment**, select **Deploy from a branch** and select your main branch.
4. The site will be built and hosted at `https://yourusername.github.io/`.

#### Handling HTTP Streams on GitHub Pages:
Because GitHub Pages enforces HTTPS, HTTP streams (e.g. `http://...`) will be blocked by default. 
- Open the **Settings Panel** (cog icon) in the web app.
- Provide a public CORS/HTTPS proxy gateway in the **CORS/HTTPS Proxy Gateway URL** field, or deploy the Vercel backend proxy (see below) and point to it.

---

### 2. Full-Stack Deploy (Vercel)

Vercel will host both the frontend and the serverless functions (`api/` folder) in a single project.

1. **Push your code** to a GitHub repository.
2. Go to the **Vercel Dashboard** and click **Add New > Project**.
3. Import your GitHub repository.
4. Under **Environment Variables**, add:
   - `IPTV_PLAYLIST_URL` = `https://raw.githubusercontent.com/razuahammad55/live-tv-hub/refs/heads/main/tv.m3u`
   - `ADMIN_SECRET` = `your-secure-admin-password` (optional, to lock the update API)
5. Click **Deploy**.

Vercel will deploy the frontend and serverless endpoints. In the web app, set your CORS proxy url to: `https://your-vercel-domain.vercel.app/api/proxy?stream=`. 
You can also set the main playlist feed to `/api/channels?proxyStreams=true` to route all video data through the proxy, hiding your original IPTV source urls completely from client networks!

---

## Keyboard Controls

| Key | Action |
| --- | --- |
| `Space` / `K` | Toggle Play / Pause |
| `Arrow Up` / `Down` | Increase / Decrease Volume |
| `M` | Toggle Mute / Unmute |
| `Arrow Left` / `[` | Previous Channel |
| `Arrow Right` / `]` | Next Channel |
| `F` | Toggle Fullscreen |
| `P` | Toggle Picture-in-Picture |
| `A` | Cycle Aspect Ratio (Normal, Fill, Zoom, 16:9) |
