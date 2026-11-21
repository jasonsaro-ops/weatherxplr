const LAT=40.0759,LON=-75.2996,CYCLE=120;
// NWS Mount Holly (PHI) WFO
const MOUNT_HOLLY={lat:39.9919,lon:-74.8083,label:"PHI Mount Holly"};
/** Rough CONUS + nearshore NEXRAD mosaic coverage (Mesonet n0q) */
function inNexradCoverage(lat, lon){
  // Contiguous US + AK/HI not in national mosaic the same way — gate CONUS primarily
  if(lat < 23.5 || lat > 50.5) return false;
  if(lon < -126 || lon > -65) return false;
  return true;
}

let sampleLat=40.0759,sampleLon=-75.2996,sampleMode=false,mapZoom=8;
const PRESETS={
  sepa:{lat:40.0759,lon:-75.2996,label:"SE-PA"},
  z19428:{lat:40.0685,lon:-75.3045,label:"19428"},
  phl:{lat:39.8721,lon:-75.2411,label:"KPHL"},
  nyc:{lat:40.7789,lon:-73.9692,label:"KNYC"},
  abe:{lat:40.6524,lon:-75.4404,label:"KABE"},
  acy:{lat:39.4576,lon:-74.5772,label:"KACY"},
  ilg:{lat:39.6784,lon:-75.6060,label:"KILG"},
  rdg:{lat:40.3785,lon:-75.9653,label:"KRDG"}
};
const GAUGES=[{id:"01472000",name:"Schuylkill @ Reading"},{id:"01473500",name:"Schuylkill @ Pottstown"},{id:"01474500",name:"Schuylkill @ Norriton"},{id:"01474703",name:"Schuylkill @ Conshohocken"},{id:"01474000",name:"Schuylkill @ Fairmount Dam"}];
const WMO={0:"Clear",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",51:"Light drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",71:"Light snow",80:"Showers",95:"Thunderstorm"};
let cd=CYCLE,audioOn=false,audioCtx=null,alertCache={},obsCache={},aqiCache={},kphlObs=null,afdFull="";
let prevAlertIds=new Set(),hasBaseline=false,omData=null,charts={};
const feed={nws:true,om:true,aqi:true,hydro:true,tides:true};
function $(id){return document.getElementById(id)}
function fetchT(url, opts={}, ms=12000){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(), ms);
  return fetch(url, {...opts, signal:ctrl.signal}).finally(()=>clearTimeout(t));
}
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function sevClass(s){s=(s||"").toLowerCase();return ["extreme","severe","moderate","minor"].includes(s)?"sev-"+s:"sev-unknown"}
function sevKey(s){s=(s||"").toLowerCase();return ["extreme","severe","moderate","minor"].includes(s)?s:"unknown"}

// SE-PA / 19428 relevance filter for PA alerts
const SE_PA_RE = /Philadelphia|Montgomery|Delaware|Chester|Bucks|Berks|Lehigh|Northampton|Lancaster|York|Dauphin|Lebanon|Schuylkill|Conshohocken|Norristown|Pottstown|Reading|King of Prussia|Upper Merion|Lower Merion|Abington|Cheltenham|SEPA|southeastern\s*PA|southeast\s*PA|PHI|Mount Holly/i;
function isSePaAlert(f){
  const p=f.properties||{};
  const area=(p.areaDesc||"")+" "+(p.headline||"")+" "+(p.event||"");
  return SE_PA_RE.test(area);
}

function setFeed(id,ok){const el=$("d-"+id);if(el)el.classList.toggle("off",!ok);feed[id]=ok}

function tickClock(){
  const now = new Date();
  const local = now.toLocaleTimeString("en-US",{hour12:false,timeZone:"America/New_York"});
  const zulu = now.toISOString().slice(11,19);
  const el = $("clock");
  if(el) el.textContent = local + " L · " + zulu + "Z";
  // optional separate elements
  const l = $("clock-local"), z = $("clock-zulu");
  if(l) l.textContent = local + " L";
  if(z) z.textContent = zulu + "Z";
}

function arcGauge(value,min,max,color,label,unit,disp){
  const pct=value==null||isNaN(value)?0:Math.max(0,Math.min(1,(value-min)/(max-min)));
  const start=-135,sweep=270,r=42,cx=50,cy=50,toRad=d=>(d*Math.PI)/180;
  const angle=start+sweep*pct;
  const x1=cx+r*Math.cos(toRad(start)),y1=cy+r*Math.sin(toRad(start));
  const x2=cx+r*Math.cos(toRad(start+sweep)),y2=cy+r*Math.sin(toRad(start+sweep));
  const nx=cx+r*Math.cos(toRad(angle)),ny=cy+r*Math.sin(toRad(angle));
  const large=sweep*pct>180?1:0;
  const track=`M ${x1} ${y1} A ${r} ${r} 0 1 1 ${x2} ${y2}`;
  const fill=value==null?"":`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${nx} ${ny}`;
  const shown=disp!=null?disp:(value==null?"—":Math.round(value));
  return `<div class="g-tile" onclick="openConditions()"><div class="lbl">${esc(label)}</div>
    <svg viewBox="0 0 100 78"><path d="${track}" fill="none" stroke="rgba(148,163,184,.2)" stroke-width="8" stroke-linecap="round"/>
    ${fill?`<path d="${fill}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"/>`:""}
    <text x="50" y="52" text-anchor="middle" fill="#f8fafc" font-size="15" font-family="IBM Plex Mono,monospace" font-weight="600">${esc(String(shown))}</text>
    <text x="50" y="66" text-anchor="middle" fill="#6b7a90" font-size="8" font-family="IBM Plex Mono,monospace">${esc(unit)}</text></svg></div>`;
}

function openModal(title,html,sev){$("modal-title").textContent=title;$("modal-body").innerHTML=html;$("modal").className="modal"+(sev?" "+sevClass(sev):"");$("modal-bg").classList.add("open")}
function closeModal(){$("modal-bg").classList.remove("open");$("modal-body").innerHTML=""}
window.closeModal=closeModal;

function ctx(){if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==="suspended")audioCtx.resume();return audioCtx}
function tone(f,t0,dur,type,peak){const c=ctx(),o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(f,t0);g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(peak,t0+.02);g.gain.linearRampToValueAtTime(0,t0+dur);o.connect(g).connect(c.destination);o.start(t0);o.stop(t0+dur+.02)}
function playExtreme(){const n=ctx().currentTime;[880,660,880,660].forEach((f,i)=>tone(f,n+i*.14,.13,"sawtooth",.18))}
function playSevere(){const n=ctx().currentTime;tone(523,n,.3,"sine",.16);tone(784,n+.28,.35,"sine",.16)}
function playAdvisory(){const n=ctx().currentTime;tone(440,n,.1,"triangle",.14);tone(440,n+.16,.1,"triangle",.14)}
function playTone(sev){const s=(sev||"").toLowerCase();if(s==="extreme")playExtreme();else if(s==="severe")playSevere();else playAdvisory();}
const TONES={extreme:playExtreme,severe:playSevere,moderate:playSevere,minor:playAdvisory,unknown:playAdvisory};
function playSevs(set){let d=0;["extreme","severe","moderate","minor","unknown"].forEach(s=>{if(!set.has(s))return;setTimeout(()=>TONES[s](),d);d+=900})}
function initAudio(){try{audioOn=localStorage.getItem("wx_tones")==="1"}catch(e){}syncAudio();$("btn-audio").onclick=()=>{audioOn=!audioOn;try{localStorage.setItem("wx_tones",audioOn?"1":"0")}catch(e){}if(audioOn){ctx();playAdvisory()}syncAudio()}}
function syncAudio(){$("btn-audio").classList.toggle("on",audioOn);$("audio-ico").className=audioOn?"fa-solid fa-volume-high":"fa-solid fa-volume-xmark";$("audio-lbl").textContent=audioOn?"ON":"OFF"}

