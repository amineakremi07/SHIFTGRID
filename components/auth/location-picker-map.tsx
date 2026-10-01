'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

export interface MarkerPosition {
  latitude: number
  longitude: number
}

interface MapProps {
  latitude: number
  longitude: number
  onPositionChange: (pos: MarkerPosition) => void
}

/** Click-to-place and re-centre. Defined at module level: a component created
 *  inside another's render is a new component type on every render. */
function MapEvents({ latitude, longitude, onPositionChange }: MapProps) {
  const map = useMapEvents({
    click(e) {
      onPositionChange({ latitude: e.latlng.lat, longitude: e.latlng.lng })
    },
  })

  useEffect(() => {
    map.setView([latitude, longitude], 15)
  }, [latitude, longitude, map])

  return null
}

export const LocationPickerMap = ({ latitude, longitude, onPositionChange }: MapProps) => {
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={13}
      style={{ height: '400px', width: '100%', borderRadius: '0.5rem' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[latitude, longitude]} />
      <MapEvents latitude={latitude} longitude={longitude} onPositionChange={onPositionChange} />
    </MapContainer>
  )
}

export default LocationPickerMap
