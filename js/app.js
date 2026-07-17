import { api } from './api.js';

// Access the global GoldenLayout provided by the script tag in index.html
const GL = window.GoldenLayout; 

// ... rest of your config ...
const layout = new GL(config, $('#desktopLayoutContainer'));
// ... rest of your initialization ...

const localLat = 40.0759;
const localLon = -75.2996;

const config = {
    settings: { hasHeaders: true, reorderEnabled: true, showPopoutIcon: false, showMaximiseIcon: true, showCloseIcon: false },
    content: [{
        type: 'row',
        content: [
            { type: 'column', width: 33, content: [
                { type: 'component', componentName: 'localForecast', title: '7-DAY FORECAST' },
                { type: 'component', componentName: 'airQualityPanel', title: 'AIR QUALITY' }
            ]},
            { type: 'column', width: 34, content: [
                { type: 'component', componentName: 'hazardsPanel', title: 'CRITICAL HAZARDS' }
            ]}
        ]
    }]
};

const layout = new GoldenLayout(config, $('#desktopLayoutContainer'));

layout.registerComponent('localForecast', (container) => {
    container.getElement().html(`<div class="weather-component" id="forecast-container">Loading...</div>`);
    container.on('open', async () => {
        const periods = await api.fetchNWSForecast(localLat, localLon);
        let html = '<div class="forecast-grid">' + periods.map(p => `
            <div class="forecast-card">
                <div class="forecast-name">${p.name}</div>
                <img src="${p.icon}">
                <div class="forecast-temp">${p.temperature}°${p.temperatureUnit}</div>
                <div class="forecast-desc">${p.shortForecast}</div>
            </div>`).join('') + '</div>';
        $('#forecast-container').html(html);
    });
});

layout.registerComponent('hazardsPanel', (container) => {
    container.getElement().html(`<div class="weather-component" id="hazards-list-target">Interrogating hazards...</div>`);
    container.on('open', async () => {
        const alerts = await api.fetchHazards(localLat, localLon);
        $('#hazards-list-target').html(alerts.length > 0 
            ? alerts.map(a => `<div class="alert-item">${a.properties.headline}</div>`).join('') 
            : "No active hazards detected.");
    });
});

layout.registerComponent('airQualityPanel', (container) => {
    container.getElement().html(`<div class="weather-component" id="aqi-container-target">Loading AQI...</div>`);
    container.on('open', async () => {
        const data = await api.fetchAirQuality('19428');
        $('#aqi-container-target').html(data.map(p => `
            <div class="aqi-block-metric">
                <div>${p.ParameterName}</div>
                <div class="aqi-score-callout">${p.AQI}</div>
            </div>`).join(''));
    });
});

layout.init();
$(window).resize(() => layout.updateSize());