function renderModelCards(){if(!omData||!omData.current)return;const el=$("mg-blend"); if(el) el.textContent=Math.round(omData.current.temperature_2m)+"°"}
function renderConditions(){
  const c=omData&&omData.current;if(!c)return;
  $("cond-temp").innerHTML=Math.round(c.temperature_2m)+`<span class="card-unit">°F</span>`;
  $("cond-feels").textContent="Feels "+Math.round(c.apparent_temperature)+"°";
  $("cond-desc").textContent=WMO[c.weather_code]||"—";
  $("m-wind").textContent=Math.round(c.wind_speed_10m)+" mph · "+(c.wind_direction_10m??"—")+"°";
  $("m-gust").textContent=Math.round(c.wind_gusts_10m||0)+" mph";
  $("m-pres").textContent=Math.round(c.pressure_msl)+" hPa";
  $("m-rh").textContent=Math.round(c.relative_humidity_2m)+"%";
  $("m-cloud").textContent=c.cloud_cover+"%";
  $("m-precip").textContent=(c.precipitation||0).toFixed(2)+" in";
  $("gauge-grid").innerHTML=
    arcGauge(c.temperature_2m,-10,110,"#f5a623","Temp","°F",Math.round(c.temperature_2m))+
    arcGauge(c.relative_humidity_2m,0,100,"#3b9eff","RH","%",Math.round(c.relative_humidity_2m))+
    arcGauge(c.pressure_msl,980,1040,"#2ecc71","MSLP","hPa",Math.round(c.pressure_msl))+
    arcGauge(c.wind_speed_10m,0,50,"#06b6d4","Wind","mph",Math.round(c.wind_speed_10m));
}
window.openConditions=function(){const c=omData&&omData.current;if(!c)return;
  openModal("Current Conditions",`<div class="gauge-grid" style="margin-bottom:12px">${arcGauge(c.temperature_2m,-10,110,"#f5a623","Temp","°F",Math.round(c.temperature_2m))}${arcGauge(c.relative_humidity_2m,0,100,"#3b9eff","RH","%",Math.round(c.relative_humidity_2m))}${arcGauge(c.pressure_msl,980,1040,"#2ecc71","MSLP","hPa",Math.round(c.pressure_msl))}${arcGauge(c.wind_speed_10m,0,50,"#06b6d4","Wind","mph",Math.round(c.wind_speed_10m))}</div>
  <div class="metric-row"><span class="k">Feels like</span><span class="v">${Math.round(c.apparent_temperature)}°F</span></div>
  <div class="metric-row"><span class="k">Gusts</span><span class="v">${Math.round(c.wind_gusts_10m||0)} mph</span></div>
  <div class="metric-row"><span class="k">Conditions</span><span class="v">${esc(WMO[c.weather_code]||"—")}</span></div>
  <div class="metric-row"><span class="k">Observed</span><span class="v">${esc(c.time||"—")}</span></div>
  <div style="margin-top:8px;font-size:11px;color:var(--text-dim)">Open-Meteo blend · ${LAT}, ${LON}</div>`)}

function renderForecast(){
  if(!omData||!omData.daily)return;
  const d=omData.daily;let rows="";
  for(let i=0;i<Math.min(7,d.time.length);i++){
    const day=new Date(d.time[i]+"T12:00:00");
    const lab=i===0?"Today":day.toLocaleDateString("en-US",{weekday:"short"});
    rows+=`<tr onclick="openDayDetail(${i})"><td>${lab}</td><td class="hi">${Math.round(d.temperature_2m_max[i])}°</td><td class="lo">${Math.round(d.temperature_2m_min[i])}°</td><td>${d.precipitation_probability_max[i]??"—"}%</td></tr>`;
  }
  $("fc-daily").querySelector("tbody").innerHTML=rows;
}
window.openDayDetail=function(i){if(!omData||!omData.daily)return;const d=omData.daily;
  openModal(`Forecast · ${d.time[i]}`,`<div class="metric-row"><span class="k">High</span><span class="v">${Math.round(d.temperature_2m_max[i])}°F</span></div>
  <div class="metric-row"><span class="k">Low</span><span class="v">${Math.round(d.temperature_2m_min[i])}°F</span></div>
  <div class="metric-row"><span class="k">PoP max</span><span class="v">${d.precipitation_probability_max[i]??"—"}%</span></div>
  <div class="metric-row"><span class="k">Wind max</span><span class="v">${Math.round(d.wind_speed_10m_max[i])} mph</span></div>
  <div class="metric-row"><span class="k">Sky</span><span class="v">${esc(WMO[d.weather_code[i]]||"—")}</span></div>`)}

function sparkChart(id,labels,data,color,yLabel){
  const canvas=$(id);if(!canvas)return;
  if(charts[id])charts[id].destroy();
  Chart.defaults.color="#6b7a90";Chart.defaults.font.family="IBM Plex Mono";Chart.defaults.font.size=9;
  const nums=(data||[]).filter(v=>v!=null&&!isNaN(v));
  const ymin=nums.length?Math.floor(Math.min(...nums)):0;
  const ymax=nums.length?Math.ceil(Math.max(...nums)):1;
  // sparse x labels: every ~6 hours among hourly labels
  const xLabels=labels.map((h,i)=> (i%6===0 ? (String(h).padStart?String(h).padStart(2,"0"):h)+":00" : ""));
  charts[id]=new Chart(canvas,{
    type:"line",
    data:{labels:xLabels,datasets:[{data,borderColor:color,borderWidth:1.5,pointRadius:0,fill:true,backgroundColor:color+"22",tension:.35}]},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.parsed.y}${yLabel?(" "+yLabel):""}`}}},
      scales:{
        x:{display:true,ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:6,color:"#6b7a90",font:{size:8}},grid:{color:"rgba(42,49,64,.5)"}},
        y:{display:true,min:ymin,max:ymax===ymin?ymax+1:ymax,ticks:{maxTicksLimit:4,color:"#6b7a90",font:{size:8},callback:v=>v+(yLabel?"":"")},grid:{color:"rgba(42,49,64,.45)"}}
      }
    }
  });
}
function renderSparks(){
  if(!omData||!omData.hourly)return;
  const h=omData.hourly,now=Date.now();
  const labels=[],temps=[],pops=[],winds=[];
  for(let i=0;i<h.time.length&&labels.length<48;i++){
    const t=new Date(h.time[i]);if(t.getTime()<now-3600000)continue;
    labels.push(t.getHours());temps.push(h.temperature_2m[i]);pops.push(h.precipitation_probability[i]??0);winds.push(h.wind_speed_10m[i]);
  }
  sparkChart("c-temp",labels,temps,"#f5a623","°F");sparkChart("c-pop",labels,pops,"#3b9eff","%");sparkChart("c-wind",labels,winds,"#06b6d4","mph");
}

async function fetchPointConditions(){
  const lat=sampleLat, lon=sampleLon;
  try{
    if($("pt-coords")) $("pt-coords").textContent=lat.toFixed(3)+"°, "+lon.toFixed(3)+"°";
    const u=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`+
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m`+
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York`;
    const j=await fetchT(u,{},12000).then(r=>r.json());
    omData = omData || {};
    omData.current = j.current;
    // keep daily/hourly from SE-PA if present for charts
    renderConditions();
  }catch(e){console.warn("point OM",e)}
  // Nearest NWS station
  try{
    const headers={Accept:"application/geo+json,application/ld+json","User-Agent":"WeatherXplr/2.0"};
    const pts=await fetchT(`https://api.weather.gov/points/${lat},${lon}`,{headers},12000).then(r=>r.json());
    const stUrl=pts.properties&&pts.properties.observationStations;
    const office=pts.properties&&(pts.properties.cwa||pts.properties.gridId);
    if($("pt-station")) $("pt-station").textContent="CWA "+(office||"—")+" · nearest NWS stations…";
    if(!stUrl) return;
    const st=await fetchT(stUrl,{headers},12000).then(r=>r.json());
    const stations=(st.features||[]).slice(0,5);
    const results=await Promise.all(stations.map(s=>{
      const id=s.properties.stationIdentifier;
      return fetchT(`https://api.weather.gov/stations/${id}/observations/latest`,{headers},10000)
        .then(r=>r.json()).then(obs=>({id,name:s.properties.name,obs})).catch(()=>null);
    }));
    const list=results.filter(Boolean);
    const box=$("pt-obs");
    if(box){
      if(!list.length) box.innerHTML="<span class='err'>No station OBS</span>";
      else box.innerHTML=list.map(o=>{
        const p=o.obs.properties||{};
        const tC=p.temperature&&p.temperature.value;
        const tF=tC!=null?Math.round(tC*9/5+32):"—";
        return `<div class="obs-row"><div><div class="id">${esc(o.id)}</div><div class="nm">${esc((o.name||"").slice(0,40))}</div></div><div class="tv">${tF}°</div></div>`;
      }).join("");
      const top=list[0];
      if(top&&$("pt-station")) $("pt-station").textContent=`Nearest: ${top.id} · CWA ${office||"—"}`;
    }
  }catch(e){console.warn("point NWS",e)}
}

