const express = require("express");
const path = require("path");
const os = require("os");
const fs = require("fs");
const SunCalc = require("suncalc");
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

async function spotifyRequest(endpoint, options = {}) {
    const accessToken = await refreshSpotifyAccessToken();

    const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    });

    if (!response.ok && response.status !== 204) {
        const text = await response.text();
        throw new Error(`Spotify request failed: ${response.status} ${text}`);
    }

    if (response.status === 204) {
        return null;
    }

    return response.json();
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
                source: "spotify",
                isPlaying: false,
                device: "No active Spotify playback",
                title: "Nothing playing",
                artist: "",
                album: "",
                albumArt: "",
                progressMs: 0,
                durationMs: 0,
                volume: null,
            });
        }

        if (!response.ok) {
            const text = await response.text();
            return res.status(response.status).json({
                connected: false,
                source: "spotify",
                error: `Spotify playback fetch failed: ${response.status} ${text}`,
            });
        }

        const data = await response.json();
        const item = data.item;

        res.json({
            connected: true,
            source: "spotify",
            isPlaying: data.is_playing,
            device: data.device ?.name || "Unknown device",
            title: item ?.name || "Unknown track",
            artist: item ?.artists ?.map((artist) => artist.name).join(", ") || "",
            album: item ?.album ?.name || "",
            albumArt: item ?.album ?.images ?.[0] ?.url || "",
            progressMs: data.progress_ms || 0,
            durationMs: item ?.duration_ms || 0,
            volume: data.device ?.volume_percent ?? null,
            updatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            connected: false,
            source: "spotify",
            device: "Bass Amp Pi",
            title: "Spotify auth needed",
            artist: "Visit /api/spotify/login",
            state: "error",
            error: error.message,
        });
    }
});

app.get("/api/raspotify", (req, res) => {
    try {
        const statePath =
            process.env.RASPOTIFY_NOW_PLAYING_PATH ||
            "/var/cache/raspotify/now-playing.json";

        if (!fs.existsSync(statePath)) {
            return res.json({
                connected: false,
                source: "raspotify",
                isPlaying: false,
                device: "Bass Amp Pi",
                title: "No Raspotify state found",
                artist: "",
                album: "",
                albumArt: "",
            });
        }

        const raw = fs.readFileSync(statePath, "utf8").trim();

        if (!raw) {
            return res.json({
                connected: false,
                source: "raspotify",
                isPlaying: false,
                device: "Bass Amp Pi",
                title: "No Raspotify playback yet",
                artist: "",
                album: "",
                albumArt: "",
            });
        }

        const data = JSON.parse(raw);

        res.json({
            connected: true,
            source: "raspotify",
            isPlaying: Boolean(data.isPlaying),
            device: data.device || "Bass Amp Pi",
            title: data.title || "Unknown track",
            artist: data.artist || "",
            album: data.album || "",
            albumArt: data.albumArt || "",
            trackId: data.trackId || "",
            uri: data.uri || "",
            progressMs: data.positionMs || 0,
            durationMs: data.durationMs || 0,
            updatedAt: data.updatedAt || null,
            event: data.event || "",
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            connected: false,
            source: "raspotify",
            isPlaying: false,
            device: "Bass Amp Pi",
            title: "Raspotify state error",
            artist: "",
            album: "",
            albumArt: "",
            error: error.message,
        });
    }
});

