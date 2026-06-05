import { useEffect, useState } from "react";
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

    if (text.includes("thunder")) return <WiThunderstorm className="weather-icon storm" />;
    if (text.includes("snow")) return <WiSnow className="weather-icon" />;
    if (text.includes("fog") || text.includes("haze") || text.includes("smoke")) {
        return <WiFog className="weather-icon" />;
    }
    if (text.includes("shower")) return <WiShowers className="weather-icon rain" />;
    if (text.includes("rain") || text.includes("drizzle")) {
        return <WiRain className="weather-icon rain" />;
    }
    if (text.includes("mostly clear") || text.includes("clear")) {
        return isNight
            ? <WiNightClear className="weather-icon night" />
            : <WiDaySunny className="weather-icon sunny" />;
    }
    if (text.includes("partly cloudy") || text.includes("mostly sunny")) {
        return isNight
            ? <WiNightAltCloudy className="weather-icon cloud" />
            : <WiDayCloudy className="weather-icon cloud" />;
    }
    if (text.includes("cloud") || text.includes("overcast")) {
        return <WiCloud className="weather-icon cloud" />;
    }

    return isNight
        ? <WiNightClear className="weather-icon night" />
        : <WiDaySunny className="weather-icon sunny" />;
}

export default function App() {
    const now = useClock();
    const [system, setSystem] = useState(null);
    const [spotify, setSpotify] = useState(null);
    const [weather, setWeather] = useState(null);
    const [commute, setCommute] = useState(null);


    async function sendSpotifyCommand(command, body) {
        await fetch(`/api/spotify/${command}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        const spotifyData = await fetchJson("/api/spotify");
        setSpotify(spotifyData);
    }

    useEffect(() => {
        async function load() {
            const [systemData, spotifyData, weatherData, commuteData] =
                await Promise.all([
                    fetchJson("/api/system"),
                    fetchJson("/api/spotify"),
                    fetchJson("/api/weather"),
                    fetchJson("/api/commute"),
                ]);

            setSystem(systemData);
            setSpotify(spotifyData);
            setWeather(weatherData);
            setCommute(commuteData);
        }

        load().catch(console.error);

        const timer = setInterval(() => {
            load().catch(console.error);
        }, 30000);

        return () => clearInterval(timer);
    }, []);

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
                    title={spotify ?.isPlaying ? "Now Playing" : "Paused"}
                    eyebrow="Spotify"
                    className="spotify-card"
                >
                    {spotify ?.albumArt ? (
                        <img className="album-art-img" src={spotify.albumArt} alt={spotify.album || "Album art"} />
                    ) : (
                            <div className="album-art">♪</div>
                        )}

                    <p className="big">{spotify ?.title || "Loading..."}</p>
                    <p className="muted">{spotify ?.artist || ""}</p>
                    <p className="subtle">{spotify ?.album || ""}</p>

                    {spotify ?.durationMs ? (
                        <div className="progress-wrap">
                            <div
                                className="progress-bar"
                                style={{
                                    width: `${Math.min(
                                        100,
                                        Math.round((spotify.progressMs / spotify.durationMs) * 100)
                                    )}%`,
                                }}
                            />
                        </div>
                    ) : null}

                    <p className="subtle">{spotify ?.device || ""}</p>

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
                </Card>

                <Card title="Weather" eyebrow={weather ?.location || "Weather"}>
                    <div className="weather-top">
                        <div className="weather-icon-wrap">
                            {getWeatherIcon(weather ?.condition)}
                        </div>

                        <div>
                            <p className="big">{weather ?.temperature || "--"}</p>
                            <p className="muted">{weather ?.condition || "Loading..."}</p>
                            {weather ?.wind ? <p className="subtle">Wind: {weather.wind}</p> : null}
                        </div>
                    </div>

                    {weather ?.nextPeriod ? (
                        <div className="mini-panel">
                            <p className="mini-label">{weather.nextPeriod.name}</p>
                            <div className="next-period-row">
                                {getWeatherIcon(weather.nextPeriod.condition, weather.nextPeriod.name)}
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