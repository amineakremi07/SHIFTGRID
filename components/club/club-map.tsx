'use client'

import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import { pinIcon } from '@/components/map/pin-icon'

/** Read-only map with the club's exact pin. Loaded with ssr: false by ClubLocation. */
export default function ClubMap({ latitude, longitude, name }: { latitude: number; longitude: number; name: string }) {
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={16}
      // The page scrolls past this map: the wheel must not zoom it by accident.
      scrollWheelZoom={false}
      // zIndex 0 makes the map its own stacking context: Leaflet's internal z-indexes (up to 1000) stay inside it.
      style={{ height: '100%', width: '100%', position: 'relative', zIndex: 0 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[latitude, longitude]} icon={pinIcon} title={name}>
        <Popup>{name}</Popup>
      </Marker>
    </MapContainer>
  )
}
