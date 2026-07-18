// Local Configuration & Center Focus Variables
const localLat = 40.0759;
const localLon = -75.2996;
let countdownVal = 120;

const AIRNOW_API_KEY = "E5AFEF36-80F6-4A42-AE38-F3C56E3AEAC4"; 

const schuylkillGauges = [
    { id: "01472000", name: "Schuylkill River at Reading, PA", lat: 40.3323, lon: -75.9324, noaaId: "RDGP1" },
    { id: "01473500", name: "Schuylkill River at Pottstown, PA", lat: 40.2429, lon: -75.6605, noaaId: "PTTP1" },
    { id: "01474500", name: "Schuylkill River at Norriton, PA", lat: 40.1118, lon: -75.3532, noaaId: "NSRP1" },
    { id: "01474703", name: "Schuylkill River at Conshohocken, PA", lat: 40.0712, lon: -75.3093, noaaId: "CSHP1" },
    { id: "01474000", name: "Schuylkill River at Philadelphia, PA (Fairmount Dam)", lat: 39.9676, lon: -75.1832, noaaId: "PADP1" }
];

let globalForecastDataCache = null;
let globalActiveAlertsCache = {};
let noaaChartInstance = null;
let alertSoundEnabled = false;
let previousAlertCount = 0;
let alertAudio = null;

// Initialize alert sound
function initAlertSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        alertAudio = audioContext;
    } catch (err) {
        console.log("Audio context initialization deferred - will try on first user interaction");
    }
}

// Play alert sound
function playAlertSound() {
    if (!alertSoundEnabled || !alertAudio) return;
    
    try {
        const context = alertAudio;
        if (context.state === 'suspended') {
            context.resume();
        }
        
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(context.destination);
        
        oscillator.frequency.value = 1000;
        gainNode.gain.setValueAtTime(0.3, context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.1);
        
        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + 0.1);
        
        const osc2 = context.createOscillator();
        osc2.connect(gainNode);
        osc2.frequency.value = 1200;
        gainNode.gain.setValueAtTime(0.3, context.currentTime + 0.15);
        gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.25);
        osc2.start(context.currentTime + 0.15);
        osc2.stop(context.currentTime + 0.25);
    } catch (err) {
        console.error("Alert sound error:", err);
    }
}

// Layout configuration
const config = {
    settings: { hasHeaders: true, reorderEnabled: true, showPopoutIcon: false, showMaximiseIcon: true, showCloseIcon: false },
    content: [{
        type: 'row',
        content: [
            {
                type: 'column',
                width: 40,
                content: [
                    { type: 'component', componentName: 'radarMap', title: 'WINDY DYNAMIC RADAR TRACKING & ARRAYS' },
                    { type: 'component', componentName: 'localForecast', title: '7-DAY GEOGRAPHIC SYNOPTIC OUTLOOK (19428)' }
                ]
            },
            {
                type: 'column',
                width: 30,
                content: [
                    { type: 'component', componentName: 'nwsAlerts', title: 'CRITICAL ENVIRONMENTAL SPECTRUM HAZARDS MATRIX - PENNSYLVANIA' },
                    { type: 'component', componentName: 'hydrologyFeed', title: 'SCHUYLKILL HYDROLOGIC REAL-TIME STREAMFLOW' }
                ]
            },
            {
                type: 'column',
                width: 30,
                content: [
                    { type: 'component', componentName: 'cloudMap', title: 'WINDY DYNAMIC TRACKING & ARRAYS' },
                    { type: 'component', componentName: 'airQualityPanel', title: 'REGIONAL AIR QUALITY MATRIX (AIRNOW LIVE)' },
                    { type: 'component', componentName: 'noaaTides', title: 'NOAA TIDES & CURRENTS (STATION 8545240)' }
                ]
            }
        ]
    }]
};

const layout = new GoldenLayout(config, '#desktopLayoutContainer');