async function fetchPointAlerts(){
  const lat=sampleLat, lon=sampleLon;
  try{
    const headers={Accept:"application/geo+json,application/json","User-Agent":"WeatherXplr/2.0"};
    const j=await fetchT(`https://api.weather.gov/alerts/active?point=${lat},${lon}`,{headers},12000).then(r=>r.json());
    const all=j.features||[];
    alertCache={features:all};
    all.forEach(f=>{ if(f.id) alertCache[f.id]=f.properties||{}; });
    const n=all.length;
    n=all.length;$("chip-alerts").textContent="ALERTS "+n; if($("chip-alerts-local")) $("chip-alerts-local").textContent=String(n);
    $("chip-alerts").classList.toggle("hot",n>0);
    const list=$("alerts-list");
    if(list){
      if(!all.length) list.innerHTML='<span class="err" style="color:var(--text-dim)">No active alerts at sample point</span>';
      else {
        list.innerHTML=all.slice(0,40).map(f=>{
          const p=f.properties||{};
          const id=esc(f.id||"");
          return `<div class="alert-item ${sevClass(p.severity)}" data-id="${id}" role="button" tabindex="0">
            <div class="ev">${esc(p.event||"Alert")}</div>
            <div class="hd">${esc(p.headline||p.areaDesc||"")}</div>
          </div>`;
        }).join("");
        list.querySelectorAll(".alert-item").forEach(el=>{
          el.addEventListener("click",()=>openAlert(el.getAttribute("data-id")));
        });
      }
    }
    setFeed("nws",true);
  }catch(e){console.warn(e);setFeed("nws",false)}
}

async function fetchPhiAlerts(){
  try{
    const headers={Accept:"application/geo+json","User-Agent":"WeatherXplr/2.0"};
    // NWS does not support ?area=PA reliably (400). Use area queries for PHI CWA states.
    const urls=["https://api.weather.gov/alerts/active?area=PA"];
    const results=await Promise.all(urls.map(u=>fetchT(u,{headers},12000).then(r=>r.ok?r.json():{features:[]}).catch(()=>({features:[]}))));
    const seen=new Set();
    const all=[];
    for(const j of results){
      for(const f of (j.features||[])){
        const id=f.id||(f.properties&&f.properties.id);
        if(id && seen.has(id)) continue;
        if(id) seen.add(id);
        all.push(f);
      }
    }
    const box=$("phi-alerts");
    if(!box) return;
    if(!all.length) box.innerHTML='<span class="err" style="color:var(--text-dim)">No active SE-PA / 19428 alerts</span>';
    else box.innerHTML=all.slice(0,25).map(f=>{
      const p=f.properties||{};
      return `<div class="alert-item ${sevClass(p.severity)}" style="margin-bottom:4px"><div class="ev">${esc(p.event||"")}</div><div class="hd">${esc((p.headline||"").slice(0,120))}</div></div>`;
    }).join("");
  }catch(e){console.warn("phi alerts",e)}
}

