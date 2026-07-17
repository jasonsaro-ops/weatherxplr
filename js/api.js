export const api = {
    fetchNWSForecast: async (lat, lon) => {
        const res = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
        const data = await res.json();
        const forecast = await fetch(data.properties.forecast);
        return (await forecast.json()).properties.periods;
    },
    fetchHazards: async (lat, lon) => {
        const res = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`);
        const data = await res.json();
        return data.features;
    }
};
