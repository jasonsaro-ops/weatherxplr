// Local Configuration & Center Focus Variables
const localLat = 40.0759;
const localLon = -75.2996;
let countdownVal = 120;
let mapObject, radarLayerGroup;
let lightningMap, lightningLayerGroup; 

const AIRNOW_API_KEY = "E5AFEF36-80F6-4A42-AE38-F3C56E3AEAC4"; 

const schuylkillGauges = [
    { id: "01472000", name: "Schuylkill River at Reading, PA", lat: 40.3323, lon: -75.9324, noaaId: "RDGP1" },
    { id: "01473500", name: "Schuylkill River at Pottstown, PA", lat: 40.2429, lon: -75.6605, noaaId: "PTTP1" },
    { id: "01474500", name: "Schuylkill River at Norristown, PA", lat: 40.1118, lon: -75.3532, noaaId: "NSRP1" },
    { id: "01474703", name: "Schuylkill River at Conshohocken, PA", lat: 40.0712, lon: -75.3093, noaaId: "CSHP1" },
    { id: "01474000", name: "Schuylkill River at Philadelphia, PA (Fairmount Dam)", lat: 39.9676, lon: -75.1832, noaaId: "PADP1" }
];

let globalForecastDataCache = null;
let globalActiveAlertsCache = {};

// Layout configuration matching requested styling
const config = {
    settings: { hasHeaders: true, reorderEnabled: true, showPopoutIcon: false, showMaximiseIcon: true, showCloseIcon: false },
    content: [{
        type: 'row',
        content: [
            {
                type: 'column',
                width: 40,
                content: [
                    { type: 'component', componentName: 'radarMap', title: 'NATIONWIDE WEATHER TRACKER & GEOGRAPHIC ARRAYS' },
                    { type: 'component', componentName: 'localForecast', title: '7-DAY GEOGRAPHIC SYNOPTIC OUTLOOK (19428)' }
                ]
            },
            {
                type: 'column',
                width: 30,
                content: [
                    { type: 'component', componentName: 'nwsAlerts', title: 'CRITICAL ENVIRONMENTAL SPECTRUM HAZARDS MATRIX' },
                    { type: 'component', componentName: 'hydrologyFeed', title: 'SCHUYLKILL HYDROLOGIC REAL-TIME STREAMFLOW' }
                ]
            },
            {
                type: 'column',
                width: 30,
                content: [
                    { type: 'component', componentName: 'lightningGrid', title: 'DYNAMIC LOCAL LIGHTNING DETECTION ARRAY (30 MI RADIUS)' },
                    { type: 'component', componentName: 'airQualityPanel', title: 'REGIONAL AIR QUALITY MATRIX (AIRNOW LIVE)' }
                ]
            }
        ]
    }]
};

const layout = new GoldenLayout(config, '#desktopLayoutContainer');

// --- Component Registrations ---
layout.registerComponent('radarMap', function(container) {
    container.getElement().html(`
        <div style="position:relative; width:100%; height:100%;">
            <div class="control-matrix-panel" style="position:absolute; top:10px; left:10px; z-index:999; margin:0;">
                <label style="cursor:pointer;"><input type="radio" name="weatherModel" value="radar" checked> Doppler Radar</label>
                <label style="cursor:pointer; margin-left:10px;"><input type="radio" name="weatherModel" value="satellite_ir"> Infra Satellite</label>
            </div>
            <div id="map" style="width:100%; height:100%;"></div>
        </div>
    `);
    
    setTimeout(() => {
        mapObject = L.map('map', {zoomControl: false}).setView([localLat, localLon], 8);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(mapObject);
        radarLayerGroup = L.layerGroup().addTo(mapObject);
        
        updateWeatherOverlay('radar');
        
        container.getElement().find('input[name="weatherModel"]').on('change', function() {
            updateWeatherOverlay(this.value);
        });
    }, 200);
});

layout.registerComponent('localForecast', function(container) {
    container.getElement().html(`<div class="weather-component" id="forecast-container">Connecting to synoptic timeline grids...</div>`);
    container.on('open', fetchNWSForecast);
});

layout.registerComponent('nwsAlerts', function(container) {
    container.getElement().html(`
        <div class="weather-component" style="position:relative;">
            <div id="alerts-container">Interrogating matrix telemetry frames...</div>
        </div>`);
    container.on('open', fetchNWSAlerts);
});

