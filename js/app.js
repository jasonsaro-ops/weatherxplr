import { api } from './api.js';

$(document).ready(() => {
    // 1. Verify GoldenLayout is loaded
    if (typeof window.GoldenLayout === 'undefined') {
        console.error("GoldenLayout not found!");
        return;
    }

    // 2. Define the configuration object
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

    // 3. Declare 'layout' only once
    const layout = new window.GoldenLayout(config, $('#desktopLayoutContainer'));

    // 4. Register components
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

    // 5. Initialize the unique 'layout' instance
    layout.init();

    // 6. Handle resizing
    $(window).resize(() => layout.updateSize());
});
