// Local Configuration & Center Focus Variables
const localLat = 40.0759;
const localLon = -75.2996;
let countdownVal = 120;

const AIRNOW_API_KEY = "E5AFEF36-80F6-4A42-AE38-F3C56E3AEAC4"; 

// Mount Holly NWS Configuration for Philadelphia & Montgomery County
const mountHollyNWSConfig = {
    office: "MHX", // Mount Holly office code
    zones: [
        { code: "PAZ096", name: "Philadelphia County", center: { lat: 39.9526, lon: -75.1652 } },
        { code: "PAZ097", name: "Montgomery County", center: { lat: 40.1907, lon: -75.2660 } }
    ],
    criticalEventTypes: [
        "Tornado Warning",
        "Severe Thunderstorm Warning",
        "Flash Flood Warning",
        "Winter Storm Warning",
        "Flood Warning",
        "High Wind Warning",
        "Extreme Wind Warning"
    ]
};

// Pennsylvania state bounds for alerts
const pennsylvaniaAreas = [
    // Northwestern PA
    "PAC001", "PAC003", "PAC005", "PAC007", "PAC009", "PAC011", "PAC013", "PAC015", "PAC017", "PAC019", "PAC021", "PAC023", "PAC025", "PAC027", "PAC029", "PAC031", "PAC033", "PAC035", "PAC037", "PAC039", "PAC041", "PAC043", "PAC045", "PAC047", "PAC049", "PAC051", "PAC053", "PAC055", "PAC057", "PAC059", "PAC061", "PAC063", "PAC065", "PAC067"
];

const schuylkillGauges = [
    { id: "01472000", name: "Schuylkill River at Reading, PA", lat: 40.3323, lon: -75.9324, noaaId: "RDGP1" },
    { id: "01473500", name: "Schuylkill River at Pottstown, PA", lat: 40.2429, lon: -75.6605, noaaId: "PTTP1" },
    { id: "01474500", name: "Schuylkill River at Norriton, PA", lat: 40.1118, lon: -75.3532, noaaId: "NSRP1" },
    { id: "01474703", name: "Schuylkill River at Conshohocken, PA", lat: 40.0712, lon: -75.3093, noaaId: "CSHP1" },
    { id: "01474000", name: "Schuylkill River at Philadelphia, PA (Fairmount Dam)", lat: 39.9676, lon: -75.1832, noaaId: "PADP1" }
];

let globalForecastDataCache = null;
let globalActiveAlertsCache = {};
let globalMountHollyAlertsCache = {};
let globalPennsylvaniaAlertsCache = {};
let globalSPCAlertsCache = {};
let noaaChartInstance = null;
let alertSoundEnabled = false;
let previousAlertCount = 0;
let alertAudio = null;

// Initialize alert sound
function initAlertSound() {
    // Create an audio context for alert sound - using Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    alertAudio = audioContext;
}

// Play alert sound
function playAlertSound() {
    if (!alertSoundEnabled || !alertAudio) return;
    
    try {
        const context = alertAudio;
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(context.destination);
        
        // Alert tone: 1000Hz for 100ms, then 1200Hz for 100ms, repeated
        oscillator.frequency.value = 1000;
        gainNode.gain.setValueAtTime(0.3, context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.1);
        
        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + 0.1);
        
        // Second beep
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
                    { type: 'component', componentName: 'nwsAlerts', title: 'CRITICAL ENVIRONMENTAL SPECTRUM HAZARDS MATRIX' },
                    { type: 'component', componentName: 'mountHollyAlerts', title: 'MOUNT HOLLY NWS ALERTS (PHI/MONT)' },
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
                <select id="windyLayerSelect" style="background: rgba(33, 38, 45, 0.9); color: #00ffcc; border: 1px solid #00ffcc; padding: 6px 10px; font-family: 'Share Tech Mono', monospace; font-size:0.8rem;">
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
            <iframe id="windyIframe" src="https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=in&metricTemp=f&metricWind=mph&zoom=8&overlay=radar&product=radar&level=surface&lat=40.0759&lon=-75.2996" style="width:100%; height:100%; border:none;"></iframe>
        </div>
    `);
    
    setTimeout(() => {
        const select = container.getElement().find('#windyLayerSelect');
        const iframe = container.getElement().find('#windyIframe')[0];
        
        select.on('change', function() {
            const layer = this.value;
            const product = (layer === 'radar' || layer === 'satellite') ? layer : 'gfs';
            iframe.src = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=in&metricTemp=f&metricWind=mph&zoom=8&overlay=${layer}&product=${product}&level=surface&lat=40.0759&lon=-75.2996`;
        });
    }, 200);
});

