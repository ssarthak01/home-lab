const express = require("express");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

app.use(express.json());

function getCpuTemp() {
    try {
        const output = execSync("vcgencmd measure_temp").toString().trim();
        return output.replace("temp=", "");
    } catch {
        return "unavailable locally";
    }
}

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        app: "home-lab-dashboard",
        time: new Date().toISOString(),
    });
});

app.get("/api/system", (req, res) => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    res.json({
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        uptimeSeconds: Math.round(os.uptime()),
        loadavg: os.loadavg().map((n) => Number(n.toFixed(2))),
        memory: {
            totalMb: Math.round(totalMem / 1024 / 1024),
            freeMb: Math.round(freeMem / 1024 / 1024),
            usedMb: Math.round((totalMem - freeMem) / 1024 / 1024),
        },
        cpuTemp: getCpuTemp(),
    });
});

const SPOTIFY_SCOPES = [
    "user-read-currently-playing",
    "user-read-playback-state",
    "user-modify-playback-state",
].join(" ");

let inMemoryRefreshToken = process.env.SPOTIFY_REFRESH_TOKEN || "";

function getSpotifyBasicAuthHeader() {
    const raw = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
    return `Basic ${Buffer.from(raw).toString("base64")}`;
}

async function refreshSpotifyAccessToken() {
    const refreshToken = inMemoryRefreshToken || process.env.SPOTIFY_REFRESH_TOKEN;

    if (!refreshToken) {
        throw new Error("Missing SPOTIFY_REFRESH_TOKEN. Visit /api/spotify/login first.");
    }

    const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
    });

    const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            Authorization: getSpotifyBasicAuthHeader(),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Spotify token refresh failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    return data.access_token;
}

app.get("/api/spotify/login", (req, res) => {
    const params = new URLSearchParams({
        client_id: process.env.SPOTIFY_CLIENT_ID,
        response_type: "code",
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
        scope: SPOTIFY_SCOPES,
    });

    res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

app.get("/api/spotify/callback", async (req, res) => {
    try {
        const code = req.query.code;

        if (!code) {
            return res.status(400).send("Missing Spotify authorization code.");
        }

        const body = new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
        });

        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                Authorization: getSpotifyBasicAuthHeader(),
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
        });

        if (!response.ok) {
            const text = await response.text();
            return res.status(response.status).send(`Spotify callback failed: ${text}`);
        }

        const data = await response.json();
        inMemoryRefreshToken = data.refresh_token;

        res.send(`
        <h1>Spotify connected ✅</h1>
        <p>Copy this refresh token into your <code>.env</code> file:</p>
        <pre style="white-space: pre-wrap; word-break: break-all;">SPOTIFY_REFRESH_TOKEN=${data.refresh_token}</pre>
        <p>Then restart your server and visit <a href="/api/spotify">/api/spotify</a>.</p>
      `);
    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
});

app.get("/api/spotify", async (req, res) => {
    try {
        const accessToken = await refreshSpotifyAccessToken();

        const response = await fetch("https://api.spotify.com/v1/me/player", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (response.status === 204) {
            return res.json({
                connected: true,
                isPlaying: false,
                device: "No active Spotify playback",
                title: "Nothing playing",
                artist: "",
                album: "",
                albumArt: "",
            });
        }

        if (!response.ok) {
            const text = await response.text();
            return res.status(response.status).json({
                connected: false,
                error: `Spotify playback fetch failed: ${response.status} ${text}`,
            });
        }

        const data = await response.json();
        const item = data.item;

        res.json({
            connected: true,
            isPlaying: data.is_playing,
            device: data.device ?.name || "Unknown device",
            title: item ?.name || "Unknown track",
            artist: item ?.artists ?.map((artist) => artist.name).join(", ") || "",
            album: item ?.album ?.name || "",
            albumArt: item ?.album ?.images ?.[0] ?.url || "",
            progressMs: data.progress_ms,
            durationMs: item ?.duration_ms,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            connected: false,
            device: "Bass Amp Pi",
            title: "Spotify auth needed",
            artist: "Visit /api/spotify/login",
            state: "error",
            error: error.message,
        });
    }
});

app.get("/api/weather", (req, res) => {
    res.json({
        location: "San Francisco",
        temperature: "--",
        condition: "Weather API coming soon",
    });
});

app.get("/api/commute", (req, res) => {
    res.json({
        route: "San Francisco → San Jose",
        estimate: "--",
        status: "Commute API coming soon",
    });
});

if (isProduction) {
    const distPath = path.join(__dirname, "..", "dist");
    app.use(express.static(distPath));

    app.get("/*splat", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
    });
}

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Dashboard server running on http://0.0.0.0:${PORT}`);
});