async function fetchOpenMeteo(){
  try{
    const u=`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}`+
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m`+
      `&hourly=temperature_2m,precipitation_probability,wind_speed_10m`+
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`+
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York&forecast_days=7`;
    const r=await fetchT(u,{},15000);
    if(!r.ok) throw new Error("OM HTTP "+r.status);
    omData=await r.json();
    setFeed("om",true);
    renderConditions();
    renderForecast();
    renderSparks();
    renderModelCards();
  }catch(e){
    console.warn("Open-Meteo",e);
    setFeed("om",false);
  }
}

async function fetchAlerts(){
  try{
    const headers={Accept:"application/geo+json,application/json","User-Agent":"WeatherXplr/2.0 (github.com/jasonsaro-ops)"};
    // Point alerts for 19428 + PA statewide filtered to SE-PA
    const [pointJ, paJ] = await Promise.all([
      fetchT(`https://api.weather.gov/alerts/active?point=${sampleLat},${sampleLon}`,{headers},12000).then(r=>r.ok?r.json():{features:[]}).catch(()=>({features:[]})),
      fetchT("https://api.weather.gov/alerts/active?area=PA",{headers},12000).then(r=>r.ok?r.json():{features:[]}).catch(()=>({features:[]}))
    ]);
    const seen=new Set();
    let all=[];
    for(const f of (pointJ.features||[])){
      const id=f.id||(f.properties&&f.properties.id)||Math.random();
      if(seen.has(id)) continue; seen.add(id); all.push(f);
    }
    for(const f of (paJ.features||[])){
      if(!isSePaAlert(f)) continue;
      const id=f.id||(f.properties&&f.properties.id)||Math.random();
      if(seen.has(id)) continue; seen.add(id); all.push(f);
    }
    // severity sort
    const rank={extreme:0,severe:1,moderate:2,minor:3,unknown:4};
    all.sort((a,b)=> (rank[sevKey(a.properties&&a.properties.severity)]??4)-(rank[sevKey(b.properties&&b.properties.severity)]??4));
    let n=all.length;
    $("chip-alerts").textContent="ALERTS "+n;
    $("chip-alerts").classList.toggle("hot",n>0);
    if($("chip-alerts-local")) $("chip-alerts-local").textContent=String(n);
    const list=$("alerts-list");
    if(list){
      if(!all.length) list.innerHTML='<span class="err" style="color:var(--text-dim)">No active SE-PA / 19428 alerts</span>';
      else list.innerHTML=all.slice(0,40).map(f=>{
        const p=f.properties||{};
        const id=f.id||p.id||"";
        return `<div class="alert-item ${sevClass(p.severity)}" data-id="${esc(id)}"><div class="ev">${esc(p.event||"Alert")}</div><div class="hd">${esc((p.headline||"").slice(0,160))}</div><div class="alert-meta">${esc((p.areaDesc||"").slice(0,120))}</div></div>`;
      }).join("");
      list.querySelectorAll(".alert-item").forEach((el,i)=>{
        el.addEventListener("click",()=>{
          const p=all[i].properties||{};
          openModal(p.event||"Alert", `
            <div style="color:var(--text-dim);font-size:11px;margin-bottom:8px">${esc(p.areaDesc||"")}</div>
            <div style="white-space:pre-wrap;font-size:12px;line-height:1.45">${esc(p.description||"")}</div>
            ${p.instruction?`<div style="margin-top:10px;padding:8px;border-left:3px solid var(--cyan);background:var(--raise)"><strong>Instruction</strong><div style="white-space:pre-wrap;font-size:12px;margin-top:4px">${esc(p.instruction)}</div></div>`:""}
          `, p.severity);
        });
      });
    }
    // Audio on new severe+
    const ids=new Set(all.map(f=>f.id||(f.properties&&f.properties.id)).filter(Boolean));
    if(hasBaseline && audioOn){
      const newSev=new Set();
      all.forEach(f=>{
        const id=f.id||(f.properties&&f.properties.id);
        if(id && !prevAlertIds.has(id)){
          const s=sevKey(f.properties&&f.properties.severity);
          if(s==="extreme"||s==="severe"||s==="moderate") newSev.add(s);
        }
      });
      if(newSev.size) playSevs(newSev);
    }
    prevAlertIds=ids; hasBaseline=true;
    setFeed("nws",true);
  }catch(e){
    console.warn(e);setFeed("nws",false);
    if($("alerts-list"))$("alerts-list").innerHTML=`<span class="err">Alert feed down</span>`;
  }
}
window.openSPC=function(){
  const note=window.__spcNote||"SPC Day-1";const d=window.__spcDetail||{labels:[],counts:{}};
  let rows=(d.labels||[]).map(l=>`<div class="metric-row"><span class="k">${esc(l)}</span><span class="v">${d.counts[l]||0} region(s)</span></div>`).join("")||`<div class="empty">No categorical risk</div>`;
  const cycles=["0100","2000","1630","1300","1200"];const utcH=new Date().getUTCHours()*100+new Date().getUTCMinutes();
  const ranked=[{c:"0100",t:100},{c:"2000",t:2000},{c:"1630",t:1630},{c:"1300",t:1300},{c:"1200",t:1200}];
  const order=[...ranked.filter(x=>x.t<=utcH).sort((a,b)=>b.t-a.t),...ranked.filter(x=>x.t>utcH).sort((a,b)=>b.t-a.t)].map(x=>x.c);
  const urls=order.map(c=>`https://www.spc.noaa.gov/products/outlook/day1otlk_${c}.png`);window.__spcImgUrls=urls;
  openModal("SPC Day-1 Outlook",`<div style="color:var(--amber);font-weight:700;margin-bottom:8px">${esc(note)}</div>${rows}
  <div style="margin:12px 0 6px;font-size:10px;color:var(--text-dim);text-transform:uppercase">Outlook graphic</div>
  <div style="background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:6px;text-align:center">
  <img id="spc-img" src="${urls[0]}" data-idx="0" style="max-width:100%" onerror="window.__spcFb&&window.__spcFb(this)">
  </div>
  <button class="btn" style="width:100%" onclick="window.open('https://www.spc.noaa.gov/products/outlook/day1otlk.html','_blank')">Full SPC product ↗</button>`,"moderate");
};
window.__spcFb=function(img){const urls=window.__spcImgUrls||[];let i=parseInt(img.getAttribute("data-idx")||"0",10)+1;if(i<urls.length){img.setAttribute("data-idx",String(i));img.src=urls[i]}else img.style.display="none"};
window.openAlert=function(id){
  const feats=alertCache.features||[];
  let a=alertCache[id];
  if(!a){const f=feats.find(x=>x.id===id); a=f&&(f.properties||f)}
  if(!a){openModal("Alert","<span class='err'>Not found</span>");return;}
  let body=`<div style="color:var(--red);font-weight:700;margin-bottom:6px">${esc(a.headline||a.event)}</div>
  <div style="color:var(--text-dim);font-size:11px;margin-bottom:8px">${esc(a.severity||"—")} · ${esc(a.urgency||"—")} · ${esc(a.certainty||"—")}</div>
  <div style="margin-bottom:8px"><b>Area:</b> ${esc(a.areaDesc||"")}</div>
  <div style="background:var(--bg);padding:10px;border:1px solid var(--line);white-space:pre-wrap;font-size:12px;font-family:var(--font-mono)">${esc(a.description||"")}</div>`;
  if(a.instruction)body+=`<div style="margin-top:10px;color:var(--amber);font-weight:600;font-size:11px">ACTIONS</div><div style="background:var(--bg);padding:10px;border:1px solid var(--line);white-space:pre-wrap;font-size:12px;color:var(--cyan);font-family:var(--font-mono)">${esc(a.instruction)}</div>`;
  openModal("NWS Alert",body,a.severity);
};

async function fetchObs(){
  try{
    const headers={Accept:"application/geo+json,application/ld+json","User-Agent":"WeatherXplr/2.0 (github.com/jasonsaro-ops)"};
    const pts=await fetchT(`https://api.weather.gov/points/${LAT},${LON}`,{headers},12000).then(r=>r.json());
    const stUrl=pts.properties&&pts.properties.observationStations;
    if(!stUrl) throw new Error("no stations");
    const st=await fetchT(stUrl,{headers},12000).then(r=>r.json());
    const stations=(st.features||[]).slice(0,8);
    const results=await Promise.all(stations.map(s=>{
      const id=s.properties.stationIdentifier;
      return fetchT(`https://api.weather.gov/stations/${id}/observations/latest`,{headers},10000)
        .then(r=>r.json()).then(obs=>({id,name:s.properties.name,obs})).catch(()=>null);
    }));
    obsCache=results.filter(Boolean);
    const box=$("obs-list");
    if(box){
      box.innerHTML=obsCache.map(o=>{
        const p=o.obs.properties||{};
        const tC=p.temperature&&p.temperature.value;
        const tF=tC!=null?Math.round(tC*9/5+32):"—";
        return `<div class="obs-row"><div><div class="id">${esc(o.id)}</div><div class="nm">${esc(o.name||"")}</div></div><div class="tv">${tF}°</div></div>`;
      }).join("")||'<span class="err">No obs</span>';
    }
    setFeed("nws",true);
  }catch(e){console.warn("obs",e);setFeed("nws",false)}
}
window.openObs=function(id){const p=obsCache[id];if(!p)return;
  const tF=p.temperature&&p.temperature.value!=null?((p.temperature.value*9/5)+32).toFixed(1):"—";
  openModal(`Station ${id}`,`<div class="metric-row"><span class="k">Temp</span><span class="v">${tF}°F</span></div>
  <div class="metric-row"><span class="k">Conditions</span><span class="v">${esc(p.textDescription||"—")}</span></div>
  ${p.rawMessage?`<pre style="margin-top:10px;background:var(--bg);padding:8px;font-size:11px;font-family:var(--font-mono);overflow:auto">${esc(p.rawMessage)}</pre>`:""}`)};

