'use client'

import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { ownerSignupSchema, type OwnerSignupData } from '@/lib/validations/owner-signup'
import { submitOwnerSignup, checkRegistryNumber, geocodeAddress } from '@/lib/actions/owner-signup'

const TUNISIA_CENTER = [34.0, 9.5] as [number, number]

const SPORT_OPTIONS = [
  { value: 'padel', label: 'Padel (90 min, 4 players)' },
  { value: 'tennis', label: 'Tennis (60 min, 2 or 4 players)' },
  { value: 'football', label: 'Football (90 min, 12 or 14 players)' },
] as const

interface MarkerPosition {
  latitude: number
  longitude: number
}

const LocationPickerMap = ({ latitude, longitude, onPositionChange }: {
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

const StepIndicator = ({ currentStep, totalSteps = 4 }: { currentStep: number; totalSteps?: number }) => (
  <div className="flex items-center justify-between mb-8">
    {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
      <div key={step} className="flex items-center">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-colors',
            step < currentStep
              ? 'bg-green-500 text-white'
              : step === currentStep
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {step < currentStep ? <CheckCircle className="h-5 w-5" /> : step}
        </div>
        {step < totalSteps && (
          <div
            className={cn(
              'h-1 w-16 mx-2 transition-colors',
              step < currentStep ? 'bg-green-500' : 'bg-muted'
            )}
          />
        )}
      </div>
    ))}
  </div>
)

const StepLabel = ({ step, label }: { step: number; label: string }) => (
  <div className="text-center mb-2">
    <span className="text-sm text-muted-foreground">Step {step} of 4</span>
    <h3 className="text-lg font-semibold">{label}</h3>
  </div>
)

