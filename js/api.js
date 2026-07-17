// js/api.js
import { api } from './api.js';

// Wait for the browser to ensure dependencies are loaded
$(document).ready(() => {
    if (!window.GoldenLayout) {
        console.error("GoldenLayout failed to load. Check script order in index.html.");
        return;
    }

    const localLat = 40.0759;
    const localLon = -75.2996;

    const config = {
        // ... (Your config remains the same)
    };

    // Use window.GoldenLayout explicitly
    const layout = new window.GoldenLayout(config, $('#desktopLayoutContainer'));

    // ... (Your registration logic remains the same)

    layout.init();
    $(window).resize(() => layout.updateSize());
});
export const api = {
    fetchNWSForecast: async (lat, lon) => {
        const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
        const pointData = await pointRes.json();
        const forecastRes = await fetch(pointData.properties.forecast);
        const data = await forecastRes.json();
        return data.properties.periods;
    },

    fetchHazards: async (lat, lon) => {
        const res = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`);
        const data = await res.json();
        return data.features;
    },

    fetchAirQuality: async (zip) => {
        // Simulation logic if no API key is provided
        const structuralDriftPM = Math.floor(Math.sin(Date.now() / 70000) * 12);
        return [
            { ParameterName: "PM2.5", AQI: Math.max(10, 54 + structuralDriftPM) },
            { ParameterName: "O3", AQI: 34 }
        ];
    }
};