async function fetchAQI(){
  try{
    const data=await fetchT(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide&timezone=America%2FNew_York`,{},12000).then(r=>r.json());
    setFeed("aqi",true);
    const c=data.current||{};
    aqiCache={current:c};
    const aqi=c.us_aqi;
    $("aqi-val").textContent=aqi!=null?aqi:"—";
    let cat="—";
    if(aqi!=null){
      if(aqi<=50)cat="Good"; else if(aqi<=100)cat="Moderate"; else if(aqi<=150)cat="USG"; else if(aqi<=200)cat="Unhealthy"; else cat="Very Unhealthy";
    }
    $("aqi-cat").textContent=cat;
    $("aqi-cat").style.color=aqi!=null&&aqi>100?"var(--red)":aqi>50?"var(--amber)":"var(--green)";
  }catch(e){console.warn("AQI",e);setFeed("aqi",false)}
}
window.openAQI=function(){const c=aqiCache.current;if(!c)return;
  openModal(`Air Quality · US AQI ${c.us_aqi??"—"}`,`<div class="metric-row"><span class="k">US AQI</span><span class="v">${c.us_aqi??"—"}</span></div>
  <div class="metric-row"><span class="k">PM2.5</span><span class="v">${c.pm2_5??"—"}</span></div>
  <div class="metric-row"><span class="k">PM10</span><span class="v">${c.pm10??"—"}</span></div>
  <div class="metric-row"><span class="k">Ozone</span><span class="v">${c.ozone??"—"}</span></div>
  <div class="metric-row"><span class="k">NO₂</span><span class="v">${c.nitrogen_dioxide??"—"}</span></div>`)};

function fetchHydro(){
  setFeed("hydro", true);
  const box = $("hydro-list");
  if (!box) return;
  box.innerHTML = GAUGES.map(g => {
    const short = g.name.replace("Schuylkill @ ", "Sch. ");
    return '<div class="obs-row" data-id="'+g.id+'"><div><div class="id">'+esc(short)+'</div><div class="nm">'+g.id+'</div></div><div class="tv">↗</div></div>';
  }).join("");
  box.querySelectorAll(".obs-row").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      const g = GAUGES.find(x => x.id === id);
      openHydro(id, g ? g.name : id);
    });
  });
}

window.openHydro=function(id,name){openModal(`USGS · ${name}`,`<div style="height:400px"><iframe src="https://dashboard.waterdata.usgs.gov/api/gwis/2.1/service/site?agencyCode=USGS&siteNumber=${id}&open=plots&banner=false&pad=false" style="width:100%;height:100%;border:none;background:#fff;border-radius:4px"></iframe></div>`)};

async function fetchTides(){
  try{
    const station="8545240";
    const [wl,air]=await Promise.all([
      fetchT(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=${station}&product=water_level&datum=MLLW&units=english&time_zone=lst_ldt&format=json`,{},12000).then(r=>r.json()),
      fetchT(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=${station}&product=air_temperature&units=english&time_zone=lst_ldt&format=json`,{},12000).then(r=>r.json()),
    ]);
    setFeed("tides",true);
    const last=wl.data&&wl.data[wl.data.length-1];
    const la=air.data&&air.data[air.data.length-1];
    $("tide-mllw").textContent=last?last.v+" ft":"—";
    $("tide-air").textContent=la?la.v+"°F":"—";
    window.__tide={last,la,wl};
  }catch(e){console.warn("tides",e);setFeed("tides",false)}
}
window.openTides=function(){const t=window.__tide||{};openModal("Tides · 8545240",`<div class="metric-row"><span class="k">MLLW</span><span class="v">${t.last?t.last.v+" ft":"—"}</span></div><div class="metric-row"><span class="k">Air</span><span class="v">${t.la?t.la.v+"°F":"—"}</span></div><div style="margin-top:8px;font-size:11px;color:var(--text-dim)">NOAA CO-OPS · Delaware River</div>`)};

async function fetchKPHL(){
  try{
    const headers={Accept:"application/geo+json,application/ld+json","User-Agent":"WeatherXplr/2.0 (github.com/jasonsaro-ops)"};
    const obs=await fetchT("https://api.weather.gov/stations/KPHL/observations/latest",{headers},12000).then(r=>r.json());
    kphlObs=obs.properties||{};
    const p=kphlObs;
    const tC=p.temperature&&p.temperature.value;
    const tF=tC!=null?Math.round(tC*9/5+32):"—";
    const setHtml=(id,html)=>{const e=$(id); if(e) e.innerHTML=html};
    const setTxt=(id,t)=>{const e=$(id); if(e) e.textContent=t};
    setHtml("kphl-temp", tF+`<span class="card-unit">°F</span>`);
    setHtml("kphl-temp-r", tF+`<span class="card-unit">°F</span>`);
    setTxt("kphl-desc", p.textDescription||"Philadelphia Intl");
    setTxt("kphl-desc-r", p.textDescription||"Philadelphia Intl");
    setTxt("kphl-wx-r", p.textDescription||"—");
    const wC=p.windSpeed&&p.windSpeed.value;
    const wD=p.windDirection&&p.windDirection.value;
    const wMph=wC!=null?Math.round(wC*2.23694):null;
    const gustC=p.windGust&&p.windGust.value;
    const gustMph=gustC!=null?Math.round(gustC*2.23694):null;
    setTxt("kphl-wind", wMph!=null?`${wMph} mph · ${wD??"—"}°`:"—");
    setTxt("kphl-wind-r", wMph!=null?`${wMph} mph`:"—");
    setTxt("kphl-gust", gustMph!=null?gustMph+" mph":"—");
    const vis=p.visibility&&p.visibility.value;
    const visMi=vis!=null?(vis/1609.34).toFixed(1)+" mi":"—";
    setTxt("kphl-vis", visMi);
    setTxt("kphl-vis-r", visMi);
    const dew=p.dewpoint&&p.dewpoint.value;
    setTxt("kphl-dew", dew!=null?Math.round(dew*9/5+32)+"°F":"—");
    const rh=p.relativeHumidity&&p.relativeHumidity.value;
    setTxt("kphl-rh", rh!=null?Math.round(rh)+"%":"—");
    const pr=p.barometricPressure&&p.barometricPressure.value;
    setTxt("kphl-pres", pr!=null?Math.round(pr/100)+" hPa":"—");
    setTxt("kphl-metar", p.rawMessage||"—");
    try{
      const list=await fetchT("https://api.weather.gov/products/types/AFD/locations/PHI",{headers},12000).then(r=>r.json());
      const g=list["@graph"]||[];
      if(g.length){
        const prod=await fetchT(g[0]["@id"]||`https://api.weather.gov/products/${g[0].id}`,{headers},12000).then(r=>r.json());
        afdFull=prod.productText||"";
        if($("phi-afd")) $("phi-afd").textContent=(afdFull||"").slice(0,2500)+(afdFull&&afdFull.length>2500?"…":"");
      }
    }catch(e){}
    fetchPhiAlerts().catch(()=>{});
  }catch(e){console.warn("KPHL",e)}
}
window.openKPHL=function(){const p=kphlObs||{};const tF=p.temperature&&p.temperature.value!=null?((p.temperature.value*9/5)+32).toFixed(1):"—";
  openModal("KPHL · Philadelphia Intl",`<div style="font-size:28px;font-weight:700;font-family:var(--font-mono);margin-bottom:4px">${tF}°F</div>
  <div style="color:var(--text-mid);margin-bottom:10px">${esc(p.textDescription||"—")}</div>
  ${p.rawMessage?`<pre style="background:var(--bg);padding:8px;font-size:11px;font-family:var(--font-mono);overflow:auto">${esc(p.rawMessage)}</pre>`:""}
  <button class="btn" style="width:100%" onclick="openAFD()">PHI Area Forecast Discussion</button>`)};
