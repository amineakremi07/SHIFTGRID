import L from 'leaflet'

/**
 * The map pin, drawn inline. Leaflet's default marker looks for PNG files by URL, which
 * bundlers break (a missing-image box), and our CSP only allows our own images and the
 * OpenStreetMap tiles anyway. Import this only from components loaded with ssr: false
 * (Leaflet touches `window` at import time).
 */
export const pinIcon = L.divIcon({
  className: '', // drop Leaflet's default white square
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44" aria-hidden="true">
<path d="M17 43C17 43 32 27.5 32 16.5C32 8 25.3 1.5 17 1.5C8.7 1.5 2 8 2 16.5C2 27.5 17 43 17 43Z" fill="#0e634f" stroke="#f7f5f2" stroke-width="2.5"/>
<circle cx="17" cy="16.5" r="6" fill="#f7f5f2"/></svg>`,
  iconSize: [34, 44],
  iconAnchor: [17, 43],
  popupAnchor: [0, -38],
})
