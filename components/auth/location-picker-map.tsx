'use client'

import { useEffect } from 'react'
import type { Marker as LeafletMarker } from 'leaflet'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import { pinIcon } from '@/components/map/pin-icon'

export interface MarkerPosition {
  latitude: number
  longitude: number
}

interface MapProps {
  latitude: number
  longitude: number
  onPositionChange: (pos: MarkerPosition) => void
  /** Let the pin be dragged as well as placed by a click. */
  draggable?: boolean
  /** Hide the pin until a position has really been chosen (the map still opens at latitude/longitude). */
  showMarker?: boolean
  height?: string
  /** Opening zoom (the map zooms in to 15 whenever the position changes). */
  zoom?: number
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
    map.setView([latitude, longitude], Math.max(map.getZoom(), 15))
  }, [latitude, longitude, map])

  return null
}

export const LocationPickerMap = ({
  latitude,
  longitude,
  onPositionChange,
  draggable = false,
  showMarker = true,
  height = '400px',
  zoom = 13,
}: MapProps) => {
  return (
    <MapContainer center={[latitude, longitude]} zoom={zoom} style={{ height, width: '100%', borderRadius: '0.5rem', position: 'relative', zIndex: 0 }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {showMarker && (
        <Marker
          position={[latitude, longitude]}
          icon={pinIcon}
          draggable={draggable}
          eventHandlers={{
            dragend(e) {
              const { lat, lng } = (e.target as LeafletMarker).getLatLng()
              onPositionChange({ latitude: lat, longitude: lng })
            },
          }}
        />
      )}
      <MapEvents latitude={latitude} longitude={longitude} onPositionChange={onPositionChange} />
    </MapContainer>
  )
}

export default LocationPickerMap