window.openAFD=function(){if(!afdFull){openModal("PHI AFD",`<span class="err">Not loaded yet</span>`);return}openModal("PHI AFD",`<pre style="white-space:pre-wrap;font-size:12px;font-family:var(--font-mono)">${esc(afdFull)}</pre>`)};

;

window.openAlertsConsole=async function(){
  openModal("Alerts · SE-PA / 19428", `<div id="alerts-console"><span class="err" style="color:var(--text-dim)">Loading…</span></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:12px">
      <button class="btn" onclick="window.open('https://www.spc.noaa.gov/products/outlook/','_blank')">SPC Day 1–3 ↗</button>
      <button class="btn" onclick="window.open('https://www.weather.gov/phi/','_blank')">NWS PHI ↗</button>
      <button class="btn" onclick="window.open('https://alerts.weather.gov/','_blank')">NWS CAP feed ↗</button>
      <button class="btn" onclick="fetchAlerts().then(()=>openAlertsConsole())">Refresh list</button>
    </div>`);
  try{
    const headers={Accept:"application/geo+json","User-Agent":"WeatherXplr/2.0"};
    const [pt, pa] = await Promise.all([
      fetchT(`https://api.weather.gov/alerts/active?point=${sampleLat},${sampleLon}`,{headers},12000).then(r=>r.json()).catch(()=>({features:[]})),
      fetchT("https://api.weather.gov/alerts/active?area=PA",{headers},12000).then(r=>r.json()).catch(()=>({features:[]})),
    ]);
    const seen=new Set();
    const merge=[];
    for(const f of (pt.features||[])){
      const id=f.id; if(id&&seen.has(id)) continue; if(id) seen.add(id); merge.push(f);
    }
    for(const f of (pa.features||[])){
      if(!isSePaAlert(f)) continue;
      const id=f.id; if(id&&seen.has(id)) continue; if(id) seen.add(id); merge.push(f);
    }
    const sevOrder={Extreme:0,Severe:1,Moderate:2,Minor:3,Unknown:4};
    merge.sort((a,b)=>(sevOrder[(a.properties||{}).severity]??5)-(sevOrder[(b.properties||{}).severity]??5));
    const box=$("alerts-console");
    if(!box) return;
    if(!merge.length){
      box.innerHTML=`<div style="color:var(--text-dim)">No active SE-PA / 19428 alerts.</div>`;
      return;
    }
    box.innerHTML=`<div style="font-size:11px;color:var(--text-dim);margin-bottom:8px">${merge.length} active · 19428 point + SE-PA</div>`+
      merge.slice(0,60).map(f=>{
        const p=f.properties||{};
        return `<div class="alert-item ${sevClass(p.severity)}" style="margin-bottom:6px">
          <div class="ev">${esc(p.event||"Alert")} · ${esc(p.severity||"")}</div>
          <div class="hd">${esc(p.headline||p.areaDesc||"")}</div>
        </div>`;
      }).join("");
  }catch(e){
    const box=$("alerts-console");
    if(box) box.innerHTML=`<span class="err">${esc(String(e.message||e))}</span>`;
  }
};


window.focusMapView=function(){
  closeModal();
  document.querySelectorAll(".nav-tab").forEach(x=>x.classList.remove("on"));
  document.querySelector('.nav-tab[data-view="map"]')?.classList.add("on");
  document.querySelector('.seg button[data-pane="cond"]')?.click();
  try{
    if(wxMap){
      wxMap.invalidateSize(true);
      wxMap.setView([sampleLat, sampleLon], mapZoom||wxMap.getZoom()||8, {animate:true});
    }
  }catch(e){}
  const frame=$("wx-map");
  if(frame){
    frame.style.outline="2px solid var(--cyan)";
    setTimeout(()=>{ frame.style.outline=""; }, 900);
  }
};

/* ========== Visual Crossing via Cloudflare Worker (API key is a CF secret) ========== */
let vcCurrent = null;
let vcHistory = null;

async function refreshAll(){
  await Promise.allSettled([
    fetchOpenMeteo().catch(e=>console.warn(e)),
    fetchPointConditions().catch(e=>console.warn(e)),
    fetchAlerts().catch(e=>console.warn(e)),
    fetchAQI().catch(e=>console.warn(e)),
    fetchTides().catch(e=>console.warn(e)),
  ]);
  try{ fetchHydro(); }catch(e){}
  if($("chip-sync")) $("chip-sync").textContent="SYNC "+new Date().toLocaleTimeString("en-US",{hour12:false,timeZone:"America/New_York"});
}


/* ========== Leaflet + Mesonet NEXRAD (clickable) ========== */

/* ========== Radar loop (Mesonet frames) ========== */
const RADAR_FRAMES = ["m50m","m45m","m40m","m35m","m30m","m25m","m20m","m15m","m10m","m05m",""];
let radarFrameIdx = RADAR_FRAMES.length - 1;
let radarPlaying = false;
let radarTimer = null;

function radarUrl(product, frame){
  // product: radar | velocity
  if(product === "velocity"){
    return `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0v${frame ? "-" + frame : ""}-900913/{z}/{x}/{y}.png`;
  }
  return `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q${frame ? "-" + frame : ""}-900913/{z}/{x}/{y}.png`;
}

function setRadarFrame(idx){
  if(!wxMap) return;
  radarFrameIdx = Math.max(0, Math.min(RADAR_FRAMES.length - 1, idx));
  const frame = RADAR_FRAMES[radarFrameIdx];
  const src = activeRadarSource === "eet" ? "eet" : (activeRadarSource === "mrms" ? "mrms" : "radar");
  let url;
  if(src === "eet"){
    url = `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-eet${frame?"-"+frame:""}-900913/{z}/{x}/{y}.png`;
  } else if(src === "mrms"){
    // HSR live only (no simple mXXm path for all products)
    url = `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/q2-hsr-900913/{z}/{x}/{y}.png?t=${Date.now()}`;
  } else {
    url = radarUrl("radar", frame);
  }
  if(wxLayers[src] && wxMap.hasLayer(wxLayers[src])) wxMap.removeLayer(wxLayers[src]);
  wxLayers[src] = L.tileLayer(url, { opacity: 0.72, maxZoom: 12, maxNativeZoom: 10, attribution: "IEM OGC" });
  if(activeRadarSource === src || activeRadarSource === "radar") wxLayers[src].addTo(wxMap);
  const lab=$("radar-age");
  if(lab) lab.textContent = frame ? frame.replace("m","")+" ago" : "LIVE";
}

const RADAR_TILES = {
  radar: "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png",
  eet: "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-eet-900913/{z}/{x}/{y}.png",
  mrms: "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/q2-hsr-900913/{z}/{x}/{y}.png",
  velocity: "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0v-900913/{z}/{x}/{y}.png",
  satellite: "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/goes-ir-4km-900913/{z}/{x}/{y}.png",
  qpe: "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/q2-n1p-900913/{z}/{x}/{y}.png",
};