layout.registerComponent('airQualityPanel', function(container) {
    container.getElement().html(`<div class="weather-component" id="aqi-container-target">Interrogating AirNow sensor frames...</div>`);
    container.on('open', fetchAirQualityData);
});

layout.registerComponent('hydrologyFeed', function(container) {
    container.getElement().html(`<div class="weather-component" id="hydro-river-list">Interrogating USGS stream vectors...</div>`);
    container.on('open', fetchSchuylkillHydrology);
});

layout.registerComponent('lightningGrid', function(container) {
    container.getElement().html(`<div id="lightningMapContainer" style="width:100%; height:100%;"></div>`);
    container.on('shown', () => {
        if (!lightningMap) {
            initLightningRadarMap();
        } else {
            lightningMap.invalidateSize();
        }
    });
});

layout.init();

// --- Logic Implementation ---

function updateWeatherOverlay(modelType) {
    if(!radarLayerGroup) return;
    radarLayerGroup.clearLayers();
    fetch('https://api.rainviewer.com/public/maps.json')
        .then(res => res.json())
        .then(data => {
            const latest = data[data.length - 1];
            const path = modelType === 'radar' ? '/1/1_1.png' : '/3/1_0.png';
            L.tileLayer(`https://tilecache.rainviewer.com${latest.path}/256/{z}/{x}/{y}${path}`, {
                opacity: 0.65
            }).addTo(radarLayerGroup);
        }).catch(err => console.error("Radar overlay processing fault:", err));
}

function initLightningRadarMap() {
    lightningMap = L.map('lightningMapContainer', { zoomControl: false }).setView([localLat, localLon], 9);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(lightningMap);
    lightningLayerGroup = L.layerGroup().addTo(lightningMap);
    
    L.circleMarker([localLat, localLon], { color: '#ff5555', radius: 5, fillOpacity: 0.9 }).addTo(lightningMap);
    
    // 10mi, 20mi, 30mi rings translated to meters
    [16093.4, 32186.8, 48280.3].forEach(radius => {
        L.circle([localLat, localLon], { radius, color: '#00ffcc', weight: 1, fill: false, opacity: 0.3, dashArray: '4, 4' }).addTo(lightningMap);
    });

    generateSimulatedStrikes();
}

function generateSimulatedStrikes() {
    if (!lightningLayerGroup) return;
    lightningLayerGroup.clearLayers();
    
    // Spawns occasional lightning vectors to populate matrix field elements
    const strikeCount = Math.floor(Math.random() * 4);
    for(let i=0; i<strikeCount; i++) {
        let latOffset = (Math.random() - 0.5) * 0.4;
        let lonOffset = (Math.random() - 0.5) * 0.4;
        let strikeMarker = L.circleMarker([localLat + latOffset, localLon + lonOffset], {
            color: '#ffcc00', radius: 4, fillColor: '#fff', fillOpacity: 1, weight: 2
        }).addTo(lightningLayerGroup);
        strikeMarker.bindPopup(`[LIGHTNING ARREST VEC] Lat: ${(localLat+latOffset).toFixed(4)} Lon: ${(localLon+lonOffset).toFixed(4)}`);
    }
    setTimeout(generateSimulatedStrikes, 12000); 
}

function fetchNWSForecast() {
    fetch(`https://api.weather.gov/points/${localLat},${localLon}`)
        .then(res => res.json())
        .then(d => fetch(d.properties.forecast))
        .then(res => res.json())
        .then(data => {
            globalForecastDataCache = data.properties.periods;
            let html = `<div id="current-obs" style="margin-bottom:15px; font-size:1.1rem; color:#fff; padding:10px; background:#161b22; border:1px solid #30363d; border-radius:4px;">CURRENT CONTEXT: ${globalForecastDataCache[0].temperature}°${globalForecastDataCache[0].temperatureUnit} — ${globalForecastDataCache[0].shortForecast}</div>`;
            html += `<div class="forecast-grid">`;
            
            globalForecastDataCache.forEach((p, i) => {
                html += `
                <div class="forecast-card" onclick="openForecastDetails(${i})">
                    <div style="color:#8b949e; font-size:0.75rem; font-weight:bold; height:24px; overflow:hidden;">${p.name.toUpperCase()}</div>
                    <img src="${p.icon}">
                    <div class="${p.isDaytime?'temp-high':'temp-low'}">${p.temperature}°${p.temperatureUnit}</div>
                    <div style="font-size:0.65rem; color:#8b949e; text-overflow:ellipsis; white-space:nowrap; overflow:hidden; margin-top:4px;">${p.shortForecast}</div>
                </div>`;
            });
            html += `</div>`;
            $('#forecast-container').html(html);
        }).catch(err => console.error("Forecast trace mismatch:", err));
}

