'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { ConsentCheckbox, LegalLinks } from '@/components/legal/consent-checkbox'
import { MapPin, CheckCircle, Loader2 } from 'lucide-react'
import { documentSchema, ownerSignupSchema, type OwnerSignupData } from '@/lib/validations/owner-signup'
import { submitOwnerSignup, checkRegistryNumber, geocodeAddress } from '@/lib/actions/owner-signup'

const TUNISIA_CENTER = [34.0, 9.5] as [number, number]

const SPORT_OPTIONS = [
  { value: 'padel', label: 'Padel (90 min, 4 players)' },
  { value: 'tennis', label: 'Tennis (60 min, 2 or 4 players)' },
  { value: 'football', label: 'Football (90 min, 12 or 14 players)' },
] as const

import type { MarkerPosition } from '@/components/auth/location-picker-map'

// react-leaflet touches `window` at module scope, so it must never be part of
// the server/prerender bundle.
const LocationPickerMap = dynamic(
  () => import('@/components/auth/location-picker-map').then((m) => m.LocationPickerMap),
  {
    ssr: false,
    loading: () => (
      <div
        style={{ height: '400px' }}
        className="w-full rounded-lg border bg-muted animate-pulse"
      />
    ),
  }
)

type SportType = OwnerSignupData['company']['sportTypes'][number]

