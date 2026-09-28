'use client'

import { useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

export interface MarkerPosition {
  latitude: number
  longitude: number
}

export const LocationPickerMap = ({ latitude, longitude, onPositionChange }: {
  latitude: number
  longitude: number
  onPositionChange: (pos: MarkerPosition) => void
}) => {
  const mapRef = useRef<any>(null)

  const MapEvents = () => {
    const map = useMapEvents({
      click(e) {
        onPositionChange({ latitude: e.latlng.lat, longitude: e.latlng.lng })
      },
    })

    useEffect(() => {
      if (mapRef.current && map) {
        map.setView([latitude, longitude], 15)
      }
    }, [latitude, longitude, map])

    return null
  }

  return (
    <MapContainer
      ref={mapRef}
      center={[latitude, longitude]}
      zoom={13}
      style={{ height: '400px', width: '100%', borderRadius: '0.5rem' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[latitude, longitude]} />
      <MapEvents />
    </MapContainer>
  )
}

export default LocationPickerMap
