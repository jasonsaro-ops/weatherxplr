// js/map.js

export const mapEngine = {
    initWindy: (iframeId, lat, lon) => {
        return `https://embed.windy.com/embed.html?type=map&location=coordinates&lat=${lat}&lon=${lon}&zoom=8&overlay=radar`;
    },
    
    switchLayer: (iframeId, layerType) => {
        // Functionality to update iframe src dynamically[cite: 2]
    }
};