const StepIndicator = ({ currentStep, totalSteps = 4 }: { currentStep: number; totalSteps?: number }) => (
  <div className="mb-8 flex w-full items-center justify-center" role="list" aria-label="Registration progress">
    {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
      <div key={step} role="listitem" className={cn('flex items-center', step < totalSteps && 'flex-1')}>
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors',
            step < currentStep
              ? 'bg-green-500 text-white'
              : step === currentStep
              ? 'bg-primary text-primary-foreground'
              : 'bg-[#d7d2cc] text-muted-foreground'
          )}
        >
          {step < currentStep ? <CheckCircle className="h-5 w-5" /> : step}
        </div>
        {step < totalSteps && (
          <div
            className={cn(
              'mx-2 h-1 min-w-4 flex-1 transition-colors',
              step < currentStep ? 'bg-green-500' : 'bg-[#d7d2cc]'
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

  const {
    register,
    handleSubmit,
    control,
    setValue,
    trigger,
    formState: { errors },
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
        acceptTerms: false,
      },
    },
    mode: 'onChange',
  })

  // useWatch (not watch()) is the React Compiler-compatible way to subscribe to a field.
  const watchedCompany = useWatch({ control, name: 'company' })

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
      await checkRegistryNumber(value)
    }
  }

  const [docFile, setDocFile] = useState<File | null>(null)
  const [docError, setDocError] = useState<string | null>(null)

  // Validate with the same rules the server uses, on a real native File.
  const chooseDocument = (file: File | undefined) => {
    if (!file) return
    const parsed = documentSchema.shape.verificationDoc.safeParse(file)
    if (!parsed.success) {
      setDocFile(null)
      setDocError(parsed.error.issues[0].message)
      setValue('document.verificationDoc', undefined as unknown as File)
      return
    }
    setDocFile(file)
    setDocError(null)
    setValue('document.verificationDoc', file, { shouldValidate: true })
  }

  const nextStep = () => {
    if (currentStep < 4) setCurrentStep(currentStep + 1)
  }

  // Validate only the current step's fields. (The old Next button was disabled by
  // the whole form's `isValid`, which includes the owner-account step the user
  // has not reached yet, so it could never be enabled.)
  const [stepError, setStepError] = useState<string | null>(null)
  const validateAndNext = async (section: 'company' | 'location' | 'document') => {
    const ok = await trigger(section)
    if (!ok) {
      setStepError('Some required fields are missing or invalid. Please fix the highlighted fields below.')
      // Bring the first problem into view once the error text has rendered.
      requestAnimationFrame(() =>
        document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      )
      return false
    }
    setStepError(null)
    nextStep()
    return true
  }

  const prevStep = () => {
    setStepError(null)
    if (currentStep > 1) setCurrentStep(currentStep - 1)
  }

  const onSubmit = async (data: OwnerSignupData) => {
    setIsSubmitting(true)
    setSubmitError(null)

    const result = await submitOwnerSignup(data)

    if (result.success) {
      setSubmitSuccess(true)
      reset()
      setDocFile(null)
      setDocError(null)
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
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">Register Your Sports Complex</h1>
        <p className="text-muted-foreground mt-2">
          Complete the 4-step registration to join ShiftGrid
        </p>
      </div>

      <div className="w-full rounded-xl bg-[#eae6df] p-5 sm:p-8">
      <StepIndicator currentStep={currentStep} />

      <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-6">
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
                      watchedCompany.sportTypes.includes(sport.value as SportType)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-input hover:border-primary/50'
                    )}
                  >
                    <input
                      type="checkbox"
                      value={sport.value}
                      checked={watchedCompany.sportTypes.includes(sport.value as SportType)}
                      onChange={(e) => {
                        const newSports = [...watchedCompany.sportTypes]
                        if (e.target.checked) newSports.push(sport.value as SportType)
                        else newSports.splice(newSports.indexOf(sport.value as SportType), 1)
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

            {stepError && (
              <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {stepError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={prevStep} disabled={currentStep === 1}>
                Back
              </Button>
              <Button type="button" onClick={() => validateAndNext('company')}>
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
                void validateAndNext('location')
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

            <div
              className={cn(
                // ph-no-capture: the registration document never appears in session recordings.
                'ph-no-capture rounded-lg border-2 border-dashed bg-[#f7f5f2] p-8 text-center transition-colors',
                docError ? 'border-destructive' : 'border-input'
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                chooseDocument(e.dataTransfer.files?.[0])
              }}
            >
              {/* Deliberately NOT register()ed: for a file input RHF reads a FileList,
                  which z.instanceof(File) rejects ("Input not instance of File"). The
                  File is extracted here and handed to the form explicitly. */}
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="sr-only"
                id="verificationDoc"
                onChange={(e) => {
                  chooseDocument(e.target.files?.[0])
                  e.target.value = '' // allow re-picking the same file after an error
                }}
                aria-invalid={docError ? true : undefined}
                aria-describedby={docError ? 'verificationDoc-error' : undefined}
              />
              <label htmlFor="verificationDoc" className="cursor-pointer">
                <MapPin className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium">Click to upload or drag and drop</p>
                <p className="mt-1 text-sm text-muted-foreground">PDF, JPEG, PNG up to 5MB</p>
              </label>

              {docFile && !docError && (
                <p className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#eae6df] px-3 py-1.5 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600" aria-hidden />
                  <span className="max-w-[28ch] truncate">{docFile.name}</span>
                  <span className="text-muted-foreground">({(docFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                </p>
              )}
              {docError && (
                <p id="verificationDoc-error" role="alert" className="mt-3 text-sm text-destructive">
                  {docError}
                </p>
              )}
            </div>

            <div className="flex justify-between pt-4">
              <Button type="button" variant="outline" onClick={prevStep}>
                Back
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!docFile || docError) {
                    setDocError(docError ?? 'Please upload your verification document to continue.')
                    return
                  }
                  void validateAndNext('document')
                }}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-6">
            <StepLabel step={4} label="Owner Account" />
            <p className="text-muted-foreground">
              Create your owner account. You&apos;ll use this to log in and manage your sports complex.
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

            <Controller
              name="owner.acceptTerms"
              control={control}
              render={({ field }) => (
                <ConsentCheckbox
                  id="owner-terms"
                  checked={!!field.value}
                  onChange={field.onChange}
                  error={errors.owner?.acceptTerms?.message}
                >
                  I accept the <LegalLinks />. I confirm I am authorised to register this club, and I consent to ShiftGrid
                  processing my details and the uploaded registration document to verify it.
                </ConsentCheckbox>
              )}
            />

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
    </div>
  )
}