layout.registerComponent('cloudMap', function(container) {
    container.getElement().html(`
        <div style="position:relative; width:100%; height:100%; background:#0d1117;">
            <div style="position:absolute; top:15px; right:15px; z-index:999;">
                <select id="windyCloudLayerSelect" style="background: rgba(33, 38, 45, 0.9); color: #00ffcc; border: 1px solid #00ffcc; padding: 6px 10px; font-family: 'Share Tech Mono', monospace; font-size:0.8rem;">
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
            <iframe id="windyCloudIframe" src="https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=in&metricTemp=f&metricWind=mph&zoom=8&overlay=clouds&product=gfs&level=surface&lat=40.0759&lon=-75.2996" style="width:100%; height:100%; border:none;"></iframe>
        </div>
    `);
    
    setTimeout(() => {
        const select = container.getElement().find('#windyCloudLayerSelect');
        const iframe = container.getElement().find('#windyCloudIframe')[0];
        
        select.on('change', function() {
            const layer = this.value;
            const product = (layer === 'radar' || layer === 'satellite') ? layer : 'gfs';
            iframe.src = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=in&metricTemp=f&metricWind=mph&zoom=8&overlay=${layer}&product=${product}&level=surface&lat=40.0759&lon=-75.2996`;
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
                <div style="font-size:0.85rem; color:#ffcc00; font-weight:bold;"><i class="fa-solid fa-triangle-exclamation"></i> PENNSYLVANIA STATEWIDE ALERTS</div>
                <button id="soundToggleBtn" onclick="toggleAlertSound()" style="background: #21262d; border: 1px solid #30363d; color: #8b949e; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-family: 'Share Tech Mono', monospace; font-size: 0.7rem; transition: all 0.2s;" title="Toggle alert sound">
                    <i class="fa-solid fa-volume-mute"></i> SOUND OFF
                </button>
            </div>
            <div id="alerts-container">Interrogating matrix telemetry frames...</div>
        </div>`);
    container.on('open', fetchPennsylvaniaAlerts);
});

layout.registerComponent('mountHollyAlerts', function(container) {
    container.getElement().html(`
        <div class="weather-component" style="position:relative; background:#1a1f26;">
            <div style="margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #30363d;">
                <div style="font-size:0.85rem; color:#ffcc00; font-weight:bold;"><i class="fa-solid fa-tower-broadcast"></i> MOUNT HOLLY NWS OFFICE</div>
                <div style="font-size:0.7rem; color:#8b949e; margin-top:2px;">Philadelphia & Montgomery County Zones</div>
            </div>
            <div id="mount-holly-alerts-container">Scanning Mount Holly NWS databases...</div>
        </div>`);
    container.on('open', fetchMountHollyAlerts);
});

layout.registerComponent('airQualityPanel', function(container) {
    container.getElement().html(`<div class="weather-component" id="aqi-container-target">Interrogating AirNow sensor frames...</div>`);
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

// Initialize alert sound on first user interaction
document.addEventListener('click', () => {
    if (!alertAudio) {
        initAlertSound();
    }
}, { once: true });

// --- Logic Implementation ---

function toggleAlertSound() {
    alertSoundEnabled = !alertSoundEnabled;
    const btn = document.getElementById('soundToggleBtn');
    if (btn) {
        if (alertSoundEnabled) {
            btn.style.background = '#1a3a1a';
            btn.style.borderColor = '#00ff55';
            btn.style.color = '#00ff55';
            btn.innerHTML = '<i class="fa-solid fa-volume-high"></i> SOUND ON';
            playAlertSound(); // Test sound
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
            let html = `<div id="current-obs" style="margin-bottom:15px; font-size:1.1rem; color:#fff; padding:10px; background:#161b22; border:1px solid #30363d; border-radius:4px;">CURRENT CONDITIONS - 19428 CONSHOHOCKEN PA</div>`;
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

function fetchPennsylvaniaAlerts() {
    const container = $('#alerts-container');
    
    // Fetch all active alerts in Pennsylvania using NWS API
    fetch('https://api.weather.gov/alerts/active?point=40.5,-77.5')
        .then(res => res.json())
        .then(data => {
            let nwsAlerts = data.features || [];
            
            // Filter for Pennsylvania only (by checking areaDesc)
            nwsAlerts = nwsAlerts.filter(f => {
                const areaDesc = f.properties.areaDesc || '';
                return areaDesc.includes('PA') || areaDesc.includes('Pennsylvania');
            });
            
            console.log(`Found ${nwsAlerts.length} NWS alerts in Pennsylvania`);
            
            // Fetch SPC alerts
            return fetchSPCAlerts().then(spcAlerts => ({
                nws: nwsAlerts,
                spc: spcAlerts
            }));
        })
        .then(({ nws, spc }) => {
            globalPennsylvaniaAlertsCache = {};
            let html = '';
            let currentAlertCount = 0;
            
            // Display NWS Alerts
            if (nws.length > 0) {
                html += `<div style="margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #30363d;">
                    <div style="font-size:0.75rem; color:#ffcc00; font-weight:bold; margin-bottom:5px;">NWS ALERTS (STATEWIDE) - ${nws.length} ACTIVE</div>`;
                
                nws.forEach(f => {
                    const props = f.properties;
                    const alertId = `nws-pa-${props.id}`;
                    globalPennsylvaniaAlertsCache[alertId] = { ...props, source: 'NWS' };
                    currentAlertCount++;
                    
                    // Highlight critical events
                    const isCritical = mountHollyNWSConfig.criticalEventTypes.includes(props.event);
                    const alertStyle = isCritical ? 'border-left: 4px solid #ff0000; background: #3d1a1a;' : 'border-left: 4px solid #ff6600; background: #2d2416;';
                    
                    html += `
                        <div class="alert-item" style="${alertStyle} padding: 8px; margin-bottom: 6px; border-radius: 2px; cursor: pointer; font-size:0.75rem;" onclick="openPennsylvaniaAlertDetails('${alertId}')">
                            <div style="color: ${isCritical ? '#ff0000' : '#ffaa33'}; font-weight: bold; text-transform: uppercase;">${props.event}</div>
                            <div style="color:#8b949e; margin-top:2px; font-size:0.7rem;">${props.areaDesc} | ${props.headline ? props.headline.substring(0, 40) + (props.headline.length > 40 ? '...' : '') : 'Event update.'}</div>
                        </div>`;
                });
                html += `</div>`;
            }
            
            // Display SPC Alerts
            if (spc.length > 0) {
                html += `<div style="margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #30363d;">
                    <div style="font-size:0.75rem; color:#ff9900; font-weight:bold; margin-bottom:5px;">SPC PRODUCTS (STORM PREDICTION CENTER) - ${spc.length}</div>`;
                
                spc.forEach(alert => {
                    const alertId = `spc-pa-${alert.id}`;
                    globalSPCAlertsCache[alertId] = alert;
                    currentAlertCount++;
                    
                    html += `
                        <div class="alert-item" style="border-left: 4px solid #ff9900; background: #2d2416; padding: 8px; margin-bottom: 6px; border-radius: 2px; cursor: pointer; font-size:0.75rem;" onclick="openSPCAlertDetails('${alertId}')">
                            <div style="color: #ff9900; font-weight: bold; text-transform: uppercase;">${alert.type}</div>
                            <div style="color:#8b949e; margin-top:2px; font-size:0.7rem;">${alert.headline || alert.description.substring(0, 50) + '...'}</div>
                        </div>`;
                });
                html += `</div>`;
            }
            
            if (nws.length === 0 && spc.length === 0) {
                html = "<span style='color:#00ff55; font-size:0.8rem;'>✓ SYSTEM CLEAN: NO ACTIVE ALERTS FOR PENNSYLVANIA</span>";
            }
            
            // Play sound if new alerts appeared
            if (currentAlertCount > previousAlertCount) {
                playAlertSound();
            }
            previousAlertCount = currentAlertCount;
            
            container.html(html);
        })
        .catch(err => {
            console.error("Pennsylvania alerts fetch error:", err);
            container.html(`<span style="color:#ff5555; font-size:0.8rem;"><i class="fa-solid fa-triangle-exclamation"></i> ALERT DATABASE UNREACHABLE</span>`);
        });
}

function fetchSPCAlerts() {
    // Fetch SPC outlooks and products
    return Promise.all([
        fetch('https://www.spc.noaa.gov/products/fire_wx/fwdy1.json').then(r => r.json()).catch(() => ({})),
        fetch('https://www.spc.noaa.gov/products/outlook/day1otlk.json').then(r => r.json()).catch(() => ({}))
    ]).then(([fireWx, day1Outlook]) => {
        let alerts = [];
        
        // Parse fire weather outlook
        if (fireWx && fireWx.features) {
            fireWx.features.forEach((feature, idx) => {
                if (feature.properties && feature.properties.LABEL && feature.properties.LABEL.includes('PA')) {
                    alerts.push({
                        id: `fw-${idx}`,
                        type: 'Fire Weather Outlook',
                        headline: feature.properties.LABEL || 'Fire Weather Alert',
                        description: feature.properties.LABEL || 'Fire weather conditions detected in Pennsylvania'
                    });
                }
            });
        }
        
        // Parse day 1 outlook
        if (day1Outlook && day1Outlook.features) {
            day1Outlook.features.forEach((feature, idx) => {
                if (feature.geometry) {
                    const props = feature.properties || {};
                    const riskLevel = props.RISK || 'GENERAL';
                    if (riskLevel !== 'GENERAL') {
                        alerts.push({
                            id: `d1-${idx}`,
                            type: `${riskLevel} Risk (Day 1 Outlook)`,
                            headline: `Severe Weather Risk: ${riskLevel}`,
                            description: `Day 1 Outlook - Risk Level: ${riskLevel}`
                        });
                    }
                }
            });
        }
        
        return alerts;
    }).catch(err => {
        console.error("SPC fetch error:", err);
        return [];
    });
}

function openPennsylvaniaAlertDetails(id) {
    const alertData = globalPennsylvaniaAlertsCache[id];
    if (!alertData) return;
    let body = `<div style="color:#ffcc00; font-weight:bold; margin-bottom:5px; padding-bottom:5px; border-bottom:1px solid #30363d;"><i class="fa-solid fa-landmark"></i> PENNSYLVANIA STATEWIDE ALERT</div>`;
    body += `<div style="color:#ff5555; font-weight:bold; margin-bottom:10px; border-bottom:1px solid #30363d; padding-bottom:8px;">${alertData.headline || alertData.event}</div>`;
    body += `<div style="color:#fff; background:#0d1117; padding:12px; border-radius:4px; border:1px solid #21262d; margin-bottom:15px; font-family:monospace; font-size:0.85rem; white-space:pre-wrap; word-wrap:break-word;">${alertData.description}</div>`;
    if (alertData.instruction) {
        body += `<div style="color:#ffcc00; font-weight:bold; margin-bottom:5px;"><i class="fa-solid fa-shield-halved"></i> RECOMMENDED ACTIONS:</div>`;
        body += `<div style="color:#00ffcc; background:#1f242c; padding:12px; border-radius:4px; border:1px solid #30363d; font-family:monospace; font-size:0.85rem; white-space:pre-wrap; word-wrap:break-word;">${alertData.instruction}</div>`;
    }
    openFloatingModal(`NWS PENNSYLVANIA ALERT DETAILS`, body);
}

function openSPCAlertDetails(id) {
    const alertData = globalSPCAlertsCache[id];
    if (!alertData) return;
    let body = `<div style="color:#ff9900; font-weight:bold; margin-bottom:5px; padding-bottom:5px; border-bottom:1px solid #30363d;"><i class="fa-solid fa-tower-broadcast"></i> STORM PREDICTION CENTER</div>`;
    body += `<div style="color:#ff9900; font-weight:bold; margin-bottom:10px; border-bottom:1px solid #30363d; padding-bottom:8px;">${alertData.type}</div>`;
    body += `<div style="color:#fff; background:#0d1117; padding:12px; border-radius:4px; border:1px solid #21262d; margin-bottom:15px; font-family:monospace; font-size:0.85rem; white-space:pre-wrap; word-wrap:break-word;">${alertData.description}</div>`;
    if (alertData.headline) {
        body += `<div style="color:#ffcc00; font-weight:bold; margin-bottom:5px;"><i class="fa-solid fa-star"></i> SUMMARY:</div>`;
        body += `<div style="color:#00ffcc; background:#1f242c; padding:12px; border-radius:4px; border:1px solid #30363d; font-family:monospace; font-size:0.85rem; white-space:pre-wrap; word-wrap:break-word;">${alertData.headline}</div>`;
    }
    openFloatingModal(`SPC ALERT DETAILS`, body);
}

function fetchMountHollyAlerts() {
    const container = $('#mount-holly-alerts-container');
    let allAlerts = [];
    
    // Fetch alerts for each Mount Holly zone
    Promise.all(mountHollyNWSConfig.zones.map(zone => 
        fetch(`https://api.weather.gov/alerts/active?area=${zone.code}`)
            .then(res => res.json())
            .then(data => ({
                zone: zone.name,
                zoneCode: zone.code,
                alerts: data.features || []
            }))
            .catch(err => {
                console.error(`Error fetching alerts for ${zone.code}:`, err);
                return { zone: zone.name, zoneCode: zone.code, alerts: [] };
            })
    )).then(results => {
        globalMountHollyAlertsCache = {};
        let html = '';
        let hasAlerts = false;
        
        results.forEach(result => {
            const zoneAlerts = result.alerts;
            if (zoneAlerts.length > 0) {
                hasAlerts = true;
                html += `<div style="margin-bottom:12px;">`;
                html += `<div style="font-size:0.75rem; color:#ffcc00; font-weight:bold; margin-bottom:5px; text-transform:uppercase;">${result.zone} (${result.zoneCode})</div>`;
                
                zoneAlerts.forEach(f => {
                    const props = f.properties;
                    const alertId = `mh-${result.zoneCode}-${props.id}`;
                    globalMountHollyAlertsCache[alertId] = { ...props, zone: result.zone };
                    
                    // Highlight critical events
                    const isCritical = mountHollyNWSConfig.criticalEventTypes.includes(props.event);
                    const alertClass = isCritical ? 'critical-alert-item' : 'standard-alert-item';
                    const alertStyle = isCritical ? 'border-left: 4px solid #ff0000; background: #3d1a1a;' : '';
                    
                    html += `
                        <div class="${alertClass}" style="${alertStyle} border-left: 4px solid #ff6600; background: #2d2416; padding: 8px; margin-bottom: 6px; border-radius: 2px; cursor: pointer; font-size:0.75rem;" onclick="openMountHollyAlertDetails('${alertId}')">
                            <div style="color: ${isCritical ? '#ff0000' : '#ffaa33'}; font-weight: bold; text-transform: uppercase;">${props.event}</div>
                            <div style="color:#8b949e; margin-top:2px; font-size:0.7rem;">${props.headline ? props.headline.substring(0, 60) + (props.headline.length > 60 ? '...' : '') : 'Event update.'}</div>
                        </div>`;
                });
                html += `</div>`;
            }
        });
        
        if (!hasAlerts) {
            html = "<span style='color:#00ff55; font-size:0.8rem;'>✓ NO ACTIVE WARNINGS - Mount Holly NWS</span>";
        }
        
        container.html(html);
    }).catch(err => {
        console.error("Mount Holly alerts fetch error:", err);
        container.html(`<span style="color:#ff5555; font-size:0.8rem;"><i class="fa-solid fa-triangle-exclamation"></i> MOUNT HOLLY DATABASE UNREACHABLE</span>`);
    });
}

function openAlertDetails(id) {
    const alertData = globalActiveAlertsCache[id];
    if (!alertData) return;
    let body = `<div style="color:#ff5555; font-weight:bold; margin-bottom:10px; border-bottom:1px solid #30363d; padding-bottom:8px;">${alertData.headline || alertData.event}</div>`;
    body += `<div style="color:#fff; background:#0d1117; padding:12px; border-radius:4px; border:1px solid #21262d; margin-bottom:15px; font-family:monospace; font-size:0.85rem; white-space:pre-wrap; word-wrap:break-word;">${alertData.description}</div>`;
    if (alertData.instruction) {
        body += `<div style="color:#ffcc00; font-weight:bold; margin-bottom:5px;"><i class="fa-solid fa-shield-halved"></i> MITIGATION ACTION GUIDELINES:</div>`;
        body += `<div style="color:#00ffcc; background:#1f242c; padding:12px; border-radius:4px; border:1px solid #30363d; font-family:monospace; font-size:0.85rem; white-space:pre-wrap; word-wrap:break-word;">${alertData.instruction}</div>`;
    }
    openFloatingModal(`ALERT MATRIX SPECIFICATIONS`, body);
}

function openMountHollyAlertDetails(id) {
    const alertData = globalMountHollyAlertsCache[id];
    if (!alertData) return;
    let body = `<div style="color:#ffcc00; font-weight:bold; margin-bottom:5px; padding-bottom:5px; border-bottom:1px solid #30363d;"><i class="fa-solid fa-tower-broadcast"></i> MOUNT HOLLY NWS - ${alertData.zone}</div>`;
    body += `<div style="color:#ff5555; font-weight:bold; margin-bottom:10px; border-bottom:1px solid #30363d; padding-bottom:8px;">${alertData.headline || alertData.event}</div>`;
    body += `<div style="color:#fff; background:#0d1117; padding:12px; border-radius:4px; border:1px solid #21262d; margin-bottom:15px; font-family:monospace; font-size:0.85rem; white-space:pre-wrap; word-wrap:break-word;">${alertData.description}</div>`;
    if (alertData.instruction) {
        body += `<div style="color:#ffcc00; font-weight:bold; margin-bottom:5px;"><i class="fa-solid fa-shield-halved"></i> RECOMMENDED ACTIONS:</div>`;
        body += `<div style="color:#00ffcc; background:#1f242c; padding:12px; border-radius:4px; border:1px solid #30363d; font-family:monospace; font-size:0.85rem; white-space:pre-wrap; word-wrap:break-word;">${alertData.instruction}</div>`;
    }
    openFloatingModal(`MOUNT HOLLY NWS ALERT DETAILS`, body);
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
        
        // Extracting latest available array indices for the gauge metrics
        const latestWlMllw = wlMllw.data ? wlMllw.data[wlMllw.data.length - 1] : null;
        const latestWlNavd = wlNavd.data ? wlNavd.data[wlNavd.data.length - 1] : null;
        const latestAirTemp = airTemp.data ? airTemp.data[airTemp.data.length - 1] : null;

        let gaugeHtml = '';
        if (latestWlMllw) gaugeHtml += `<div class="aqi-block-metric" style="padding:6px;"><div style="font-size:0.65rem; color:#8b949e; font-weight:bold;">WATER LVL (MLLW)</div><div class="aqi-score-callout" style="font-size:1.8rem; color:#00ffcc;">${latestWlMllw.v} ft</div></div>`;
        if (latestWlNavd) gaugeHtml += `<div class="aqi-block-metric" style="padding:6px;"><div style="font-size:0.65rem; color:#8b949e; font-weight:bold;">WATER LVL (NAVD)</div><div class="aqi-score-callout" style="font-size:1.8rem; color:#00ffcc;">${latestWlNavd.v} ft</div></div>`;
        if (latestAirTemp) gaugeHtml += `<div class="aqi-block-metric" style="padding:6px;"><div style="font-size:0.65rem; color:#8b949e; font-weight:bold;">AIR TEMP</div><div class="aqi-score-callout" style="font-size:1.8rem; color:#ffaa00;">${latestAirTemp.v}°F</div></div>`;

        $('#noaa-gauges').html(gaugeHtml || '<span style="color:#ff5555;">NOAA FEED TIMEOUT</span>');

        // Extracting the full arrays for the Chart.js dataset
        const labels = wlMllw.data ? wlMllw.data.map(d => {
            const timeParts = d.t.split(' ')[1].split(':');
            return `${timeParts[0]}:${timeParts[1]}`;
        }) : [];
        const dataMllw = wlMllw.data ? wlMllw.data.map(d => parseFloat(d.v)) : [];
        const dataPreds = predsMllw.predictions ? predsMllw.predictions.map(d => parseFloat(d.v)) : [];

        const ctx = document.getElementById('noaaChart').getContext('2d');
        if(noaaChartInstance) noaaChartInstance.destroy();
        
        // Define global charting visual defaults to match the dashboard aesthetic
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
        $('#noaa-gauges').html('<span style="color:#ff5555; font-size:0.8rem;"><i class="fa-solid fa-triangle-exclamation"></i> NOAA FEED TIMEOUT</span>');
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

// Global Core Sync Timer
setInterval(() => {
    countdownVal--;
    if(countdownVal <= 0) {
        countdownVal = 120;
        fetchNWSForecast();
        fetchPennsylvaniaAlerts();
        fetchMountHollyAlerts();
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