export function OwnerSignupForm() {
  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [mapPosition, setMapPosition] = useState<MarkerPosition>({ latitude: TUNISIA_CENTER[0], longitude: TUNISIA_CENTER[1] })
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
    reset,
  } = useForm<OwnerSignupData>({
    resolver: zodResolver(ownerSignupSchema),
    defaultValues: {
      company: {
        companyName: '',
        registryNumber: '',
        address: '',
        city: '',
        postalCode: '',
        phone: '+216 ',
        email: '',
        sportTypes: [],
        courtCounts: { padel: 0, tennis: 0, football: 0 },
        openTime: '08:00',
        closeTime: '22:00',
        employeeCount: 1,
      },
      location: {
        latitude: TUNISIA_CENTER[0],
        longitude: TUNISIA_CENTER[1],
        addressConfirm: '',
      },
      document: {},
      owner: {
        ownerName: '',
        ownerEmail: '',
        ownerPhone: '+216 ',
        password: '',
        confirmPassword: '',
      },
    },
    mode: 'onChange',
  })

  const watchedCompany = watch('company')
  const watchedLocation = watch('location')

  useEffect(() => {
    if (watchedCompany.address && watchedCompany.city) {
      const fullAddr = `${watchedCompany.address}, ${watchedCompany.city}${watchedCompany.postalCode ? `, ${watchedCompany.postalCode}` : ''}, Tunisia`
      setValue('location.addressConfirm', fullAddr)
    }
  }, [watchedCompany.address, watchedCompany.city, watchedCompany.postalCode, setValue])

  const handleAddressBlur = async () => {
    const address = `${watchedCompany.address}, ${watchedCompany.city}${watchedCompany.postalCode ? `, ${watchedCompany.postalCode}` : ''}, Tunisia`
    if (address.trim().length > 10) {
      const result = await geocodeAddress(address)
      if (result) {
        setValue('location.latitude', result.latitude)
        setValue('location.longitude', result.longitude)
        setMapPosition({ latitude: result.latitude, longitude: result.longitude })
      }
    }
  }

  const handleRegistryCheck = async (value: string) => {
    if (value.length === 14) {
      const result = await checkRegistryNumber(value)
    }
  }

  const nextStep = () => {
    if (currentStep < 4) setCurrentStep(currentStep + 1)
  }

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1)
  }

  const onSubmit = async (data: OwnerSignupData) => {
    setIsSubmitting(true)
    setSubmitError(null)

    const result = await submitOwnerSignup(data)

    if (result.success) {
      setSubmitSuccess(true)
      reset()
      setCurrentStep(1)
      setMapPosition({ latitude: TUNISIA_CENTER[0], longitude: TUNISIA_CENTER[1] })
    } else {
      setSubmitError(result.error || 'Registration failed')
    }

    setIsSubmitting(false)
  }

  if (submitSuccess) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Registration Submitted!</h2>
        <p className="text-muted-foreground mb-6">
          Your organization registration for <strong>{watchedCompany.companyName}</strong> has been received.
        </p>
        <p className="text-muted-foreground mb-6">
          Our team will review your application and contact you at <strong>{watchedCompany.email}</strong>
          to complete the verification process.
        </p>
        <Button onClick={() => { setSubmitSuccess(false); setCurrentStep(1); }}>
          Register Another Organization
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">Register Your Sports Complex</h1>
        <p className="text-muted-foreground mt-2">
          Complete the 4-step registration to join ShiftGrid
        </p>
      </div>

      <StepIndicator currentStep={currentStep} />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {submitError && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
            {submitError}
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-6">
            <StepLabel step={1} label="Company Details" />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="companyName">Company Name *</Label>
                <Input
                  id="companyName"
                  placeholder="SportCity Tunis"
                  {...register('company.companyName')}
                  error={!!errors.company?.companyName}
                />
                {errors.company?.companyName && (
                  <p className="text-sm text-destructive">{errors.company.companyName.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="registryNumber">Registry Number (Registre de Commerce) *</Label>
                <Input
                  id="registryNumber"
                  placeholder="14 digits"
                  maxLength={14}
                  {...register('company.registryNumber', { onBlur: (e) => handleRegistryCheck(e.target.value) })}
                  error={!!errors.company?.registryNumber}
                />
                <p className="text-xs text-muted-foreground mt-1">14-digit Tunisia business registry number</p>
                {errors.company?.registryNumber && (
                  <p className="text-sm text-destructive">{errors.company.registryNumber.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="companyPhone">Company Phone *</Label>
                <Input
                  id="companyPhone"
                  placeholder="+216 20 123 456"
                  {...register('company.phone')}
                  error={!!errors.company?.phone}
                />
                {errors.company?.phone && (
                  <p className="text-sm text-destructive">{errors.company.phone.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="companyEmail">Company Email *</Label>
                <Input
                  id="companyEmail"
                  type="email"
                  placeholder="contact@sportcity.tn"
                  {...register('company.email')}
                  error={!!errors.company?.email}
                />
                {errors.company?.email && (
                  <p className="text-sm text-destructive">{errors.company.email.message}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="address">Address *</Label>
                <Input
                  id="address"
                  placeholder="123 Avenue Habib Bourguiba"
                  {...register('company.address')}
                  onBlur={handleAddressBlur}
                  error={!!errors.company?.address}
                />
                {errors.company?.address && (
                  <p className="text-sm text-destructive">{errors.company.address.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  placeholder="Tunis"
                  {...register('company.city')}
                  onBlur={handleAddressBlur}
                  error={!!errors.company?.city}
                />
                {errors.company?.city && (
                  <p className="text-sm text-destructive">{errors.company.city.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="postalCode">Postal Code</Label>
                <Input
                  id="postalCode"
                  placeholder="1000"
                  maxLength={4}
                  {...register('company.postalCode')}
                  onBlur={handleAddressBlur}
                  error={!!errors.company?.postalCode}
                />
                {errors.company?.postalCode && (
                  <p className="text-sm text-destructive">{errors.company.postalCode.message}</p>
                )}
              </div>
            </div>

            <div>
              <Label>Sport Types *</Label>
              <div className="flex flex-wrap gap-3 mt-2">
                {SPORT_OPTIONS.map((sport) => (
                  <label
                    key={sport.value}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors',
                      watchedCompany.sportTypes.includes(sport.value as any)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-input hover:border-primary/50'
                    )}
                  >
                    <input
                      type="checkbox"
                      value={sport.value}
                      checked={watchedCompany.sportTypes.includes(sport.value as any)}
                      onChange={(e) => {
                        const newSports = [...watchedCompany.sportTypes]
                        if (e.target.checked) newSports.push(sport.value as any)
                        else newSports.splice(newSports.indexOf(sport.value as any), 1)
                        setValue('company.sportTypes', newSports)
                      }}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                    />
                    <span className="text-sm">{sport.label}</span>
                  </label>
                ))}
              </div>
              {errors.company?.sportTypes && (
                <p className="text-sm text-destructive mt-1">{errors.company.sportTypes.message}</p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="padelCount">Padel Courts</Label>
                <Input
                  id="padelCount"
                  type="number"
                  min={0}
                  max={20}
                  {...register('company.courtCounts.padel', { valueAsNumber: true })}
                />
              </div>
              <div>
                <Label htmlFor="tennisCount">Tennis Courts</Label>
                <Input
                  id="tennisCount"
                  type="number"
                  min={0}
                  max={20}
                  {...register('company.courtCounts.tennis', { valueAsNumber: true })}
                />
              </div>
              <div>
                <Label htmlFor="footballCount">Football Courts</Label>
                <Input
                  id="footballCount"
                  type="number"
                  min={0}
                  max={10}
                  {...register('company.courtCounts.football', { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="openTime">Opening Time *</Label>
                <Input
                  id="openTime"
                  type="time"
                  {...register('company.openTime')}
                  error={!!errors.company?.openTime}
                />
                {errors.company?.openTime && (
                  <p className="text-sm text-destructive">{errors.company.openTime.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="closeTime">Closing Time *</Label>
                <Input
                  id="closeTime"
                  type="time"
                  {...register('company.closeTime')}
                  error={!!errors.company?.closeTime}
                />
                {errors.company?.closeTime && (
                  <p className="text-sm text-destructive">{errors.company.closeTime.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="employeeCount">Employee Count *</Label>
                <Input
                  id="employeeCount"
                  type="number"
                  min={1}
                  max={100}
                  {...register('company.employeeCount', { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={prevStep} disabled={currentStep === 1}>
                Back
              </Button>
              <Button type="button" onClick={nextStep} disabled={!isValid}>
                Next
              </Button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
            <StepLabel step={2} label="Confirm Location" />
            <p className="text-muted-foreground">
              Drag the marker to your exact location. The address will be verified against your company address.
            </p>

            <LocationPickerMap
              latitude={mapPosition.latitude}
              longitude={mapPosition.longitude}
              onPositionChange={setMapPosition}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Latitude</Label>
                <Input
                  readOnly
                  value={mapPosition.latitude.toFixed(6)}
                  className="bg-muted"
                />
              </div>
              <div>
                <Label>Longitude</Label>
                <Input
                  readOnly
                  value={mapPosition.longitude.toFixed(6)}
                  className="bg-muted"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="addressConfirm">Confirmed Address *</Label>
              <Input
                id="addressConfirm"
                {...register('location.addressConfirm')}
                error={!!errors.location?.addressConfirm}
              />
              {errors.location?.addressConfirm && (
                <p className="text-sm text-destructive">{errors.location.addressConfirm.message}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                This should match your company address above
              </p>
            </div>

            <div className="flex justify-between pt-4">
              <Button type="button" variant="outline" onClick={prevStep}>
                Back
              </Button>
              <Button type="button" onClick={() => {
                setValue('location.latitude', mapPosition.latitude)
                setValue('location.longitude', mapPosition.longitude)
                nextStep()
              }}>
                Next
              </Button>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-6">
            <StepLabel step={3} label="Verification Document" />
            <p className="text-muted-foreground">
              Upload a proof of existence (utility bill, commercial register extract, or similar).
              Max 5MB. PDF, JPEG, or PNG.
            </p>

            <div className="border-2 border-dashed border-input rounded-lg p-8 text-center">
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                {...register('document.verificationDoc')}
                className="sr-only"
                id="verificationDoc"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) setValue('document.verificationDoc', file)
                }}
                error={!!errors.document?.verificationDoc}
              />
              <label htmlFor="verificationDoc" className="cursor-pointer">
                <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-lg font-medium">Click to upload or drag and drop</p>
                <p className="text-sm text-muted-foreground mt-1">PDF, JPEG, PNG up to 5MB</p>
              </label>
              {errors.document?.verificationDoc && (
                <p className="text-sm text-destructive mt-2">{errors.document.verificationDoc.message}</p>
              )}
            </div>

            <div className="flex justify-between pt-4">
              <Button type="button" variant="outline" onClick={prevStep}>
                Back
              </Button>
              <Button type="button" onClick={nextStep}>
                Next
              </Button>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-6">
            <StepLabel step={4} label="Owner Account" />
            <p className="text-muted-foreground">
              Create your owner account. You'll use this to log in and manage your sports complex.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="ownerName">Full Name *</Label>
                <Input
                  id="ownerName"
                  placeholder="Mohamed Ben Salem"
                  {...register('owner.ownerName')}
                  error={!!errors.owner?.ownerName}
                />
                {errors.owner?.ownerName && (
                  <p className="text-sm text-destructive">{errors.owner.ownerName.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="ownerEmail">Email *</Label>
                <Input
                  id="ownerEmail"
                  type="email"
                  placeholder="mohamed@sportcity.tn"
                  {...register('owner.ownerEmail')}
                  error={!!errors.owner?.ownerEmail}
                />
                {errors.owner?.ownerEmail && (
                  <p className="text-sm text-destructive">{errors.owner.ownerEmail.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="ownerPhone">Phone *</Label>
                <Input
                  id="ownerPhone"
                  placeholder="+216 20 123 456"
                  {...register('owner.ownerPhone')}
                  error={!!errors.owner?.ownerPhone}
                />
                {errors.owner?.ownerPhone && (
                  <p className="text-sm text-destructive">{errors.owner.ownerPhone.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  {...register('owner.password')}
                  error={!!errors.owner?.password}
                />
                {errors.owner?.password && (
                  <p className="text-sm text-destructive">{errors.owner.password.message}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  {...register('owner.confirmPassword')}
                  error={!!errors.owner?.confirmPassword}
                />
                {errors.owner?.confirmPassword && (
                  <p className="text-sm text-destructive">{errors.owner.confirmPassword.message}</p>
                )}
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <Button type="button" variant="outline" onClick={prevStep}>
                Back
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Registration'}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}