// --- Component Registrations ---
layout.registerComponent('radarMap', function(container) {
    container.getElement().html(`
        <div style="position:relative; width:100%; height:100%; background:#0d1117;">
            <div style="position:absolute; top:15px; right:15px; z-index:999;">
                <select id="windyLayerSelect" style="background: rgba(33, 38, 45, 0.9); color: #00ffcc; border: 1px solid #00ffcc; padding: 6px 10px; font-family: 'Share Tech Mono', monospace; fo[...]
                    <option value="radar">Weather Radar</option>
                    <option value="satellite">Satellite</option>
                    <option value="wind">Wind</option>
                    <option value="rain">Rain</option>
                    <option value="thunder">Thunderstorms</option>
                    <option value="temp">Temperature</option>
                    <option value="clouds">Clouds</option>
                    <option value="waves">Waves</option>
                    <option value="thermals">Thermals</option>
                    <option value="cape">CAPE Index</option>
                </select>
            </div>
            <iframe id="windyIframe" src="https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=in&metricTemp=f&metricWind=mph&zoom=8&overlay=radar&product=radar&level=surfa[...]
        </div>
    `);
    
    setTimeout(() => {
        const select = container.getElement().find('#windyLayerSelect');
        const iframe = container.getElement().find('#windyIframe')[0];
        
        select.on('change', function() {
            const layer = this.value;
            const product = (layer === 'radar' || layer === 'satellite') ? layer : 'gfs';
            iframe.src = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=in&metricTemp=f&metricWind=mph&zoom=8&overlay=${layer}&product=${product}&level=surface&lat=4[...]
        });
    }, 200);
});

