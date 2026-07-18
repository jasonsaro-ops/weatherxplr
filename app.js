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
                
                html += `<div style="display:flex; flex-direction:column; gap:10px; height:calc(100% - 60px); overflow-y:auto;">`;
                
                // For each station, create a detailed card
                Object.entries(stations).forEach(([stationName, readings]) => {
                    // Find the main AQI reading
                    const mainAqi = readings.find(r => r.ParameterName === 'O3' || r.ParameterName === 'PM2.5') || readings[0];
                    const profile = getAQIColorSpecs(mainAqi.AQI);
                    
                    html += `<div style="background:#161b22; border:1px solid #30363d; border-radius:4px; padding:10px; flex-shrink:0;">
                        <div style="font-size:0.8rem; color:#00ffcc; font-weight:bold; margin-bottom:8px; border-bottom:1px solid #30363d; padding-bottom:6px;">
                            📍 ${stationName}
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">`;
                    
                    // Show primary AQI prominently
                    html += `<div style="background:#0d1117; border:2px solid ${profile.color}; border-radius:4px; padding:8px; text-align:center; grid-column:1/3;">
                        <div style="font-size:0.7rem; color:#8b949e; font-weight:bold; text-transform:uppercase; margin-bottom:4px;">PRIMARY AQI</div>
                        <div style="font-size:2rem; color:${profile.color}; font-weight:bold; margin:4px 0;">${mainAqi.AQI}</div>
                        <div style="font-size:0.65rem; color:${profile.color}; font-weight:bold;">${profile.label}</div>
                        <div style="font-size:0.6rem; color:#8b949e; margin-top:4px;">${mainAqi.ParameterName}</div>
                    </div>`;
                    
                    // Show all pollutants
                    readings.forEach(reading => {
                        const pollutantProfile = getAQIColorSpecs(reading.AQI);
                        html += `<div style="background:#0d1117; border:1px solid #21262d; border-radius:3px; padding:6px; text-align:center;">
                            <div style="font-size:0.65rem; color:#8b949e; font-weight:bold; margin-bottom:2px; text-transform:uppercase; letter-spacing:0.5px;">${reading.ParameterName}</div>
                            <div style="font-size:1.4rem; color:${pollutantProfile.color}; font-weight:bold;">${reading.AQI}</div>
                            <div style="font-size:0.55rem; color:${pollutantProfile.color}; font-weight:bold;">${pollutantProfile.label}</div>
                        </div>`;
                    });
                    
                    html += `</div>
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