'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Loader2, MapPin, Search, X } from 'lucide-react'
import { toast } from 'sonner'

import type { MarkerPosition } from '@/components/auth/location-picker-map'
import { GalleryManager } from '@/components/dashboard/gallery-manager'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { saveClubProfile } from '@/lib/actions/club-profile'
import { geocodeAddress } from '@/lib/actions/owner-signup'
import { BIO_MAX, clubProfileSchema, DEFAULT_MAP_CENTER } from '@/lib/club-profile'

// Leaflet needs `window`: the picker is loaded in the browser only.
const LocationPickerMap = dynamic(() => import('@/components/auth/location-picker-map').then((m) => m.LocationPickerMap), {
  ssr: false,
  loading: () => <Skeleton className="h-[360px] w-full" />,
})

export type ClubProfileInitial = {
  name: string
  description: string | null
  address: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  galleryUrls: string[]
}

type Errors = Partial<Record<'name' | 'description' | 'address' | 'city' | 'location', string>>

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-4 rounded-xl bg-[#eae6df] p-5 sm:p-6">
      <div>
        <h3 id={`${id}-heading`} className="text-lg font-semibold">
          {title}
        </h3>
        {hint && <p className="text-sm text-[#645757]">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

/**
 * "Club profile / vitrine": what players see on the public club page. Name, bio, address
 * and the map pin are saved together; the photo gallery saves itself (see GalleryManager).
 */
export function ClubProfileForm({ initial }: { initial: ClubProfileInitial }) {
  const router = useRouter()
  const [name, setName] = React.useState(initial.name)
  const [description, setDescription] = React.useState(initial.description ?? '')
  const [address, setAddress] = React.useState(initial.address ?? '')
  const [city, setCity] = React.useState(initial.city ?? '')
  const [pin, setPin] = React.useState<MarkerPosition | null>(
    initial.latitude !== null && initial.longitude !== null ? { latitude: initial.latitude, longitude: initial.longitude } : null
  )
  const [query, setQuery] = React.useState([initial.address, initial.city].filter(Boolean).join(', '))
  const [searching, setSearching] = React.useState(false)
  const [searchNote, setSearchNote] = React.useState('')
  const [errors, setErrors] = React.useState<Errors>({})
  const [saving, setSaving] = React.useState(false)

  const center = pin ?? DEFAULT_MAP_CENTER

  const search = async () => {
    const text = (query.trim() || [address, city].filter(Boolean).join(', ')).trim()
    if (text.length < 3) {
      setSearchNote('Type an address or the name of a place.')
      return
    }
    setSearching(true)
    setSearchNote('')
    const hit = await geocodeAddress(text.toLowerCase().includes('tunisia') ? text : `${text}, Tunisia`)
    setSearching(false)
    if (!hit) {
      setSearchNote('Nothing found in Tunisia for that search. Try a nearby street, or click the map to place the pin.')
      return
    }
    setPin({ latitude: hit.latitude, longitude: hit.longitude })
    setErrors((e) => ({ ...e, location: undefined }))
    setSearchNote(`Found: ${hit.displayName}. Drag the pin to fine-tune it.`)
    if (!address.trim()) setAddress(hit.displayName.split(',').slice(0, 3).join(',').trim())
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      name,
      description,
      address,
      city,
      latitude: pin ? Number(pin.latitude.toFixed(6)) : null,
      longitude: pin ? Number(pin.longitude.toFixed(6)) : null,
    }
    // The same rules as the server, so the messages match.
    const checked = clubProfileSchema.safeParse(payload)
    if (!checked.success) {
      const f = checked.error.flatten().fieldErrors
      setErrors({
        name: f.name?.[0],
        description: f.description?.[0],
        address: f.address?.[0],
        city: f.city?.[0],
        location: f.latitude?.[0] ?? f.longitude?.[0],
      })
      return
    }
    setErrors({})
    setSaving(true)
    const result = await saveClubProfile(payload)
    setSaving(false)
    if (!result.ok) {
      if (result.fieldErrors) {
        setErrors({
          name: result.fieldErrors.name,
          description: result.fieldErrors.description,
          address: result.fieldErrors.address,
          city: result.fieldErrors.city,
          location: result.fieldErrors.latitude ?? result.fieldErrors.longitude,
        })
      }
      return void toast.error(result.message)
    }
    toast.success('Club profile saved')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Club profile</h2>
        <p className="text-sm text-[#645757]">Your public page (&quot;vitrine&quot;): what players see before they book.</p>
      </div>

      <form onSubmit={submit} className="space-y-6" noValidate>
        <Section id="about" title="About your club">
          <div className="grid gap-1.5">
            <Label htmlFor="cp-name">Club name</Label>
            <Input id="cp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} error={Boolean(errors.name)} autoComplete="off" />
            {errors.name && <p role="alert" className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cp-bio">Bio / description</Label>
            <Textarea
              id="cp-bio"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={BIO_MAX}
              placeholder="Tell players what makes your club special: courts, facilities, parking, café, coaching…"
            />
            <div className="flex justify-between text-xs text-[#645757]">
              <span>{errors.description ? <span role="alert" className="text-destructive">{errors.description}</span> : 'Shown on your public page.'}</span>
              <span className="tabular-nums">
                {description.length} / {BIO_MAX}
              </span>
            </div>
          </div>
        </Section>

        <Section id="location" title="Location" hint="Players use this to find you. Search for your address, then drag the pin onto your entrance.">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="cp-address">Physical address</Label>
              <Input id="cp-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} error={Boolean(errors.address)} placeholder="12 Avenue Habib Bourguiba" autoComplete="off" />
              {errors.address && <p role="alert" className="text-xs text-destructive">{errors.address}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cp-city">City</Label>
              <Input id="cp-city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} error={Boolean(errors.city)} placeholder="Tunis" autoComplete="off" />
              {errors.city && <p role="alert" className="text-xs text-destructive">{errors.city}</p>}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cp-search">Search the map</Label>
            <div className="flex gap-2">
              <Input
                id="cp-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void search()
                  }
                }}
                placeholder="Address or place, e.g. Lac 2, Tunis"
                autoComplete="off"
              />
              <Button type="button" variant="outline" onClick={() => void search()} disabled={searching}>
                {searching ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />} Search
              </Button>
            </div>
            {searchNote && (
              <p className="text-xs text-[#645757]" role="status" data-testid="map-search-note">
                {searchNote}
              </p>
            )}
          </div>

          <div className="overflow-hidden rounded-lg" data-testid="map-picker">
            <LocationPickerMap
              latitude={center.latitude}
              longitude={center.longitude}
              onPositionChange={(p) => {
                setPin(p)
                setErrors((e) => ({ ...e, location: undefined }))
              }}
              draggable
              showMarker={pin !== null}
              height="360px"
              zoom={pin ? 16 : 7}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="inline-flex items-center gap-1.5 text-[#645757]" data-testid="pin-status">
              <MapPin className="size-4" aria-hidden />
              {pin ? (
                <span className="tabular-nums">
                  {pin.latitude.toFixed(6)}, {pin.longitude.toFixed(6)}
                </span>
              ) : (
                'No pin yet: search, or click the map to place it.'
              )}
            </p>
            {pin && (
              <Button type="button" variant="outline" size="sm" onClick={() => setPin(null)}>
                <X aria-hidden /> Remove pin
              </Button>
            )}
          </div>
          {errors.location && <p role="alert" className="text-xs text-destructive">{errors.location}</p>}
        </Section>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving} className="bg-[#1d3023] text-[#f7f5f2] hover:bg-[#1d3023]/90">
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            Save profile
          </Button>
        </div>
      </form>

      <Section id="photos" title="Photo gallery" hint="Photos save as soon as you add, reorder or delete them.">
        <GalleryManager initialUrls={initial.galleryUrls} />
      </Section>
    </div>
  )
}
