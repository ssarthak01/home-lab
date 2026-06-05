import { useEffect, useState } from "react";

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

export default function App() {
    const now = useClock();
    const [system, setSystem] = useState(null);
    const [spotify, setSpotify] = useState(null);
    const [weather, setWeather] = useState(null);
    const [commute, setCommute] = useState(null);

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
                <Card title="Bass Amp" eyebrow="Spotify" className="spotify-card">
                    <div className="album-art">♪</div>
                    <p className="big">{spotify ?.title || "Loading..."}</p>
                    <p className="muted">{spotify ?.artist || ""}</p>
                    <p className="subtle">{spotify ?.device || ""}</p>
                </Card>

                <Card title="Weather" eyebrow="San Francisco">
                    <p className="big">{weather ?.temperature || "--"}</p>
                    <p className="muted">{weather ?.condition || "Loading..."}</p>
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