/* ========== RainViewer global radar ========== */
let rvHost = "https://tilecache.rainviewer.com";
let rvFrames = []; // {time, path}
let rvFrameIdx = 0;
let rvLayer = null;
let rvPlaying = false;
let rvTimer = null;
let activeRadarSource = "radar"; // radar | global | eet | mrms

async function loadRainViewerFrames(){
  try{
    const j = await fetchT("https://api.rainviewer.com/public/weather-maps.json", {}, 12000).then(r=>r.json());
    if(j.host) rvHost = j.host;
    const past = (j.radar && j.radar.past) || [];
    rvFrames = past.map(f => ({ time: f.time, path: f.path }));
    if(!rvFrames.length) throw new Error("no RV frames");
    rvFrameIdx = rvFrames.length - 1;
    return true;
  }catch(e){
    console.warn("RainViewer", e);
    rvFrames = [];
    return false;
  }
}

function rvTileUrl(frame){
  // size 256, color 2 (Universal Blue / common), options 1_1 smooth+snow
  // Free tier max zoom ~7 as of 2026
  const path = frame.path;
  return `${rvHost}${path}/256/{z}/{x}/{y}/2/1_1.png`;
}

function setRainViewerFrame(idx){
  if(!rvFrames.length || !wxMap) return;
  rvFrameIdx = Math.max(0, Math.min(rvFrames.length - 1, idx));
  const frame = rvFrames[rvFrameIdx];
  const url = rvTileUrl(frame);
  const wasOn = rvLayer && wxMap.hasLayer(rvLayer);
  if(rvLayer && wxMap.hasLayer(rvLayer)) wxMap.removeLayer(rvLayer);
  rvLayer = L.tileLayer(url, {
    opacity: 0.75,
    maxZoom: 12,
    maxNativeZoom: 7,
    attribution: "RainViewer"
  });
  if(activeRadarSource === "global" || wasOn) rvLayer.addTo(wxMap);
  wxLayers.global = rvLayer;
  const lab = $("radar-age");
  if(lab){
    const ageMin = Math.max(0, Math.round((Date.now()/1000 - frame.time)/60));
    lab.textContent = ageMin <= 1 ? "LIVE" : (ageMin + "m ago");
  }
}

function showRadarSource(src){
  activeRadarSource = src;
  if(rvLayer && wxMap.hasLayer(rvLayer)) wxMap.removeLayer(rvLayer);
  ["radar","eet","mrms"].forEach(k=>{
    if(wxLayers[k] && wxMap.hasLayer(wxLayers[k])) wxMap.removeLayer(wxLayers[k]);
  });
  if(src === "global"){
    if(rvFrames.length) setRainViewerFrame(rvFrames.length - 1);
    else loadRainViewerFrames().then(ok => { if(ok) setRainViewerFrame(rvFrames.length-1); });
  } else if(wxLayers[src]){
    wxLayers[src].addTo(wxMap);
  }
  const exclusive = ["global","radar","eet","mrms"];
  document.querySelectorAll(".model-chip[data-layer]").forEach(c=>{
    if(exclusive.includes(c.dataset.layer)) c.classList.toggle("on", c.dataset.layer === src);
  });
}

function playRadar(on){
  // unified play: prefers active source
  radarPlaying = !!on;
  rvPlaying = !!on;
  const btn = $("btn-radar-play");
  if(btn){
    btn.classList.toggle("on", radarPlaying);
    btn.innerHTML = radarPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
  }
  if(radarTimer){ clearInterval(radarTimer); radarTimer = null; }
  if(rvTimer){ clearInterval(rvTimer); rvTimer = null; }
  if(!radarPlaying) return;
  if(activeRadarSource === "global"){
    rvTimer = setInterval(()=>{
      let n = rvFrameIdx + 1;
      if(n >= rvFrames.length) n = 0;
      setRainViewerFrame(n);
    }, 700);
  } else {
    radarTimer = setInterval(()=>{
      let n = radarFrameIdx + 1;
      if(n >= RADAR_FRAMES.length) n = 0;
      setRadarFrame(n);
    }, 700);
  }
}

function refreshRadarTiles(){
  if(activeRadarSource === "global"){
    loadRainViewerFrames().then(ok=>{
      if(ok && !radarPlaying) setRainViewerFrame(rvFrames.length-1);
    });
    return;
  }
  const bust = Date.now();
  if(!wxMap || !wxLayers.radar) return;
  if(radarPlaying) return;
  const wasOn = wxMap.hasLayer(wxLayers.radar);
  if(wasOn) wxMap.removeLayer(wxLayers.radar);
  wxLayers.radar = L.tileLayer(
    `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png?t=${bust}`,
    { opacity: 0.7, maxZoom: 12, maxNativeZoom: 10, attribution: "NEXRAD" }
  );
  if(wasOn) wxLayers.radar.addTo(wxMap);
  radarFrameIdx = RADAR_FRAMES.length - 1;
  const lab=$("radar-age"); if(lab) lab.textContent="LIVE";
}

let wxMap = null;
let wxLayers = {};
let sampleMarker = null;

function initWxMap(){
  if(typeof L === "undefined"){ console.error("Leaflet missing"); return; }
  const el = $("wx-map");
  if(!el){ console.error("#wx-map missing"); return; }
  if(wxMap){ wxMap.invalidateSize(true); return; }
  wxMap = L.map(el, {
    center: [sampleLat, sampleLon],
    zoom: mapZoom || 8,
    minZoom: 4,
    maxZoom: 12,
    zoomControl: false,
    preferCanvas: true,
  });
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 16, maxNativeZoom: 16, attribution: "Esri · NWS · Iowa State Mesonet" }
  ).addTo(wxMap);
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 16, maxNativeZoom: 16, opacity: 0.85 }
  ).addTo(wxMap);

  const iem = "IEM OGC · mesonet.agron.iastate.edu";
  wxLayers.radar = L.tileLayer(RADAR_TILES.radar, { opacity: 0.72, maxZoom: 12, maxNativeZoom: 10, attribution: iem+" · n0q" });
  wxLayers.eet = L.tileLayer(RADAR_TILES.eet, { opacity: 0.7, maxZoom: 12, maxNativeZoom: 10, attribution: iem+" · EET" });
  wxLayers.mrms = L.tileLayer(RADAR_TILES.mrms, { opacity: 0.7, maxZoom: 12, maxNativeZoom: 10, attribution: iem+" · MRMS HSR" });
  wxLayers.velocity = L.tileLayer(RADAR_TILES.velocity, { opacity: 0.55, maxZoom: 12, maxNativeZoom: 10, attribution: iem+" · vel" });
  wxLayers.satellite = L.tileLayer(RADAR_TILES.satellite, { opacity: 0.5, maxZoom: 12, maxNativeZoom: 10, attribution: iem+" · GOES" });
  wxLayers.qpe = L.tileLayer(RADAR_TILES.qpe, { opacity: 0.55, maxZoom: 12, maxNativeZoom: 10, attribution: iem+" · QPE" });
  // Default map radar: US NEXRAD (IEM TMS)
  activeRadarSource = "radar";
  wxLayers.radar.addTo(wxMap);
  L.control.zoom({ position: "bottomleft" }).addTo(wxMap);

  sampleMarker = L.circleMarker([sampleLat, sampleLon], {
    radius: 7, color: "#fff", weight: 2, fillColor: "#3b9eff", fillOpacity: 0.95
  }).addTo(wxMap);
  sampleMarker.bindTooltip("Sample point", { permanent: false });

  wxMap.on("click", (e) => {
    setSample(e.latlng.lat, e.latlng.lng, null);
  });
  wxMap.on("moveend", () => { mapZoom = wxMap.getZoom(); });

  document.querySelectorAll(".model-chip[data-layer]").forEach(chip => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.layer;
      if(["global","radar","eet","mrms"].includes(key)){
        showRadarSource(key);
        return;
      }
      document.querySelectorAll(".model-chip[data-layer]").forEach(c=>{
        if(c.dataset.layer!=="global" && c.dataset.layer!=="radar") c.classList.remove("on");
      });
      chip.classList.add("on");
      ["velocity","satellite","qpe"].forEach(k=>{
        if(wxLayers[k] && wxMap.hasLayer(wxLayers[k])) wxMap.removeLayer(wxLayers[k]);
      });
      if(wxLayers[key]) wxLayers[key].addTo(wxMap);
    });
  });
  const bindLy = (id, key) => {
    $(id)?.addEventListener("change", (e) => {
      if(!wxLayers[key]) return;
      if(e.target.checked) wxLayers[key].addTo(wxMap);
      else if(wxMap.hasLayer(wxLayers[key])) wxMap.removeLayer(wxLayers[key]);
    });
  };
  bindLy("ly-radar", "radar");
  bindLy("ly-velocity", "velocity");
  bindLy("ly-sat", "satellite");
  bindLy("ly-qpe", "qpe");

  $("btn-layers")?.addEventListener("click", () => {
    $("layer-pop")?.classList.toggle("open");
    $("btn-layers")?.classList.toggle("on");
  });
  $("btn-home")?.addEventListener("click", () => {
    setSample(40.0759, -75.2996, "sepa");
    if(wxMap) wxMap.setView([40.0759, -75.2996], 8, {animate:true});
  });

  setTimeout(() => wxMap.invalidateSize(true), 250);
  window.addEventListener("resize", () => wxMap && wxMap.invalidateSize(true));
  document.addEventListener("fullscreenchange", () => setTimeout(() => wxMap && wxMap.invalidateSize(true), 150));
}

