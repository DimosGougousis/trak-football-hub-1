import { useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { passwordRecovery } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'
import { validatePassword } from '@/lib/password'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [showPw, setShowPw]         = useState(false)
  const recovery = useSyncExternalStore(passwordRecovery.subscribe, passwordRecovery.getSnapshot)
  const loading = recovery.status === 'saving'
  const ready = recovery.status === 'ready' || loading

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const pwError = validatePassword(password)
    if (pwError) {
      toast.error(pwError)
      return
    }
    if (password !== confirm) {
      toast.error('Passwords do not match')
      return
    }
    if (await passwordRecovery.updatePassword(password)) {
      setPassword('')
      setConfirm('')
      toast.success('Password updated')
    }
  }

  return (
    <div
      className="app-container flex flex-col items-center justify-center min-h-screen px-6"
      style={{ background: 'rgb(var(--t-ground))' }}
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[420px] h-[320px] opacity-[0.07]"
        style={{ background: 'radial-gradient(ellipse at center top, rgb(var(--t-brand)) 0%, transparent 70%)' }}
      />

      {/* Wordmark */}
      <div className="text-center mb-10">
        <h1
          className="text-[60px] leading-none text-ink"
          style={{ fontFamily: 'var(--t-font)', fontWeight: 300, letterSpacing: '-0.04em' }}
        >
          TRAK
        </h1>
        <p
          className="text-brand italic mt-1 tracking-[0.14em]"
          style={{ fontFamily: 'var(--t-font)', fontSize: 15 }}
        >
          football
        </p>
      </div>

      <div className="w-full">
        <h2
          className="text-ink text-[22px] mb-1"
          style={{ fontFamily: 'var(--t-font)', fontWeight: 300 }}
        >
          Set new password
        </h2>
        <p
          className="text-ink-3 text-[12px] mb-7"
          style={{ fontFamily: 'var(--t-font)' }}
        >
          Choose a strong password: 8+ characters with upper, lower, a number and a symbol.
        </p>

        {!ready ? (
          <div className="text-center py-8">
            <p role={recovery.status === 'invalid' ? 'alert' : recovery.status === 'verifying' ? undefined : 'status'} className="text-ink-2 text-sm" style={{ fontFamily: 'var(--t-font)' }}>
              {recovery.message || 'Verifying your reset link…'}
            </p>
            {recovery.status !== 'verifying' && (
              <button type="button" onClick={() => navigate('/')} className="min-h-11 mt-5 px-5 text-brand text-sm underline underline-offset-4">
                {recovery.status === 'complete' ? 'Continue to Trak' : 'Return to Trak'}
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {recovery.message && <p role="alert" className="text-ink-2 text-sm">{recovery.message}</p>}

            {/* New password */}
            <div className="relative">
              <FloatingInput
                type={showPw ? 'text' : 'password'}
                label="New password"
                value={password}
                onChange={setPassword}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-1 min-w-11 min-h-11 flex items-center justify-center top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink-2 transition-colors"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Confirm password */}
            <FloatingInput
              type={showPw ? 'text' : 'password'}
              label="Confirm password"
              value={confirm}
              onChange={setConfirm}
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full py-[15px] rounded-[14px] text-[14px] font-semibold tracking-[0.04em] transition-all active:scale-[0.98] disabled:opacity-50 mt-2"
              style={{
                background: loading ? 'rgb(var(--t-brand) / 0.5)' : 'rgb(var(--t-brand))',
                color: 'rgb(var(--t-ground))',
                fontFamily: 'var(--t-font)',
              }}
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>

          </form>
        )}
      </div>
    </div>
  )
}

function FloatingInput({
  type, label, value, onChange,
}: {
  type: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const [focused, setFocused] = useState(false)
  const id = label.toLowerCase().replace(/\s/g, '-')

  return (
    <div className="relative">
      <label
        htmlFor={id}
        className="absolute left-4 transition-all pointer-events-none"
        style={{
          fontFamily: 'var(--t-font)',
          fontSize: focused || value ? 10 : 14,
          top: focused || value ? 10 : '50%',
          transform: focused || value ? 'none' : 'translateY(-50%)',
          color: focused ? 'rgb(var(--t-brand))' : 'rgb(var(--t-ink-3))',
          letterSpacing: focused || value ? '0.08em' : '0',
          textTransform: focused || value ? 'uppercase' : 'none',
          fontWeight: focused || value ? 500 : 400,
        }}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required
        autoComplete="new-password"
        className="w-full outline-none transition-all text-[15px]"
        style={{
          background: 'rgb(var(--t-raised))',
          border: `1px solid ${focused ? 'rgb(var(--t-brand) / 0.35)' : 'rgb(var(--t-line))'}`,
          borderRadius: 14,
          padding: value || focused ? '24px 16px 10px' : '16px',
          color: 'rgb(var(--t-ink))',
          fontFamily: 'var(--t-font)',
          caretColor: 'rgb(var(--t-brand))',
        }}
      />
    </div>
  )
}
