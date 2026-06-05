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

    if (text.includes("thunder")) {
        return <WiThunderstorm className="weather-icon storm" />;
    }

    if (text.includes("snow")) {
        return <WiSnow className="weather-icon" />;
    }

    if (text.includes("fog") || text.includes("haze") || text.includes("smoke")) {
        return <WiFog className="weather-icon" />;
    }

    if (text.includes("shower")) {
        return <WiShowers className="weather-icon rain" />;
    }

    if (text.includes("rain") || text.includes("drizzle")) {
        return <WiRain className="weather-icon rain" />;
    }

    if (text.includes("sunny") || text.includes("fair")) {
        return <WiDaySunny className="weather-icon sunny" />;
    }

    if (text.includes("mostly clear") || text.includes("clear")) {
        return isNight ? (
            <WiNightClear className="weather-icon night" />
        ) : (
                <WiDaySunny className="weather-icon sunny" />
            );
    }

    if (text.includes("partly cloudy") || text.includes("mostly sunny")) {
        return isNight ? (
            <WiNightAltCloudy className="weather-icon cloud" />
        ) : (
                <WiDayCloudy className="weather-icon cloud" />
            );
    }

    if (text.includes("cloud") || text.includes("overcast")) {
        return <WiCloud className="weather-icon cloud" />;
    }

    return isNight ? (
        <WiNightClear className="weather-icon night" />
    ) : (
            <WiDaySunny className="weather-icon sunny" />
        );
}

function hasUsefulRaspotifyData(raspotify) {
    if (!raspotify ?.connected) return false;
    if (!raspotify ?.title) return false;
    if (raspotify.title === "No Raspotify state found") return false;
    if (raspotify.title === "No Raspotify playback yet") return false;
    return true;
}

function formatMs(ms = 0) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
}

export default function App() {
    const now = useClock();

    const [system, setSystem] = useState(null);
    const [spotify, setSpotify] = useState(null);
    const [raspotify, setRaspotify] = useState(null);
    const [weather, setWeather] = useState(null);
    const [commute, setCommute] = useState(null);

    const displaySpotify = useMemo(() => {
        if (hasUsefulRaspotifyData(raspotify)) {
            return {
                ...spotify,
                ...raspotify,
                source: "raspotify",
                volume: spotify ?.volume ?? null,
            };
        }

        return {
            ...spotify,
            source: spotify ?.source || "spotify",
        };
    }, [spotify, raspotify]);

    async function loadDashboardData() {
        const [systemData, spotifyData, raspotifyData, weatherData, commuteData] =
            await Promise.all([
                fetchJson("/api/system"),
                fetchJson("/api/spotify"),
                fetchJson("/api/raspotify").catch(() => ({
                    connected: false,
                    source: "raspotify",
                })),
                fetchJson("/api/weather"),
                fetchJson("/api/commute"),
            ]);

        setSystem(systemData);
        setSpotify(spotifyData);
        setRaspotify(raspotifyData);
        setWeather(weatherData);
        setCommute(commuteData);
    }

    async function sendSpotifyCommand(command, body) {
        await fetch(`/api/spotify/${command}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        await loadDashboardData();
    }

    useEffect(() => {
        loadDashboardData().catch(console.error);

        const timer = setInterval(() => {
            loadDashboardData().catch(console.error);
        }, 10000);

        return () => clearInterval(timer);
    }, []);

    const progressPercent =
        displaySpotify ?.durationMs && displaySpotify ?.progressMs
            ? Math.min(
                100,
                Math.round(
                    (displaySpotify.progressMs / displaySpotify.durationMs) * 100
                )
            )
            : 0;

    return (
        <main className="page">
            <header className="hero">
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

                <div className="live-pill">
                    <span className="dot" />
                    Live on Bass Amp Pi
        </div>
            </header>

            <section className="grid">
                <Card
                    title={displaySpotify ?.isPlaying ? "Now Playing" : "Paused"}
                    eyebrow={
                        displaySpotify ?.source === "raspotify"
                            ? "Raspotify"
                            : "Spotify"
          }
                    className="spotify-card"
                >
                    {displaySpotify ?.albumArt ? (
                        <img
                            className="album-art-img"
                            src={displaySpotify.albumArt}
                            alt={displaySpotify.album || "Album art"}
                        />
                    ) : (
                            <div className="album-art">♪</div>
                        )}

                    <p className="big">{displaySpotify ?.title || "Loading..."}</p>
                    <p className="muted">{displaySpotify ?.artist || ""}</p>
                    <p className="subtle">{displaySpotify ?.album || ""}</p>

                    {displaySpotify ?.durationMs ? (
                        <>
                            <div className="progress-wrap">
                                <div
                                    className="progress-bar"
                                    style={{
                                        width: `${progressPercent}%`,
                                    }}
                                />
                            </div>

                            <p className="subtle">
                                {formatMs(displaySpotify.progressMs)} /{" "}
                                {formatMs(displaySpotify.durationMs)}
                            </p>
                        </>
                    ) : null}

                    <div className="spotify-controls">
                        <button onClick={() => sendSpotifyCommand("previous")}>⏮</button>

                        {spotify ?.isPlaying ? (
                            <button onClick={() => sendSpotifyCommand("pause")}>⏸</button>
                        ) : (
                                <button onClick={() => sendSpotifyCommand("play")}>▶</button>
                            )}

                        <button onClick={() => sendSpotifyCommand("next")}>⏭</button>
                    </div>

                    <div className="volume-controls">
                        <button
                            onClick={() =>
                                sendSpotifyCommand("volume", {
                                    volume: Math.max(0, (spotify ?.volume ?? 50) - 10),
                                })
                            }
                        >
                            −
            </button>

                        <span>{spotify ?.volume ?? "--"}%</span>

                        <button
                            onClick={() =>
                                sendSpotifyCommand("volume", {
                                    volume: Math.min(100, (spotify ?.volume ?? 50) + 10),
                                })
                            }
                        >
                            +
            </button>
                    </div>

                    <p className="subtle">
                        {displaySpotify ?.device || "Bass Amp Pi"}
                        {displaySpotify ?.source === "raspotify"
                            ? " · local speaker state"
                            : ""}
                    </p>
                </Card>

                <Card title="Weather" eyebrow={weather ?.location || "Weather"}>
                    <div className="weather-top">
                        <div className="weather-icon-wrap">
                            {getWeatherIcon(weather ?.condition)}
                        </div>

                        <div>
                            <p className="big">{weather ?.temperature || "--"}</p>
                            <p className="muted">{weather ?.condition || "Loading..."}</p>
                            {weather ?.wind ? (
                                <p className="subtle">Wind: {weather.wind}</p>
                            ) : null}
                        </div>
                    </div>

                    {weather ?.nextPeriod ? (
                        <div className="mini-panel">
                            <p className="mini-label">{weather.nextPeriod.name}</p>
                            <div className="next-period-row">
                                {getWeatherIcon(
                                    weather.nextPeriod.condition,
                                    weather.nextPeriod.name
                                )}
                                <p className="mini-value">
                                    {weather.nextPeriod.temperature} ·{" "}
                                    {weather.nextPeriod.condition}
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
                    <p className="big">{system ?.cpuTemp || "--"}</p>
                    <p className="muted">
                        {system
                            ? `${system.memory.usedMb}MB / ${system.memory.totalMb}MB used`
                            : "Loading..."}
                    </p>
                    <p className="subtle">
                        {system ? `Load: ${system.loadavg.join(" / ")}` : ""}
                    </p>
                </Card>
            </section>
        </main>
    );
}