function setLayer(layer){
  if(!wxMap) return;
  wxMap.setView([sampleLat, sampleLon], mapZoom || 8, { animate: true });
  if(sampleMarker) sampleMarker.setLatLng([sampleLat, sampleLon]);
}

function initRadarAnimControls(){
  setInterval(refreshRadarTiles, 120000);
  $("btn-radar-play")?.addEventListener("click", ()=> playRadar(!radarPlaying));
  $("btn-radar-live")?.addEventListener("click", ()=>{
    playRadar(false);
    if(activeRadarSource==="global"){
      loadRainViewerFrames().then(ok=>{ if(ok) setRainViewerFrame(rvFrames.length-1); });
    } else {
      setRadarFrame(RADAR_FRAMES.length - 1);
    }
  });
}

function focusMapView(){ /* NEXRAD map removed */ }

function initRadar(){
  // Leaflet NEXRAD map removed — dual Windy is the primary display
  initWindyDual();
  $("chip-alerts")?.addEventListener("click", ()=>{
    const list=$("alerts-list");
    if(list) list.scrollIntoView({behavior:"smooth",block:"nearest"});
  });
}

function initWindyDual(){
  if(window.__windyInited) return;
  window.__windyInited = true;
  function setLayer(iframeId, layer){
    const product = (layer === "radar" || layer === "satellite") ? layer : "gfs";
    const el = $(iframeId);
    if(el) el.src = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=in&metricTemp=f&metricWind=mph&zoom=8&overlay=${layer}&product=${product}&level=surface&lat=${sampleLat}&lon=${sampleLon}`;
  }
  const s1 = $("windy-layer-1"), s2 = $("windy-layer-2");
  if(s1) s1.onchange = () => setLayer("windy-iframe-1", s1.value);
  if(s2) s2.onchange = () => setLayer("windy-iframe-2", s2.value);
}

function initBrandHome(){
  $("brand-home")?.addEventListener("click", ()=>{
    setSample(40.0759, -75.2996, "z19428");
    recenterWindy();
    refreshAll().catch(()=>{});
  });
}
function recenterWindy(){
  const LAT=40.0759, LON=-75.2996;
  function setSrc(iframeId, layer, product){
    const el=$(iframeId);
    if(!el) return;
    el.src=`https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=in&metricTemp=f&metricWind=mph&zoom=8&overlay=${layer}&product=${product}&level=surface&lat=${LAT}&lon=${LON}`;
  }
  const s1=$("windy-layer-1"), s2=$("windy-layer-2");
  const l1=s1?s1.value:"radar";
  const l2=s2?s2.value:"clouds";
  setSrc("windy-iframe-1", l1, (l1==="radar"||l1==="satellite")?l1:"gfs");
  setSrc("windy-iframe-2", l2, (l2==="radar"||l2==="satellite")?l2:"gfs");
}

async function boot(){
  const bar=$("boot-prog"),st=$("boot-st");
  const steps=[[15,"CONNECTING NWS…"],[35,"OPEN-METEO · HRRR…"],[55,"ALERTS · SPC…"],[75,"OBS · AQ · TIDES…"],[90,"RADAR ARRAY…"],[100,"DISPATCH ONLINE"]];
  let i=0;const t=setInterval(()=>{if(i<steps.length){bar.style.width=steps[i][0]+"%";st.textContent=steps[i][1];i++}},280);
  const dismiss=()=>{
    clearInterval(t);
    if(bar) bar.style.width="100%";
    if(st) st.textContent="ONLINE";
    $("boot")?.classList.add("out");
    $("app")?.classList.add("on");
    setTimeout(()=>$("boot")?.remove(),600);
  };
  try{
    initRadar();
  }catch(e){ console.error("initRadar", e); }
  try{ initAudio(); }catch(e){}
  try{ if(typeof tickClock==='function'){ tickClock(); setInterval(tickClock,1000);} }catch(e){console.warn(e);}
  try{
    await Promise.race([
      refreshAll(),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error("boot timeout")), 15000))
    ]);
  }catch(e){ console.warn("refreshAll boot", e); }
  finally{
    dismiss();
  }
  try{ initBrandHome(); }catch(e){}
  setInterval(()=>{cd--;if(cd<=0){cd=CYCLE;refreshAll().catch(()=>{})} if($("cd")) $("cd").textContent=cd},1000);
  // Leaflet needs size after app visible
  setTimeout(()=>{ try{ wxMap && wxMap.invalidateSize(true); }catch(e){} }, 700);
}
document.addEventListener("DOMContentLoaded", () => {
  boot().catch(e => {
    console.error("boot failed", e);
    try{
      $("boot")?.classList.add("out");
      $("app")?.classList.add("on");
      setTimeout(()=>$("boot")?.remove(),600);
    }catch(_){}
  });
});

function setSample(lat, lon, presetKey){
  sampleLat = +lat; sampleLon = +lon;
  if($("pt-coords")) $("pt-coords").textContent = sampleLat.toFixed(3)+"°, "+sampleLon.toFixed(3)+"°";
  fetchPointConditions().catch(()=>{});
  fetchPointAlerts().catch(()=>{});
  fetchOpenMeteo().catch(()=>{});
  fetchAQI().catch(()=>{});
  fetchHydro();
  fetchTides().catch(()=>{});
}

