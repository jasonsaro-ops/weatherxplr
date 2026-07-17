// js/api.js
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