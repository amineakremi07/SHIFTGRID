'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ConsentCheckbox } from '@/components/legal/consent-checkbox'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Mail, Lock, User, Phone, Eye, EyeOff, CheckCircle } from 'lucide-react'
import {
  playerSignInSchema,
  playerSignUpSchema,
  anonymousBookerSchema,
  type PlayerSignInInput,
  type PlayerSignUpInput,
  type AnonymousBookerInput,
} from '@/lib/validations/player-auth'
import { signInPlayer, signUpPlayer, createAnonymousBooker } from '@/lib/actions/player-auth'

type AuthMode = 'signin' | 'signup' | 'anonymous'

interface PlayerAuthModalProps {
  /** Organization ID (required for signup and anonymous booking) */
  orgId: string
  /** Whether the modal is open (controlled) */
  open?: boolean
  /** Callback when modal should close */
  onOpenChange?: (open: boolean) => void
  /** Default tab to show */
  defaultMode?: AuthMode
  /** Callback when authentication succeeds */
  onSuccess?: (data: { userId?: string; bookerId?: string; mode: AuthMode }) => void
}

export function PlayerAuthModal({
  orgId,
  open: controlledOpen,
  onOpenChange,
  defaultMode = 'signin',
  onSuccess,
}: PlayerAuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(defaultMode)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  // Internal uncontrolled state for when not controlled
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const isOpen = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen

  // Sign In Form
  const signInForm = useForm<z.input<typeof playerSignInSchema>, unknown, PlayerSignInInput>({
    resolver: zodResolver(playerSignInSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: true,
    },
  })

  // Sign Up Form
  const signUpForm = useForm<z.input<typeof playerSignUpSchema>, unknown, PlayerSignUpInput>({
    resolver: zodResolver(playerSignUpSchema),
    defaultValues: {
      displayName: '',
      email: '',
      phone: '',
      password: '',
      orgId,
      rememberMe: true,
      acceptTerms: false,
    },
  })

  // Anonymous Booker Form
  const anonymousForm = useForm<AnonymousBookerInput>({
    resolver: zodResolver(anonymousBookerSchema),
    defaultValues: {
      name: '',
      phone: '',
      orgId,
    },
  })

  const handleSignIn = async (data: PlayerSignInInput) => {
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await signInPlayer(data.email, data.password, data.rememberMe)
      if (result.success) {
        onSuccess?.({ userId: result.userId, mode: 'signin' })
        setOpen(false)
        signInForm.reset()
      } else {
        setError(result.error || 'Sign in failed')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSignUp = async (data: PlayerSignUpInput) => {
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await signUpPlayer(data)
      if (result.success) {
        onSuccess?.({ userId: result.userId, mode: 'signup' })
        setOpen(false)
        signUpForm.reset()
      } else {
        setError(result.error || 'Sign up failed')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAnonymous = async (data: AnonymousBookerInput) => {
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await createAnonymousBooker(data)
      if (result.success) {
        onSuccess?.({ bookerId: result.bookerId, mode: 'anonymous' })
        setOpen(false)
        anonymousForm.reset()
      } else {
        setError(result.error || 'Failed to create booking profile')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderSignIn = () => (
    <form onSubmit={signInForm.handleSubmit(handleSignIn)} className="space-y-4">
      <div>
        <Label htmlFor="signin-email">Email</Label>
        <div className="relative mt-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="signin-email"
            type="email"
            placeholder="you@example.com"
            className="pl-10"
            {...signInForm.register('email')}
          />
        </div>
        {signInForm.formState.errors.email && (
          <p className="text-sm text-destructive mt-1">{signInForm.formState.errors.email.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="signin-password">Password</Label>
        <div className="relative mt-1">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="signin-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            className="pl-10 pr-10"
            {...signInForm.register('password')}
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowPassword(!showPassword)}
            onMouseDown={(e) => e.preventDefault()}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {signInForm.formState.errors.password && (
          <p className="text-sm text-destructive mt-1">{signInForm.formState.errors.password.message}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Controller
          name="rememberMe"
          control={signInForm.control}
          render={({ field }) => (
            <input
              type="checkbox"
              id="signin-remember"
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              checked={!!field.value}
              onChange={(e) => field.onChange(e.target.checked)}
            />
          )}
        />
        <Label htmlFor="signin-remember" className="text-sm font-normal cursor-pointer">
          Remember me for 30 days
        </Label>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Signing in...
          </>
        ) : (
          'Sign In'
        )}
      </Button>
    </form>
  )

  const renderSignUp = () => (
    <form onSubmit={signUpForm.handleSubmit(handleSignUp)} className="space-y-4">
      <div>
        <Label htmlFor="signup-name">Full Name</Label>
        <div className="relative mt-1">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="signup-name"
            placeholder="John Doe"
            className="pl-10"
            {...signUpForm.register('displayName')}
          />
        </div>
        {signUpForm.formState.errors.displayName && (
          <p className="text-sm text-destructive mt-1">{signUpForm.formState.errors.displayName.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="signup-email">Email</Label>
        <div className="relative mt-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="signup-email"
            type="email"
            placeholder="you@example.com"
            className="pl-10"
            {...signUpForm.register('email')}
          />
        </div>
        {signUpForm.formState.errors.email && (
          <p className="text-sm text-destructive mt-1">{signUpForm.formState.errors.email.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="signup-phone">Phone Number</Label>
        <div className="relative mt-1">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="signup-phone"
            placeholder="98 123 456"
            className="pl-10"
            {...signUpForm.register('phone')}
          />
        </div>
        {signUpForm.formState.errors.phone && (
          <p className="text-sm text-destructive mt-1">{signUpForm.formState.errors.phone.message}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Tunisian format: 98 123 456, +216 98 123 456, or 00216 98 123 456
        </p>
      </div>

      <div>
        <Label htmlFor="signup-password">Password</Label>
        <div className="relative mt-1">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="signup-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            className="pl-10 pr-10"
            {...signUpForm.register('password')}
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowPassword(!showPassword)}
            onMouseDown={(e) => e.preventDefault()}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {signUpForm.formState.errors.password && (
          <p className="text-sm text-destructive mt-1">{signUpForm.formState.errors.password.message}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Controller
          name="rememberMe"
          control={signUpForm.control}
          render={({ field }) => (
            <input
              type="checkbox"
              id="signup-remember"
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              checked={!!field.value}
              onChange={(e) => field.onChange(e.target.checked)}
            />
          )}
        />
        <Label htmlFor="signup-remember" className="text-sm font-normal cursor-pointer">
          Remember me for 30 days
        </Label>
      </div>

      <Controller
        name="acceptTerms"
        control={signUpForm.control}
        render={({ field }) => (
          <ConsentCheckbox
            id="signup-terms"
            checked={!!field.value}
            onChange={field.onChange}
            error={signUpForm.formState.errors.acceptTerms?.message}
          />
        )}
      />

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating account...
          </>
        ) : (
          'Create Account'
        )}
      </Button>
    </form>
  )

  const renderAnonymous = () => (
    <form onSubmit={anonymousForm.handleSubmit(handleAnonymous)} className="space-y-4">
      <Card className="border-yellow-200 bg-yellow-50">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">Anonymous Booking</p>
              <p className="mt-1">
                No account needed. After booking you get a private link to cancel if your plans change.
                Your name and phone will be saved for future bookings at this complex.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <Label htmlFor="anon-name">Full Name</Label>
        <div className="relative mt-1">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="anon-name"
            placeholder="John Doe"
            className="pl-10"
            {...anonymousForm.register('name')}
          />
        </div>
        {anonymousForm.formState.errors.name && (
          <p className="text-sm text-destructive mt-1">{anonymousForm.formState.errors.name.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="anon-phone">Phone Number</Label>
        <div className="relative mt-1">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="anon-phone"
            placeholder="98 123 456"
            className="pl-10"
            {...anonymousForm.register('phone')}
          />
        </div>
        {anonymousForm.formState.errors.phone && (
          <p className="text-sm text-destructive mt-1">{anonymousForm.formState.errors.phone.message}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Tunisian format: 98 123 456, +216 98 123 456, or 00216 98 123 456
        </p>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Continuing as guest...
          </>
        ) : (
          'Continue as Guest'
        )}
      </Button>
    </form>
  )

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Continue as Guest'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'signin'
              ? 'Enter your credentials to access your bookings'
              : mode === 'signup'
              ? 'Create an account to manage your bookings and get reminders'
              : 'Book without an account — confirmations sent via SMS'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as AuthMode)} className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
            <TabsTrigger value="anonymous">Guest</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="mt-4 focus-visible:ring-0">
            {renderSignIn()}
          </TabsContent>
          <TabsContent value="signup" className="mt-4 focus-visible:ring-0">
            {renderSignUp()}
          </TabsContent>
          <TabsContent value="anonymous" className="mt-4 focus-visible:ring-0">
            {renderAnonymous()}
          </TabsContent>
        </Tabs>

        <DialogClose asChild>
          <Button variant="ghost" className="mt-4 w-full">
            Close
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}