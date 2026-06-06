import { useEffect, useMemo, useState } from "react";
import {
    WiDaySunny,
    WiCloud,
    WiDayCloudy,
    WiFog,
    WiRain,
    WiShowers,
    WiThunderstorm,
    WiSnow,
    WiNightClear,
    WiNightAltCloudy,
    WiSunset,
} from "react-icons/wi";

function useClock() {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    return now;
}

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}`);
    return res.json();
}

async function postJson(url) {
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) throw new Error(`Failed to post ${url}`);
    return res.json();
}

function Card({ title, eyebrow, children, className = "" }) {
    return (
        <section className={`card ${className}`}>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            {children}
        </section>
    );
}

function getWeatherIcon(condition = "", periodName = "") {
    const text = condition.toLowerCase();
    const isNight =
        periodName.toLowerCase().includes("night") ||
        periodName.toLowerCase().includes("tonight");

    if (text.includes("thunder")) return <WiThunderstorm className="weather-icon storm" />;
    if (text.includes("snow")) return <WiSnow className="weather-icon" />;

    if (text.includes("fog") || text.includes("haze") || text.includes("smoke")) {
        return <WiFog className="weather-icon" />;
    }

    if (text.includes("shower")) return <WiShowers className="weather-icon rain" />;
    if (text.includes("rain") || text.includes("drizzle")) {
        return <WiRain className="weather-icon rain" />;
    }

    if (text.includes("partly cloudy")) {
        return isNight ? (
            <WiNightAltCloudy className="weather-icon cloud" />
        ) : (
                <WiDayCloudy className="weather-icon cloud" />
            );
    }

    if (text.includes("mostly sunny") || text.includes("sunny") || text.includes("fair")) {
        return isNight ? (
            <WiNightClear className="weather-icon night" />
        ) : (
                <WiDaySunny className="weather-icon sunny" />
            );
    }

    if (text.includes("mostly clear") || text.includes("clear")) {
        return isNight ? (
            <WiNightClear className="weather-icon night" />
        ) : (
                <WiDaySunny className="weather-icon sunny" />
            );
    }

    if (text.includes("cloud") || text.includes("overcast")) {
        return isNight ? (
            <WiNightAltCloudy className="weather-icon cloud" />
        ) : (
                <WiCloud className="weather-icon cloud" />
            );
    }

    return isNight ? (
        <WiNightClear className="weather-icon night" />
    ) : (
            <WiDaySunny className="weather-icon sunny" />
        );
}

function getWeatherIconForHour(hour) {
    if (hour ?.isSunsetHour) {
        return <WiSunset className="weather-icon sunset" />;
    }

    return getWeatherIcon(hour ?.condition, hour ?.isNight ? "night" : "");
}

function hasUsefulRaspotifyData(raspotify) {
    if (!raspotify ?.connected) return false;
    if (!raspotify ?.title) return false;
    if (raspotify.title === "No Raspotify state found") return false;
    if (raspotify.title === "No Raspotify playback yet") return false;
    return true;
}

function formatMs(ms = 0) {
    const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;
    const totalSeconds = Math.floor(safeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
}

function getEstimatedProgressMs(track) {
    if (!track ?.durationMs) return 0;

    const baseProgress = track.progressMs || 0;

    if (!track.isPlaying || !track.updatedAt) {
        return baseProgress;
    }

    const updatedAtMs = new Date(track.updatedAt).getTime();

    if (!Number.isFinite(updatedAtMs)) {
        return baseProgress;
    }

    const elapsedMs = Date.now() - updatedAtMs;
    return Math.min(track.durationMs, baseProgress + Math.max(0, elapsedMs));
}

function formatHour(isoTime) {
    if (!isoTime) return "--";

    return new Date(isoTime).toLocaleTimeString([], {
        hour: "numeric",
    });
}

function serviceLabel(status) {
    return status === "active" || status === "online" ? "Online" : "Check";
}

export default function App() {
    const now = useClock();

    const [theme, setTheme] = useState(() => {
        return localStorage.getItem("dashboard-theme") || "light";
    });

    const [system, setSystem] = useState(null);
    const [spotify, setSpotify] = useState(null);
    const [raspotify, setRaspotify] = useState(null);
    const [audioVolume, setAudioVolume] = useState(null);
    const [weather, setWeather] = useState(null);
    const [commute, setCommute] = useState(null);
    const [progressTick, setProgressTick] = useState(0);

    useEffect(() => {
        localStorage.setItem("dashboard-theme", theme);
    }, [theme]);

    const displaySpotify = useMemo(() => {
        if (hasUsefulRaspotifyData(raspotify)) {
            return {
                ...spotify,
                ...raspotify,
                source: "raspotify",
            };
        }

        return {
            ...spotify,
            source: spotify ?.source || "spotify",
        };
    }, [spotify, raspotify]);

    const canControlPlayback =
        spotify ?.connected &&
            spotify ?.device === "Bass Amp Pi" &&
                spotify ?.title &&
                spotify.title !== "Nothing playing";

    async function loadStaticData() {
        const [systemData, weatherData, commuteData] = await Promise.all([
            fetchJson("/api/system"),
            fetchJson("/api/weather"),
            fetchJson("/api/commute"),
        ]);

        setSystem(systemData);
        setWeather(weatherData);
        setCommute(commuteData);
    }

    async function loadSpotifyData() {
        const spotifyData = await fetchJson("/api/spotify");
        setSpotify(spotifyData);
    }

    async function loadRaspotifyData() {
        const raspotifyData = await fetchJson("/api/raspotify");

        if (hasUsefulRaspotifyData(raspotifyData)) {
            setRaspotify(raspotifyData);
        }
    }

    async function loadAudioVolumeData() {
        const volumeData = await fetchJson("/api/audio/volume");
        setAudioVolume(volumeData);
    }

    async function loadAllDashboardData() {
        await Promise.all([
            loadStaticData(),
            loadSpotifyData().catch(console.error),
            loadRaspotifyData().catch(console.error),
            loadAudioVolumeData().catch(console.error),
        ]);
    }

    async function sendSpotifyCommand(command, body) {
        if (!canControlPlayback) return;

        await fetch(`/api/spotify/${command}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        await Promise.all([
            loadSpotifyData().catch(console.error),
            loadRaspotifyData().catch(console.error),
        ]);
    }

    async function sendAudioVolumeCommand(command) {
        const volumeData = await postJson(`/api/audio/${command}`);
        setAudioVolume(volumeData);
    }

    useEffect(() => {
        loadAllDashboardData().catch(console.error);

        const raspotifyTimer = setInterval(() => {
            loadRaspotifyData().catch(console.error);
        }, 1000);

        const spotifyTimer = setInterval(() => {
            loadSpotifyData().catch(console.error);
            loadAudioVolumeData().catch(console.error);
        }, 5000);

        const staticTimer = setInterval(() => {
            loadStaticData().catch(console.error);
        }, 60000);

        return () => {
            clearInterval(raspotifyTimer);
            clearInterval(spotifyTimer);
            clearInterval(staticTimer);
        };
    }, []);

    useEffect(() => {
        const timer = setInterval(() => {
            setProgressTick((tick) => tick + 1);
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const estimatedProgressMs = useMemo(() => {
        progressTick;
        return getEstimatedProgressMs(displaySpotify);
    }, [displaySpotify, progressTick]);

    const progressPercent = displaySpotify ?.durationMs
        ? Math.min(
            100,
            Math.round((estimatedProgressMs / displaySpotify.durationMs) * 100)
        )
        : 0;

    const localVolume = audioVolume ?.volume ?? null;
    const hasLocalVolume = Number.isFinite(localVolume);

    return (
        <main className={`page ${theme}`}>
            <header className="hero compact-hero">
                <div>
                    <p className="kicker">Raspberry Pi Command Center</p>
                    <h1>
                        {now.toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                        })}
                    </h1>
                    <p className="date">
                        {now.toLocaleDateString([], {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                        })}
                    </p>
                </div>

                <div className="header-actions">
                    <button
                        className="theme-toggle"
                        onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
                    >
                        {theme === "light" ? "Dark mode" : "Light mode"}
                    </button>

                    <div className="live-pill">
                        <span className="dot" />
                        Live on Bass Amp Pi
          </div>
                </div>
            </header>

            <section className="grid compact-grid">
                <Card
                    title={displaySpotify ?.isPlaying ? "Now Playing" : "Paused"}
                    eyebrow={displaySpotify ?.source === "raspotify" ? "Raspotify" : "Spotify"}
                    className="spotify-card compact-spotify"
                >
                    <div className="spotify-layout">
                        {displaySpotify ?.albumArt ? (
                            <img
                                className="album-art-img compact-album"
                                src={displaySpotify.albumArt}
                                alt={displaySpotify.album || "Album art"}
                            />
                        ) : (
                                <div className="album-art compact-album">♪</div>
                            )}

                        <div className="spotify-details">
                            <p className="big track-title">{displaySpotify ?.title || "Loading..."}</p>
                            <p className="muted">{displaySpotify ?.artist || ""}</p>
                            <p className="subtle">{displaySpotify ?.album || ""}</p>

                            {displaySpotify ?.durationMs ? (
                                <div className={`progress-volume-row ${hasLocalVolume ? "" : "no-volume"}`}>
                                    <div className="song-progress-column">
                                        <div className="progress-wrap compact-progress">
                                            <div
                                                className="progress-bar"
                                                style={{
                                                    width: `${progressPercent}%`,
                                                }}
                                            />
                                        </div>

                                        <p className="subtle">
                                            {formatMs(estimatedProgressMs)} / {formatMs(displaySpotify.durationMs)}
                                        </p>
                                    </div>

                                    {hasLocalVolume ? (
                                        <div className="vertical-volume">
                                            <button onClick={() => sendAudioVolumeCommand("volume-up")}>+</button>

                                            <div className="volume-meter">
                                                <div
                                                    className="volume-fill"
                                                    style={{ height: `${localVolume}%` }}
                                                />
                                            </div>

                                            <span>{localVolume}%</span>

                                            <button onClick={() => sendAudioVolumeCommand("volume-down")}>−</button>
                                        </div>
                                    ) : null}
                                </div>
                            ) : hasLocalVolume ? (
                                <div className="vertical-volume standalone-volume">
                                    <button onClick={() => sendAudioVolumeCommand("volume-up")}>+</button>
                                    <span>{localVolume}%</span>
                                    <button onClick={() => sendAudioVolumeCommand("volume-down")}>−</button>
                                </div>
                            ) : null}

                            <div className="spotify-controls">
                                <button
                                    disabled={!canControlPlayback}
                                    onClick={() => sendSpotifyCommand("previous")}
                                >
                                    ⏮
                </button>

                                {spotify ?.isPlaying ? (
                                    <button
                                        disabled={!canControlPlayback}
                                        onClick={() => sendSpotifyCommand("pause")}
                                    >
                                        ⏸
                  </button>
                                ) : (
                                        <button
                                            disabled={!canControlPlayback}
                                            onClick={() => sendSpotifyCommand("play")}
                                        >
                                            ▶
                  </button>
                                    )}

                                <button
                                    disabled={!canControlPlayback}
                                    onClick={() => sendSpotifyCommand("next")}
                                >
                                    ⏭
                </button>
                            </div>

                            {!canControlPlayback && displaySpotify ?.source === "raspotify" ? (
                                <p className="control-note">
                                    Display only — controlled by another Spotify account
                </p>
                            ) : null}

                            <p className="subtle">
                                {displaySpotify ?.device || "Bass Amp Pi"}
                                {displaySpotify ?.source === "raspotify" ? " · local speaker state" : ""}
                            </p>
                        </div>
                    </div>
                </Card>

                <Card title="Weather" eyebrow={weather ?.location || "Weather"} className="weather-card">
                    <div className="weather-top">
                        <div className="weather-icon-wrap">
                            {getWeatherIcon(weather ?.condition)}
                        </div>

                        <div>
                            <p className="big">{weather ?.temperature || "--"}</p>
                            <p className="muted">{weather ?.condition || "Loading..."}</p>

                            <div className="weather-high-low">
                                <span>H: {weather ?.high || "--"}</span>
                                <span>L: {weather ?.low || "--"}</span>
                            </div>

                            {weather ?.wind ? (
                                <p className="subtle">Wind: {weather.wind}</p>
                            ) : null}
                        </div>
                    </div>

                    {weather ?.hourlyForecast ?.length ? (
                        <div className="hourly-forecast">
                            {weather.hourlyForecast.map((hour) => (
                                <div className="hour-card" key={hour.time}>
                                    <div className="hour-time-wrap">
                                        <p className="hour-time">{formatHour(hour.time)}</p>
                                        {hour.isSunsetHour ? <p className="hour-event">Sunset</p> : null}
                                    </div>

                                    {getWeatherIconForHour(hour)}
                                    <p className="hour-temp">{hour.temperature}</p>

                                    {hour.precipitationChance ? (
                                        <p className="hour-rain">{hour.precipitationChance}%</p>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {weather ?.nextPeriod ? (
                        <div className="mini-panel">
                            <p className="mini-label">{weather.nextPeriod.name}</p>
                            <div className="next-period-row">
                                {getWeatherIcon(
                                    weather.nextPeriod.condition,
                                    weather.nextPeriod.name
                                )}
                                <p className="mini-value">
                                    {weather.nextPeriod.temperature} · {weather.nextPeriod.condition}
                                </p>
                            </div>
                        </div>
                    ) : null}
                </Card>

                <Card title="Commute" eyebrow="SF → San Jose">
                    <p className="big">{commute ?.estimate || "--"}</p>
                    <p className="muted">{commute ?.status || "Loading..."}</p>
                </Card>

                <Card title="Pi Status" eyebrow={system ?.hostname || "System"}>
                    <div className="pi-status-top">
                        <div>
                            <p className="big">{system ?.cpuTemp || "--"}</p>
                            <p className="muted">{system ?.thermalMessage || "Loading..."}</p>
                        </div>

                        <span className={`status-badge ${system ?.thermalStatus || "unknown"}`}>
                            {system ?.thermalStatus || "unknown"}
                        </span>
                    </div>

                    <div className="stat-grid">
                        <div className="stat-tile">
                            <p className="stat-label">Memory</p>
                            <p className="stat-value">{system ? `${system.memory.usedPercent}%` : "--"}</p>
                            <p className="stat-sub">
                                {system ? `${system.memory.usedMb} / ${system.memory.totalMb} MB` : "Loading"}
                            </p>
                        </div>

                        <div className="stat-tile">
                            <p className="stat-label">Disk</p>
                            <p className="stat-value">
                                {system ?.disk ?.usedPercent != null ? `${system.disk.usedPercent}%` : "--"}
                            </p>
                            <p className="stat-sub">
                                {system ?.disk ?.usedGb != null
                                    ? `${system.disk.usedGb} / ${system.disk.totalGb} GB`
                                    : "Loading"}
                            </p>
                        </div>

                        <div className="stat-tile">
                            <p className="stat-label">Uptime</p>
                            <p className="stat-value">{system ?.uptimeLabel || "--"}</p>
                            <p className="stat-sub">Since last reboot</p>
                        </div>

                        <div className="stat-tile">
                            <p className="stat-label">Load</p>
                            <p className="stat-value">{system ?.loadavg ?.[0] ?? "--"}</p>
                            <p className="stat-sub">
                                {system ? system.loadavg.join(" / ") : "Loading"}
                            </p>
                        </div>
                    </div>

                    <div className="service-row">
                        <span>Dashboard</span>
                        <strong>{serviceLabel(system ?.services ?.dashboard)}</strong>
                    </div>

                    <div className="service-row">
                        <span>Raspotify</span>
                        <strong>{serviceLabel(system ?.services ?.raspotify)}</strong>
                    </div>

                    <div className="service-row">
                        <span>Throttle</span>
                        <strong>{system ?.throttling ?.messages ?.[0] || "Loading"}</strong>
                    </div>

                    {system ?.network ?.ipAddresses ?.[0] ?.address ? (
                        <p className="subtle">IP: {system.network.ipAddresses[0].address}</p>
                    ) : null}
                </Card>
            </section>
        </main>
    );
}