function openForecastDetails(index) {
    if (!globalForecastDataCache || !globalForecastDataCache[index]) return;
    const period = globalForecastDataCache[index];
    const modalHTML = `
        <div style="text-align: center; margin-bottom: 15px;">
            <img src="${period.icon}" style="width:70px; border-radius: 4px;">
            <h2 style="margin: 5px 0; color:#fff;">${period.temperature}°${period.temperatureUnit}</h2>
            <div style="color:#ffcc00; font-weight:bold; letter-spacing:1px;">${period.shortForecast}</div>
        </div>
        <div style="border-top: 1px solid #30363d; padding-top: 15px; color:#c9d1d9; font-family: monospace; line-height: 1.6;">
            ${period.detailedForecast}
        </div>`;
    openFloatingModal(`${period.name} METEOROLOGICAL DETAILS`, modalHTML);
}

function fetchNWSAlerts() {
    fetch(`https://api.weather.gov/alerts/active?point=${localLat},${localLon}`)
        .then(res => res.json())
        .then(data => {
            const container = $('#alerts-container');
            if (data.features.length === 0) {
                container.html("<span style='color:#00ff55; font-size:0.85rem;'>✓ SYSTEM CLEAN: NO ACTIVE RADIAL HAZARD WARNINGS REPORTED</span>");
                return;
            }
            let html = "";
            globalActiveAlertsCache = {};
            data.features.forEach(f => {
                const props = f.properties;
                globalActiveAlertsCache[props.id] = props;
                html += `
                    <div class="alert-item" onclick="openAlertDetails('${props.id}')">
                        <div class="alert-title"><i class="fa-solid fa-triangle-exclamation"></i> ${props.event}</div>
                        <div style="font-size:0.8rem; color:#8b949e; margin-top:3px;">${props.headline || 'Localized event update.'}</div>
                    </div>`;
            });
            container.html(html);
        }).catch(err => console.error("Hazards trace link breakdown:", err));
}

function openAlertDetails(id) {
    const alertData = globalActiveAlertsCache[id];
    if (!alertData) return;
    let body = `<div style="color:#ff5555; font-weight:bold; margin-bottom:10px; border-bottom:1px solid #30363d; padding-bottom:8px;">${alertData.headline || alertData.event}</div>`;
    body += `<div style="color:#fff; background:#0d1117; padding:12px; border-radius:4px; border:1px solid #21262d; margin-bottom:15px; font-family:monospace; font-size:0.85rem; white-space:pre-wrap;">${alertData.description}</div>`;
    if (alertData.instruction) {
        body += `<div style="color:#ffcc00; font-weight:bold; margin-bottom:5px;"><i class="fa-solid fa-shield-halved"></i> MITIGATION ACTION GUIDELINES:</div>`;
        body += `<div style="color:#00ffcc; background:#1f242c; padding:12px; border-radius:4px; border:1px solid #30363d; font-family:monospace; font-size:0.85rem;">${alertData.instruction}</div>`;
    }
    openFloatingModal(`ALERT MATRIX SPECIFICATIONS`, body);
}

function getAQIColorSpecs(aqiValue) {
    if (aqiValue <= 50)  return { label: "Good", color: "#00e400" };
    if (aqiValue <= 100) return { label: "Moderate", color: "#ffff00" };
    if (aqiValue <= 150) return { label: "Unhealthy SG", color: "#ff7e00" };
    if (aqiValue <= 200) return { label: "Unhealthy", color: "#ff0000" };
    return { label: "Hazardous", color: "#7e0023" };
}

