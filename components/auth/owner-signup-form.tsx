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
  { value: 'padel', label: 'Padel (90 min, 4 joueurs)' },
  { value: 'tennis', label: 'Tennis (60 min, 2 ou 4 joueurs)' },
  { value: 'football', label: 'Football (90 min, 12 ou 14 joueurs)' },
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
  <div className="mb-8 flex w-full items-center justify-center" role="list" aria-label="Progression de l'inscription">
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
    <span className="text-sm text-muted-foreground">Étape {step} sur 4</span>
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
      const fullAddr = `${watchedCompany.address}, ${watchedCompany.city}${watchedCompany.postalCode ? `, ${watchedCompany.postalCode}` : ''}, Tunisie`
      setValue('location.addressConfirm', fullAddr)
    }
  }, [watchedCompany.address, watchedCompany.city, watchedCompany.postalCode, setValue])

  const handleAddressBlur = async () => {
    const address = `${watchedCompany.address}, ${watchedCompany.city}${watchedCompany.postalCode ? `, ${watchedCompany.postalCode}` : ''}, Tunisie`
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
      setStepError('Certains champs obligatoires sont manquants ou invalides. Veuillez corriger les champs signalés ci-dessous.')
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
      setSubmitError(result.error || 'L\'inscription a échoué')
    }

    setIsSubmitting(false)
  }

  if (submitSuccess) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Inscription envoyée !</h2>
        <p className="text-muted-foreground mb-6">
          L&apos;inscription de votre organisation <strong>{watchedCompany.companyName}</strong> a bien été reçue.
        </p>
        <p className="text-muted-foreground mb-6">
          Notre équipe examinera votre demande et vous contactera à l&apos;adresse <strong>{watchedCompany.email}</strong>
          pour finaliser la vérification.
        </p>
        <Button onClick={() => { setSubmitSuccess(false); setCurrentStep(1); }}>
          Inscrire une autre organisation
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">Inscrivez votre complexe sportif</h1>
        <p className="text-muted-foreground mt-2">
          Complétez l&apos;inscription en 4 étapes pour rejoindre ShiftGrid
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
            <StepLabel step={1} label="Informations de l'entreprise" />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="companyName">Nom de l&apos;entreprise *</Label>
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
                <Label htmlFor="registryNumber">Numéro de registre (Registre de commerce) *</Label>
                <Input
                  id="registryNumber"
                  placeholder="14 chiffres"
                  maxLength={14}
                  {...register('company.registryNumber', { onBlur: (e) => handleRegistryCheck(e.target.value) })}
                  error={!!errors.company?.registryNumber}
                />
                <p className="text-xs text-muted-foreground mt-1">Numéro de registre de commerce tunisien à 14 chiffres</p>
                {errors.company?.registryNumber && (
                  <p className="text-sm text-destructive">{errors.company.registryNumber.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="companyPhone">Téléphone de l&apos;entreprise *</Label>
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
                <Label htmlFor="companyEmail">E-mail de l&apos;entreprise *</Label>
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
                <Label htmlFor="address">Adresse *</Label>
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
                <Label htmlFor="city">Ville *</Label>
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
                <Label htmlFor="postalCode">Code postal</Label>
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
              <Label>Sports proposés *</Label>
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
                <Label htmlFor="padelCount">Terrains de padel</Label>
                <Input
                  id="padelCount"
                  type="number"
                  min={0}
                  max={20}
                  {...register('company.courtCounts.padel', { valueAsNumber: true })}
                />
              </div>
              <div>
                <Label htmlFor="tennisCount">Terrains de tennis</Label>
                <Input
                  id="tennisCount"
                  type="number"
                  min={0}
                  max={20}
                  {...register('company.courtCounts.tennis', { valueAsNumber: true })}
                />
              </div>
              <div>
                <Label htmlFor="footballCount">Terrains de football</Label>
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
                <Label htmlFor="openTime">Heure d&apos;ouverture *</Label>
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
                <Label htmlFor="closeTime">Heure de fermeture *</Label>
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
                <Label htmlFor="employeeCount">Nombre d&apos;employés *</Label>
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
                Retour
              </Button>
              <Button type="button" onClick={() => validateAndNext('company')}>
                Suivant
              </Button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
            <StepLabel step={2} label="Confirmer l'emplacement" />
            <p className="text-muted-foreground">
              Déplacez le repère à votre emplacement exact. L&apos;adresse sera vérifiée par rapport à l&apos;adresse de votre entreprise.
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
              <Label htmlFor="addressConfirm">Adresse confirmée *</Label>
              <Input
                id="addressConfirm"
                {...register('location.addressConfirm')}
                error={!!errors.location?.addressConfirm}
              />
              {errors.location?.addressConfirm && (
                <p className="text-sm text-destructive">{errors.location.addressConfirm.message}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Elle doit correspondre à l&apos;adresse de votre entreprise ci-dessus
              </p>
            </div>

            <div className="flex justify-between pt-4">
              <Button type="button" variant="outline" onClick={prevStep}>
                Retour
              </Button>
              <Button type="button" onClick={() => {
                setValue('location.latitude', mapPosition.latitude)
                setValue('location.longitude', mapPosition.longitude)
                void validateAndNext('location')
              }}>
                Suivant
              </Button>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-6">
            <StepLabel step={3} label="Document de vérification" />
            <p className="text-muted-foreground">
              Téléversez une preuve d&apos;existence (facture, extrait du registre de commerce ou équivalent).
              5 Mo maximum. PDF, JPEG ou PNG.
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
                <p className="text-lg font-medium">Cliquez pour téléverser ou glissez-déposez</p>
                <p className="mt-1 text-sm text-muted-foreground">PDF, JPEG, PNG jusqu&apos;à 5 Mo</p>
              </label>

              {docFile && !docError && (
                <p className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#eae6df] px-3 py-1.5 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600" aria-hidden />
                  <span className="max-w-[28ch] truncate">{docFile.name}</span>
                  <span className="text-muted-foreground">({(docFile.size / 1024 / 1024).toFixed(2)} Mo)</span>
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
                Retour
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!docFile || docError) {
                    setDocError(docError ?? 'Veuillez téléverser votre document de vérification pour continuer.')
                    return
                  }
                  void validateAndNext('document')
                }}
              >
                Suivant
              </Button>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-6">
            <StepLabel step={4} label="Compte propriétaire" />
            <p className="text-muted-foreground">
              Créez votre compte propriétaire. Vous l&apos;utiliserez pour vous connecter et gérer votre complexe sportif.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="ownerName">Nom complet *</Label>
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
                <Label htmlFor="ownerEmail">E-mail *</Label>
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
                <Label htmlFor="ownerPhone">Téléphone *</Label>
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
                <Label htmlFor="password">Mot de passe *</Label>
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
                <Label htmlFor="confirmPassword">Confirmer le mot de passe *</Label>
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
                  J&apos;accepte les <LegalLinks />. Je confirme être autorisé à inscrire ce club, et je consens à ce que ShiftGrid
                  traite mes informations et le document d&apos;inscription téléversé pour le vérifier.
                </ConsentCheckbox>
              )}
            />

            <div className="flex justify-between pt-4">
              <Button type="button" variant="outline" onClick={prevStep}>
                Retour
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Envoyer l\'inscription'}
              </Button>
            </div>
          </div>
        )}
      </form>
      </div>
    </div>
  )
}