layout.registerComponent('cloudMap', function(container) {
    container.getElement().html(`
        <div style="position:relative; width:100%; height:100%; background:#0d1117;">
            <div style="position:absolute; top:15px; right:15px; z-index:999;">
                <select id="windyCloudLayerSelect" style="background: rgba(33, 38, 45, 0.9); color: #00ffcc; border: 1px solid #00ffcc; padding: 6px 10px; font-family: 'Share Tech Mono', monospac[...]
                    <option value="radar">Weather Radar</option>
                    <option value="satellite">Satellite</option>
                    <option value="wind">Wind</option>
                    <option value="rain">Rain</option>
                    <option value="thunder">Thunderstorms</option>
                    <option value="temp">Temperature</option>
                    <option value="clouds" selected>Clouds</option>
                    <option value="highclouds">High Clouds</option>
                    <option value="mediumclouds">Medium Clouds</option>
                    <option value="lowclouds">Low Clouds</option>
                    <option value="fog">Fog</option>
                    <option value="cloudtop">Cloud Tops</option>
                    <option value="cloudbase">Cloud Base</option>
                    <option value="waves">Waves</option>
                    <option value="thermals">Thermals</option>
                    <option value="cape">CAPE Index</option>
                </select>
            </div>
            <iframe id="windyCloudIframe" src="https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=in&metricTemp=f&metricWind=mph&zoom=8&overlay=clouds&product=gfs&level=s[...]
        </div>
    `);
    
    setTimeout(() => {
        const select = container.getElement().find('#windyCloudLayerSelect');
        const iframe = container.getElement().find('#windyCloudIframe')[0];
        
        select.on('change', function() {
            const layer = this.value;
            const product = (layer === 'radar' || layer === 'satellite') ? layer : 'gfs';
            iframe.src = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=in&metricTemp=f&metricWind=mph&zoom=8&overlay=${layer}&product=${product}&level=surface&lat=4[...]
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
            <div style="margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #30363d; display:flex; justify-content:space-between; align-items:center;">
                <div style="font-size:0.85rem; color:#ffcc00; font-weight:bold;"><i class="fa-solid fa-triangle-exclamation"></i> NWS ALERTS</div>
                <button id="soundToggleBtn" onclick="toggleAlertSound()" style="background: #21262d; border: 1px solid #30363d; color: #8b949e; padding: 3px 8px; border-radius: 3px; cursor: point[...]
                    <i class="fa-solid fa-volume-mute"></i> SOUND OFF
                </button>
            </div>
            <div id="alerts-container">Scanning NWS alert network...</div>
        </div>`);
    container.on('open', fetchPennsylvaniaAlerts);
});

layout.registerComponent('airQualityPanel', function(container) {
    container.getElement().html(`<div class="weather-component" id="aqi-container-target" style="display:flex; flex-direction:column; height:100%; overflow:hidden;">Interrogating AirNow sensor frames...</div>`);
    container.on('open', fetchAirQualityData);
});

layout.registerComponent('noaaTides', function(container) {
    container.getElement().html(`
        <div class="weather-component" style="display:flex; flex-direction:column; gap:10px;">
            <div id="noaa-gauges" class="aqi-panel-wrap" style="margin-bottom: 5px;">
                <span style="color:#8b949e; font-size:0.8rem;"><i class="fa-solid fa-satellite-dish"></i> Contacting NOAA sensors...</span>
            </div>
            <div style="flex-grow:1; min-height:180px; position:relative; background:#161b22; border: 1px solid #30363d; border-radius:4px; padding:10px;">
                <canvas id="noaaChart"></canvas>
            </div>
        </div>
    `);
    container.on('open', fetchNOAATides);
});

layout.registerComponent('hydrologyFeed', function(container) {
    container.getElement().html(`<div class="weather-component" id="hydro-river-list">Interrogating USGS stream vectors...</div>`);
    container.on('open', fetchSchuylkillHydrology);
});

layout.init();

// Initialize audio on first user interaction
document.addEventListener('click', () => {
    if (!alertAudio) {
        initAlertSound();
    }
}, { once: true });

// --- Logic Implementation ---

function toggleAlertSound() {
    if (!alertAudio) {
        initAlertSound();
    }
    
    alertSoundEnabled = !alertSoundEnabled;
    const btn = document.getElementById('soundToggleBtn');
    if (btn) {
        if (alertSoundEnabled) {
            btn.style.background = '#1a3a1a';
            btn.style.borderColor = '#00ff55';
            btn.style.color = '#00ff55';
            btn.innerHTML = '<i class="fa-solid fa-volume-high"></i> SOUND ON';
            playAlertSound();
        } else {
            btn.style.background = '#21262d';
            btn.style.borderColor = '#30363d';
            btn.style.color = '#8b949e';
            btn.innerHTML = '<i class="fa-solid fa-volume-mute"></i> SOUND OFF';
        }
    }
}

function fetchNWSForecast() {
    fetch(`https://api.weather.gov/points/${localLat},${localLon}`)
        .then(res => res.json())
        .then(d => fetch(d.properties.forecast))
        .then(res => res.json())
        .then(data => {
            globalForecastDataCache = data.properties.periods;
            let html = `<div id="current-obs" style="margin-bottom:15px; font-size:1.1rem; color:#fff; padding:10px; background:#161b22; border:1px solid #30363d; border-radius:4px;">CURRENT COND[...]
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
        }).catch(err => console.error("Forecast error:", err));
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

function fetchPennsylvaniaAlerts() {
    const container = $('#alerts-container');
    console.log("Starting Pennsylvania alerts fetch...");
    
    // Use the NWS alerts API with a broad Pennsylvania search
    // Query all alerts and filter for PA
    fetch('https://api.weather.gov/alerts/active')
        .then(res => {
            console.log("Alert API response status:", res.status);
            return res.json();
        })
        .then(data => {
            console.log("Total features returned:", data.features ? data.features.length : 0);
            
            let allAlerts = data.features || [];
            
            // Filter for Pennsylvania alerts only
            let paAlerts = allAlerts.filter(f => {
                const areaDesc = f.properties.areaDesc || '';
                const properties = f.properties;
                
                // Check if alert applies to PA
                return areaDesc.includes('PA') || 
                       areaDesc.includes('Pennsylvania') ||
                       (properties.areaDesc && properties.areaDesc.toLowerCase().includes('pennsylvania'));
            });
            
            console.log("Pennsylvania alerts found:", paAlerts.length);
            paAlerts.forEach(alert => {
                console.log("Alert:", alert.properties.event, "-", alert.properties.areaDesc);
            });
            
            globalActiveAlertsCache = {};
            let html = '';
            let alertCount = 0;
            
            if (paAlerts.length > 0) {
                html += `<div style="margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #30363d;">
                    <div style="font-size:0.75rem; color:#ffcc00; font-weight:bold; margin-bottom:5px;">ACTIVE ALERTS - ${paAlerts.length}</div>`;
                
                paAlerts.forEach(f => {
                    const props = f.properties;
                    const alertId = props.id;
                    globalActiveAlertsCache[alertId] = props;
                    alertCount++;
                    
                    // Critical event types highlighting
                    const criticalEvents = ['Tornado Warning', 'Severe Thunderstorm Warning', 'Flash Flood Warning', 'Winter Storm Warning', 'Flood Warning'];
                    const isCritical = criticalEvents.includes(props.event);
                    const alertStyle = isCritical ? 'border-left: 4px solid #ff0000; background: #3d1a1a;' : 'border-left: 4px solid #ff6600; background: #2d2416;';
                    
                    html += `
                        <div class="alert-item" style="${alertStyle} padding: 8px; margin-bottom: 6px; border-radius: 2px; cursor: pointer; font-size:0.75rem;" onclick="openAlertDetails('${alertI[...]
                            <div style="color: ${isCritical ? '#ff0000' : '#ffaa33'}; font-weight: bold; text-transform: uppercase;">${props.event}</div>
                            <div style="color:#8b949e; margin-top:2px; font-size:0.7rem;">${props.areaDesc} | ${props.headline ? props.headline.substring(0, 40) + (props.headline.length > 40 ? '.[...]
                        </div>`;
                });
                html += `</div>`;
            } else {
                html = "<span style='color:#00ff55; font-size:0.8rem;'>✓ SYSTEM CLEAN: NO ACTIVE ALERTS FOR PENNSYLVANIA</span>";
            }
            
            // Check if new alerts appeared and play sound
            if (alertCount > previousAlertCount && alertCount > 0) {
                playAlertSound();
            }
            previousAlertCount = alertCount;
            
            container.html(html);
        })
        .catch(err => {
            console.error("Pennsylvania alerts fetch error:", err);
            container.html(`<span style="color:#ff5555; font-size:0.8rem;"><i class="fa-solid fa-triangle-exclamation"></i> ALERT DATABASE UNREACHABLE</span>`);
        });
}

function openAlertDetails(id) {
    const alertData = globalActiveAlertsCache[id];
    if (!alertData) return;
    
    let body = `<div style="color:#ff5555; font-weight:bold; margin-bottom:10px; border-bottom:1px solid #30363d; padding-bottom:8px;">${alertData.headline || alertData.event}</div>`;
    body += `<div style="color:#8b949e; margin-bottom:8px;"><strong>Area:</strong> ${alertData.areaDesc}</div>`;
    body += `<div style="color:#fff; background:#0d1117; padding:12px; border-radius:4px; border:1px solid #21262d; margin-bottom:15px; font-family:monospace; font-size:0.85rem; white-space:pre-w[...]
    
    if (alertData.instruction) {
        body += `<div style="color:#ffcc00; font-weight:bold; margin-bottom:5px;"><i class="fa-solid fa-shield-halved"></i> RECOMMENDED ACTIONS:</div>`;
        body += `<div style="color:#00ffcc; background:#1f242c; padding:12px; border-radius:4px; border:1px solid #30363d; font-family:monospace; font-size:0.85rem; white-space:pre-wrap; word-wra[...]
    }
    
    openFloatingModal(`PENNSYLVANIA ALERT DETAILS`, body);
}

function getAQIColorSpecs(aqiValue) {
    if (aqiValue <= 50)  return { label: "Good", color: "#00e400" };
    if (aqiValue <= 100) return { label: "Moderate", color: "#ffff00" };
    if (aqiValue <= 150) return { label: "Unhealthy SG", color: "#ff7e00" };
    if (aqiValue <= 200) return { label: "Unhealthy", color: "#ff0000" };
    return { label: "Hazardous", color: "#7e0023" };
}

function fetchAirQualityData() {
    const zipCode = "19428"; 
    const targetUrl = `https://www.airnowapi.org/aq/observation/zipCode/current/?format=application/json&zipCode=${zipCode}&distance=25&API_KEY=${AIRNOW_API_KEY}`;
    
    fetch(targetUrl)
        .then(res => res.json())
        .then(data => {
            let html = `
                <div style="margin-bottom:10px; padding-bottom:6px; border-bottom:1px dashed #30363d;">
                    <div style="font-size:0.85rem; color:#fff;">
                        <i class="fa-solid fa-satellite-dish"></i> CONSHOHOCKEN (19428)
                        <span style="color: #00ffcc; font-size: 0.7rem; margin-left:4px;">[LIVE]</span>
                    </div>
                </div>`;
            
            if(!data || data.length === 0) {
                html += `<div style="color:#ff8800; font-size:0.75rem; padding:8px 0;">NO SENSOR DATA</div>`;
            } else {
                // Group data by station
                const stations = {};
                data.forEach(item => {
                    const station = item.ReportingArea || 'Unknown Station';
                    if (!stations[station]) {
                        stations[station] = [];
                    }
                    stations[station].push(item);
                });
                
                html += `<div style="display:flex; flex-direction:column; gap:10px; height:100%; overflow-y:auto;">`;
                
                // For each station, create a detailed card
                Object.entries(stations).forEach(([stationName, readings]) => {
                    // Find the main AQI reading
                    const mainAqi = readings.find(r => r.ParameterName === 'O3' || r.ParameterName === 'PM2.5') || readings[0];
                    const profile = getAQIColorSpecs(mainAqi.AQI);
                    
                    html += `
                        <div style="background:#161b22; border:1px solid #30363d; border-radius:4px; padding:10px; flex-shrink:0;">
                            <div style="font-size:0.8rem; color:#00ffcc; font-weight:bold; margin-bottom:8px; border-bottom:1px solid #30363d; padding-bottom:6px;">
                                📍 ${stationName}
                            </div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">`;
                    
                    // Show primary AQI prominently
                    html += `
                                <div style="background:#0d1117; border:2px solid ${profile.color}; border-radius:4px; padding:8px; text-align:center; grid-column:1/3;">
                                    <div style="font-size:0.7rem; color:#8b949e; font-weight:bold; text-transform:uppercase; margin-bottom:4px;">PRIMARY AQI</div>
                                    <div style="font-size:2rem; color:${profile.color}; font-weight:bold; margin:4px 0;">${mainAqi.AQI}</div>
                                    <div style="font-size:0.65rem; color:${profile.color}; font-weight:bold;">${profile.label}</div>
                                    <div style="font-size:0.6rem; color:#8b949e; margin-top:4px;">${mainAqi.ParameterName}</div>
                                </div>`;
                    
                    // Show all pollutants
                    readings.forEach(reading => {
                        const pollutantProfile = getAQIColorSpecs(reading.AQI);
                        html += `
                                <div style="background:#0d1117; border:1px solid #21262d; border-radius:3px; padding:6px; text-align:center;">
                                    <div style="font-size:0.65rem; color:#8b949e; font-weight:bold; margin-bottom:2px; text-transform:uppercase; letter-spacing:0.5px;">${reading.ParameterName}</div>
                                    <div style="font-size:1.4rem; color:${pollutantProfile.color}; font-weight:bold;">${reading.AQI}</div>
                                    <div style="font-size:0.55rem; color:${pollutantProfile.color}; font-weight:bold;">${pollutantProfile.label}</div>
                                </div>`;
                    });
                    
                    html += `
                            </div>
                            <div style="font-size:0.65rem; color:#8b949e; border-top:1px solid #30363d; padding-top:6px;">
                                <i class="fa-solid fa-clock"></i> Updated: ${new Date().toLocaleTimeString()}
                            </div>
                        </div>`;
                });
                
                html += `</div>`;
            }
            $('#aqi-container-target').html(html);
        })
        .catch(err => {
            console.error("AirNow loop crash:", err);
            $('#aqi-container-target').html(`<span style="color:#ff5555; font-size:0.8rem;"><i class="fa-solid fa-triangle-exclamation"></i> FEED TIMEOUT</span>`);
        });
}

function fetchNOAATides() {
    const station = '8545240'; 
    const timeZone = 'lst_ldt'; 
    const units = 'english';
    const format = 'json';
    const date = 'today'; 

    const baseUrl = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=${station}&time_zone=${timeZone}&units=${units}&format=${format}&date=${date}`;

    Promise.all([
        fetch(`${baseUrl}&product=water_level&datum=MLLW`).then(r => r.json()),
        fetch(`${baseUrl}&product=water_level&datum=NAVD`).then(r => r.json()),
        fetch(`${baseUrl}&product=predictions&datum=MLLW`).then(r => r.json()),
        fetch(`${baseUrl}&product=air_temperature`).then(r => r.json())
    ]).then(([wlMllw, wlNavd, predsMllw, airTemp]) => {
        
        const latestWlMllw = wlMllw.data ? wlMllw.data[wlMllw.data.length - 1] : null;
        const latestWlNavd = wlNavd.data ? wlNavd.data[wlNavd.data.length - 1] : null;
        const latestAirTemp = airTemp.data ? airTemp.data[airTemp.data.length - 1] : null;

        let gaugeHtml = `<div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:6px;">`;
        if (latestWlMllw) gaugeHtml += `<div style="background:#161b22; border:1px solid #30363d; border-radius:3px; padding:6px; text-align:center;"><div style="font-size:0.65rem; color:#8b949e;[...]
        if (latestWlNavd) gaugeHtml += `<div style="background:#161b22; border:1px solid #30363d; border-radius:3px; padding:6px; text-align:center;"><div style="font-size:0.65rem; color:#8b949e;[...]
        if (latestAirTemp) gaugeHtml += `<div style="background:#161b22; border:1px solid #30363d; border-radius:3px; padding:6px; text-align:center;"><div style="font-size:0.65rem; color:#8b949e[...]
        gaugeHtml += `</div>`;

        $('#noaa-gauges').html(gaugeHtml || '<span style="color:#ff5555;">NOAA TIMEOUT</span>');

        const labels = wlMllw.data ? wlMllw.data.map(d => {
            const timeParts = d.t.split(' ')[1].split(':');
            return `${timeParts[0]}:${timeParts[1]}`;
        }) : [];
        const dataMllw = wlMllw.data ? wlMllw.data.map(d => parseFloat(d.v)) : [];
        const dataPreds = predsMllw.predictions ? predsMllw.predictions.map(d => parseFloat(d.v)) : [];

        const ctx = document.getElementById('noaaChart').getContext('2d');
        if(noaaChartInstance) noaaChartInstance.destroy();
        
        Chart.defaults.color = '#8b949e';
        Chart.defaults.font.family = "'Share Tech Mono', monospace";
        
        noaaChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Observed (MLLW) ft',
                        data: dataMllw,
                        borderColor: '#00ffcc',
                        backgroundColor: 'rgba(0, 255, 204, 0.1)',
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Predicted (MLLW) ft',
                        data: dataPreds.slice(0, labels.length),
                        borderColor: '#ff5555',
                        borderDash: [4, 4],
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
                plugins: {
                    legend: { display: true, position: 'top', labels: { boxWidth: 12, usePointStyle: true } }
                },
                scales: {
                    x: { ticks: { maxTicksLimit: 6 }, grid: { color: '#21262d' } },
                    y: { grid: { color: '#21262d' } }
                }
            }
        });

    }).catch(err => {
        console.error("NOAA API Error:", err);
        $('#noaa-gauges').html('<span style="color:#ff5555; font-size:0.8rem;"><i class="fa-solid fa-triangle-exclamation"></i> NOAA TIMEOUT</span>');
    });
}

function fetchSchuylkillHydrology() {
    let html = '<h3 style="margin-top:0; margin-bottom:10px; color:#00ffcc; letter-spacing:1px; font-size:0.9rem;">HYDRO-CORRIDOR BASIN STREAMFLOW</h3>';
    schuylkillGauges.forEach(g => {
        html += `
            <div style="background:#161b22; border:1px solid #30363d; border-radius:3px; padding:8px; margin-bottom:8px;">
                <div style="font-weight:bold; color:#fff; font-size:0.85rem;">${g.name}</div>
                <div style="color:#00ffcc; margin:4px 0; font-size:0.75rem;"><i class="fa-solid fa-water"></i> USGS-${g.id}</div>
                <button class="gauge-btn" onclick="openHydrographModal('${g.id}', '${g.name.replace(/'/g, "\\'")}')"><i class="fa-solid fa-chart-line"></i> Waveform</button>
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

// Global Core Sync Timer
setInterval(() => {
    countdownVal--;
    if(countdownVal <= 0) {
        countdownVal = 120;
        fetchNWSForecast();
        fetchPennsylvaniaAlerts();
        fetchAirQualityData();
        fetchNOAATides();
        fetchSchuylkillHydrology();
    }
    const targetTimer = document.getElementById('countdown');
    if(targetTimer) targetTimer.innerText = countdownVal;
}, 1000);

window.addEventListener('resize', () => { 
    layout.updateSize(); 
});
