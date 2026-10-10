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
import { reverseGeocodeAction } from '@/lib/actions/reverse-geocode'
import { BIO_MAX, clubProfileSchema, DEFAULT_MAP_CENTER } from '@/lib/club-profile'

// Leaflet needs `window`: the picker is loaded in the browser only.
const LocationPickerMap = dynamic(() => import('@/components/auth/location-picker-map').then((m) => m.LocationPickerMap), {
  ssr: false,
  loading: () => <Skeleton className="h-[360px] w-full" />,
})

export type ClubProfileInitial = {
  name: string
  description: string | null
  whatsappNumber: string | null
  address: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  galleryUrls: string[]
}

type Errors = Partial<Record<'name' | 'description' | 'whatsappNumber' | 'address' | 'city' | 'location', string>>

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
  const [whatsappNumber, setWhatsappNumber] = React.useState(initial.whatsappNumber ?? '')
  const [address, setAddress] = React.useState(initial.address ?? '')
  const [city, setCity] = React.useState(initial.city ?? '')
  const [pin, setPin] = React.useState<MarkerPosition | null>(
    initial.latitude !== null && initial.longitude !== null ? { latitude: initial.latitude, longitude: initial.longitude } : null
  )
  const [query, setQuery] = React.useState([initial.address, initial.city].filter(Boolean).join(', '))
  const [searching, setSearching] = React.useState(false)
  // Reverse geocoding: the address under the pin fills the address field when the pin is clicked or dragged.
  const [lookingUp, setLookingUp] = React.useState(false)
  const [addressNote, setAddressNote] = React.useState('')
  const lookupId = React.useRef(0)
  const typedWhileLookingUp = React.useRef(false)
  const [searchNote, setSearchNote] = React.useState('')
  const [errors, setErrors] = React.useState<Errors>({})
  const [saving, setSaving] = React.useState(false)

  const center = pin ?? DEFAULT_MAP_CENTER

  /**
   * The owner moved the pin by hand: ask OpenStreetMap what is there and fill the address (and city).
   * A newer move supersedes an older lookup, and anything the owner typed while it ran is never
   * overwritten. If the lookup fails the fields stay as they were and the pin still saves.
   */
  const fillAddressFromPin = async (p: MarkerPosition) => {
    const id = ++lookupId.current
    typedWhileLookingUp.current = false
    setLookingUp(true)
    setAddressNote('')
    const result = await reverseGeocodeAction(p.latitude, p.longitude)
    if (id !== lookupId.current) return // a later pin move owns the field now
    setLookingUp(false)
    if (!result.ok) {
      setAddressNote(`${result.message} Saisissez l\'adresse vous-même : le repère est tout de même enregistré avec vos modifications.`)
      return
    }
    if (typedWhileLookingUp.current) {
      setAddressNote('Vous avez modifié l\'adresse pendant la recherche : elle est conservée telle que vous l\'avez saisie.')
      return
    }
    setAddress(result.address.slice(0, 200))
    if (result.city) setCity(result.city.slice(0, 80))
    setErrors((e) => ({ ...e, address: undefined, city: undefined }))
    setAddressNote('Adresse renseignée depuis la carte. Vérifiez-la et modifiez-la si nécessaire.')
  }

  const search = async () => {
    const text = (query.trim() || [address, city].filter(Boolean).join(', ')).trim()
    if (text.length < 3) {
      setSearchNote('Saisissez une adresse ou le nom d\'un lieu.')
      return
    }
    setSearching(true)
    setSearchNote('')
    const hit = await geocodeAddress(/tunisia|tunisie/i.test(text) ? text : `${text}, Tunisia`)
    setSearching(false)
    if (!hit) {
      setSearchNote('Rien trouvé en Tunisie pour cette recherche. Essayez une rue proche, ou cliquez sur la carte pour placer le repère.')
      return
    }
    setPin({ latitude: hit.latitude, longitude: hit.longitude })
    setErrors((e) => ({ ...e, location: undefined }))
    setSearchNote(`Trouvé : ${hit.displayName}. Déplacez le repère pour l\'affiner.`)
    if (!address.trim()) setAddress(hit.displayName.split(',').slice(0, 3).join(',').trim())
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      name,
      description,
      whatsappNumber,
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
        whatsappNumber: f.whatsappNumber?.[0],
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
          whatsappNumber: result.fieldErrors.whatsappNumber,
          address: result.fieldErrors.address,
          city: result.fieldErrors.city,
          location: result.fieldErrors.latitude ?? result.fieldErrors.longitude,
        })
      }
      return void toast.error(result.message)
    }
    toast.success('Profil du club enregistré')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Profil du club</h2>
        <p className="text-sm text-[#645757]">Votre page publique (« vitrine ») : ce que les joueurs voient avant de réserver.</p>
      </div>

      <form onSubmit={submit} className="space-y-6" noValidate>
        <Section id="about" title="À propos de votre club">
          <div className="grid gap-1.5">
            <Label htmlFor="cp-name">Nom du club</Label>
            <Input id="cp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} error={Boolean(errors.name)} autoComplete="off" />
            {errors.name && <p role="alert" className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cp-bio">Présentation / description</Label>
            <Textarea
              id="cp-bio"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={BIO_MAX}
              placeholder="Dites aux joueurs ce qui rend votre club unique : terrains, installations, parking, café, coaching…"
            />
            <div className="flex justify-between text-xs text-[#645757]">
              <span>{errors.description ? <span role="alert" className="text-destructive">{errors.description}</span> : 'Affiché sur votre page publique.'}</span>
              <span className="tabular-nums">
                {description.length} / {BIO_MAX}
              </span>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cp-whatsapp">Numéro WhatsApp</Label>
            <Input
              id="cp-whatsapp"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="+216 98 123 456"
              error={Boolean(errors.whatsappNumber)}
            />
            <p className="text-xs text-[#645757]">
              {errors.whatsappNumber ? <span role="alert" className="text-destructive">{errors.whatsappNumber}</span> : 'Les joueurs reçoivent un bouton « Contacter le club sur WhatsApp » dans leur confirmation et leur rappel.'}
            </p>
          </div>
        </Section>

        <Section id="location" title="Emplacement" hint="Les joueurs l'utilisent pour vous trouver. Recherchez votre adresse, puis déplacez le repère sur votre entrée.">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="cp-address">Adresse physique</Label>
              <div className="relative">
                <Input
                  id="cp-address"
                  value={address}
                  onChange={(e) => {
                    if (lookingUp) typedWhileLookingUp.current = true
                    setAddress(e.target.value)
                  }}
                  maxLength={200}
                  error={Boolean(errors.address)}
                  placeholder="12 Avenue Habib Bourguiba"
                  autoComplete="off"
                  aria-busy={lookingUp}
                  aria-describedby="cp-address-note"
                  className={lookingUp ? 'pr-9' : undefined}
                />
                {lookingUp && (
                  <Loader2
                    className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-[#645757]"
                    aria-label="Recherche de l'adresse"
                    data-testid="address-loading"
                  />
                )}
              </div>
              <p id="cp-address-note" role="status" aria-live="polite" className="min-h-4 text-xs text-[#645757]" data-testid="address-note">
                {lookingUp ? 'Recherche de l\'adresse…' : addressNote}
              </p>
              {errors.address && <p role="alert" className="text-xs text-destructive">{errors.address}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cp-city">Ville</Label>
              <Input id="cp-city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} error={Boolean(errors.city)} placeholder="Tunis" autoComplete="off" />
              {errors.city && <p role="alert" className="text-xs text-destructive">{errors.city}</p>}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cp-search">Rechercher sur la carte</Label>
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
                placeholder="Adresse ou lieu, ex. : Lac 2, Tunis"
                autoComplete="off"
              />
              <Button type="button" variant="outline" onClick={() => void search()} disabled={searching}>
                {searching ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />} Rechercher
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
                void fillAddressFromPin(p) // a click or a drag-end on the map (search results do not trigger it)
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
                'Pas encore de repère : recherchez, ou cliquez sur la carte pour le placer.'
              )}
            </p>
            {pin && (
              <Button type="button" variant="outline" size="sm" onClick={() => setPin(null)}>
                <X aria-hidden /> Retirer le repère
              </Button>
            )}
          </div>
          {errors.location && <p role="alert" className="text-xs text-destructive">{errors.location}</p>}
        </Section>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving} className="bg-[#1d3023] text-[#f7f5f2] hover:bg-[#1d3023]/90">
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            Enregistrer le profil
          </Button>
        </div>
      </form>

      <Section id="photos" title="Galerie photo" hint="Les photos sont enregistrées dès que vous les ajoutez, les réordonnez ou les supprimez.">
        <GalleryManager initialUrls={initial.galleryUrls} />
      </Section>
    </div>
  )
}