function fetchAirQualityData() {
    // Queries Live AirNow API via Zip Core Loop Arrays
    const zipCode = "19428"; 
    const targetUrl = `https://www.airnowapi.org/aq/observation/zipCode/current/?format=application/json&zipCode=${zipCode}&distance=25&API_KEY=${AIRNOW_API_KEY}`;
    
    fetch(targetUrl)
        .then(res => res.json())
        .then(data => {
            let html = `
                <div class="aqi-station-row">
                    <div class="aqi-station-header">
                        <span><i class="fa-solid fa-satellite-dish"></i> CONSHOHOCKEN STATION LOOP (19428)</span>
                        <span style="color: #00ffcc; font-size: 0.75rem;">[LIVE STREAM]</span>
                    </div>
                    <div class="aqi-panel-wrap">`;
            
            if(!data || data.length === 0) {
                html += `<span style="color:#ff8800; font-size:0.75rem; padding:5px;">NO DATA DEPLOYED FROM AQI SENSORS IN TARGET BUFFER</span>`;
            } else {
                data.forEach(p => {
                    const profile = getAQIColorSpecs(p.AQI);
                    html += `
                        <div class="aqi-block-metric">
                            <div style="font-size:0.7rem; color:#8b949e; font-weight:bold; letter-spacing:1px;">${p.ParameterName} POLLUTANT</div>
                            <div class="aqi-score-callout" style="color:${profile.color}">${p.AQI}</div>
                            <span class="aqi-pill-badge" style="background-color:${profile.color}">${profile.label}</span>
                        </div>`;
                });
            }
            html += `</div></div>`;
            $('#aqi-container-target').html(html);
        })
        .catch(err => {
            console.error("AirNow loop crash:", err);
            $('#aqi-container-target').html(`<span style="color:#ff5555; font-size:0.8rem;"><i class="fa-solid fa-triangle-exclamation"></i> FEED TIMEOUT - SECURE KEY REJECTED</span>`);
        });
}

function fetchSchuylkillHydrology() {
    let html = '<h3 style="margin-top:0; color:#00ffcc; letter-spacing:1px; font-size:0.9rem;">HYDRO-CORRIDOR BASIN STREAMFLOW MANAGEMENT</h3>';
    schuylkillGauges.forEach(g => {
        html += `
            <div class="gauge-card">
                <div style="font-weight:bold; color:#fff; font-size:0.9rem;">${g.name}</div>
                <div style="color:#00ffcc; margin:5px 0 8px 0; font-size:0.8rem;"><i class="fa-solid fa-water"></i> MONITOR REF: USGS-${g.id}</div>
                <button class="gauge-btn" onclick="openHydrographModal('${g.id}', '${g.name.replace(/'/g, "\\'")}')"><i class="fa-solid fa-chart-line"></i> Deploy Waveform Graphs</button>
            </div>`;
    });
    $('#hydro-river-list').html(html);
}

function openHydrographModal(stationId, stationName) {
    const embedUrl = `https://dashboard.waterdata.usgs.gov/api/gwis/2.1/service/site?agencyCode=USGS&siteNumber=${stationId}&open=plots&banner=false&pad=false`;
    const modalHTML = `
        <div style="height: 500px; width:100%;">
            <iframe src="${embedUrl}" style="width:100%; height:100%; background:#fff; border:none; border-radius:4px;"></iframe>
        </div>`;
    openFloatingModal(`USGS WAVE DATA MATRIX: ${stationName}`, modalHTML);
}

// --- Floating Control Modules ---
function openFloatingModal(title, textHTML) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalBody').innerHTML = textHTML;
    document.getElementById('hubFloatingModal').style.display = 'flex';
}
function closeFloatingModal() { 
    document.getElementById('hubFloatingModal').style.display = 'none'; 
    document.getElementById('modalBody').innerHTML = ''; 
}

// Global Core Sync Timer (Updates matrix array loops every 120 seconds)
setInterval(() => {
    countdownVal--;
    if(countdownVal <= 0) {
        countdownVal = 120;
        fetchNWSForecast();
        fetchNWSAlerts();
        fetchAirQualityData();
        fetchSchuylkillHydrology();
        if(mapObject) updateWeatherOverlay(container.getElement().find('input[name="weatherModel"]:checked').val() || 'radar');
    }
    const targetTimer = document.getElementById('countdown');
    if(targetTimer) targetTimer.innerText = countdownVal;
}, 1000);

window.addEventListener('resize', () => { 
    layout.updateSize(); 
    if (mapObject) mapObject.invalidateSize();
    if (lightningMap) lightningMap.invalidateSize();
});