app.post("/api/spotify/play", async (req, res) => {
    try {
        await spotifyRequest("/me/player/play", {
            method: "PUT",
        });

        res.json({ ok: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.post("/api/spotify/pause", async (req, res) => {
    try {
        await spotifyRequest("/me/player/pause", {
            method: "PUT",
        });

        res.json({ ok: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.post("/api/spotify/next", async (req, res) => {
    try {
        await spotifyRequest("/me/player/next", {
            method: "POST",
        });

        res.json({ ok: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.post("/api/spotify/previous", async (req, res) => {
    try {
        await spotifyRequest("/me/player/previous", {
            method: "POST",
        });

        res.json({ ok: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.post("/api/spotify/volume", async (req, res) => {
    try {
        const volume = Number(req.body.volume);

        if (!Number.isFinite(volume) || volume < 0 || volume > 100) {
            return res.status(400).json({
                ok: false,
                error: "volume must be a number between 0 and 100",
            });
        }

        await spotifyRequest(`/me/player/volume?volume_percent=${volume}`, {
            method: "PUT",
        });

        res.json({ ok: true, volume });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

let cachedWeather = null;
let cachedWeatherAt = 0;

async function getWeather() {
    const now = Date.now();
    const cacheTtlMs = 10 * 60 * 1000;

    if (cachedWeather && now - cachedWeatherAt < cacheTtlMs) {
        return cachedWeather;
    }

    const lat = process.env.WEATHER_LAT || "37.7749";
    const lon = process.env.WEATHER_LON || "-122.4194";
    const latNum = Number(lat);
    const lonNum = Number(lon);
    const locationLabel = process.env.WEATHER_LOCATION_LABEL || "San Francisco";

    function getSunInfoForHour(isoTime) {
        const start = new Date(isoTime);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        const sunTimes = SunCalc.getTimes(start, latNum, lonNum);

        const sunrise = sunTimes.sunrise;
        const sunset = sunTimes.sunset;

        return {
            isNight: start < sunrise || start >= sunset,
            isSunsetHour: sunset >= start && sunset < end,
            sunriseTime: sunrise.toISOString(),
            sunsetTime: sunset.toISOString(),
        };
    }

    const userAgent = "home-lab-dashboard/1.0 (personal Raspberry Pi dashboard)";

    const pointsResponse = await fetch(
        `https://api.weather.gov/points/${lat},${lon}`,
        {
            headers: {
                "User-Agent": userAgent,
                Accept: "application/geo+json",
            },
        }
    );

    if (!pointsResponse.ok) {
        throw new Error(`NWS points request failed: ${pointsResponse.status}`);
    }

    const pointsData = await pointsResponse.json();
    const forecastUrl = pointsData.properties.forecast;
    const hourlyForecastUrl = pointsData.properties.forecastHourly;

    const [forecastResponse, hourlyResponse] = await Promise.all([
        fetch(forecastUrl, {
            headers: {
                "User-Agent": userAgent,
                Accept: "application/geo+json",
            },
        }),
        fetch(hourlyForecastUrl, {
            headers: {
                "User-Agent": userAgent,
                Accept: "application/geo+json",
            },
        }),
    ]);

    if (!forecastResponse.ok) {
        throw new Error(`NWS forecast request failed: ${forecastResponse.status}`);
    }

    if (!hourlyResponse.ok) {
        throw new Error(`NWS hourly forecast request failed: ${hourlyResponse.status}`);
    }

    const forecastData = await forecastResponse.json();
    const hourlyData = await hourlyResponse.json();

    const periods = forecastData.properties.periods || [];
    const hourlyPeriods = hourlyData.properties.periods || [];

    const current = periods[0];
    const next = periods[1];

    const todayDayPeriod = periods.find((period) => period.isDaytime);
    const tonightPeriod = periods.find((period) => !period.isDaytime);

    const hourlyForecast = hourlyPeriods.slice(0, 12).map((period) => {
        const sunInfo = getSunInfoForHour(period.startTime);

        return {
            time: period.startTime,
            temperature: `${period.temperature}°${period.temperatureUnit}`,
            condition: period.shortForecast,
            wind: `${period.windSpeed} ${period.windDirection}`,
            precipitationChance: period.probabilityOfPrecipitation ?.value ?? null,
            isNight: sunInfo.isNight,
            isSunsetHour: sunInfo.isSunsetHour,
            sunriseTime: sunInfo.sunriseTime,
            sunsetTime: sunInfo.sunsetTime,
        };
    });

    cachedWeather = {
        location: locationLabel,
        temperature: current ? `${current.temperature}°${current.temperatureUnit}` : "--",
        condition: current ?.shortForecast || "Unavailable",
        detail: current ?.detailedForecast || "",
        wind: current ? `${current.windSpeed} ${current.windDirection}` : "",
        high: todayDayPeriod
            ? `${todayDayPeriod.temperature}°${todayDayPeriod.temperatureUnit}`
            : null,
        low: tonightPeriod
            ? `${tonightPeriod.temperature}°${tonightPeriod.temperatureUnit}`
            : null,
        nextPeriod: next
            ? {
                name: next.name,
                temperature: `${next.temperature}°${next.temperatureUnit}`,
                condition: next.shortForecast,
            }
            : null,
        hourlyForecast,
        updatedAt: new Date().toISOString(),
    };

    cachedWeatherAt = now;
    return cachedWeather;
}

app.get("/api/weather", async (req, res) => {
    try {
        const weather = await getWeather();
        res.json(weather);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            location: process.env.WEATHER_LOCATION_LABEL || "San Francisco",
            temperature: "--",
            condition: "Weather unavailable",
            detail: error.message,
        });
    }
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