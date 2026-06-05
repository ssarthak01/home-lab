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

app.get("/api/spotify", (req, res) => {
    res.json({
        device: "Bass Amp Pi",
        title: "Spotify integration coming soon",
        artist: "Raspotify is working",
        state: "placeholder",
    });
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