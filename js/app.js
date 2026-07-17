import { api } from './api.js';

$(document).ready(() => {
    // Check if GoldenLayout loaded
    if (typeof window.GoldenLayout === 'undefined') {
        console.error("GoldenLayout not found!");
        return;
    }

    const config = {
        content: [{
            type: 'row',
            content: [
                { type: 'column', width: 50, content: [
                    { type: 'component', componentName: 'localForecast', title: '7-DAY FORECAST' }
                ]},
                { type: 'column', width: 50, content: [
                    { type: 'component', componentName: 'hazardsPanel', title: 'CRITICAL HAZARDS' }
                ]}
            ]
        }]
    };

    const layout = new window.GoldenLayout(config, $('#desktopLayoutContainer'));

    layout.registerComponent('localForecast', (container) => {
        container.getElement().html('<div class="weather-component">Loading Forecast...</div>');
        container.on('open', async () => {
            const periods = await api.fetchNWSForecast(40.0759, -75.2996);
            container.getElement().html('<div class="forecast-grid">' + periods.map(p => `
                <div class="forecast-card"><div>${p.name}</div><div>${p.temperature}°</div></div>`).join('') + '</div>');
        });
    });

    layout.registerComponent('hazardsPanel', (container) => {
        container.getElement().html('<div class="weather-component">Interrogating hazards...</div>');
        container.on('open', async () => {
            const alerts = await api.fetchHazards(40.0759, -75.2996);
            container.getElement().html(alerts.length > 0 ? alerts.map(a => `<div class="alert-item">${a.properties.headline}</div>`).join('') : "Clear.");
        });
    });

    layout.init();
});
