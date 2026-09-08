import { useEffect, useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { MetadataLabel } from '@/components/trak'
import { toast } from 'sonner'

interface Invite {
  id: string
  parent_email: string
  invite_token: string
  status: string
}

/**
 * Lets a player invite a parent and, crucially, actually deliver the invite.
 * The token link is shown so it can be shared over whatever messenger the
 * family already uses — nothing emails it automatically.
 */
export function ParentInviteCard() {
  const { user } = useAuth()
  const [invites, setInvites] = useState<Invite[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  // Shown when share and clipboard both fail (permissions, older browsers)
  // so the player can always select the link by hand rather than being stuck.
  const [revealed, setRevealed] = useState<string | null>(null)

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    const { data } = await supabase.rpc('get_player_invites_for_current_user')
    setInvites((data ?? []) as Invite[])
  }

  function linkFor(token: string) {
    return `${window.location.origin}/parent-invite?token=${token}`
  }

  async function handleCreate() {
    const value = email.trim()
    if (!value || !value.includes('@')) { toast.error('Enter your parent’s email'); return }
    setBusy(true)
    const { error } = await supabase.rpc('create_parent_invite', { p_email: value })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    setEmail('')
    toast.success('Invite created — now send them the link')
    load()
  }

  async function handleShare(invite: Invite) {
    const url = linkFor(invite.invite_token)
    const text = `Follow my progress on Trak: ${url}`
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Trak', text, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(invite.id)
      setTimeout(() => setCopied(null), 2000)
      toast.success('Link copied')
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      // Never leave the player stranded — show the link so they can copy it
      // themselves rather than failing with nothing to act on.
      setRevealed(invite.id)
      toast.message('Copy this link and send it to your parent')
    }
  }

  const pending = invites.filter(i => i.status === 'pending')
  const accepted = invites.filter(i => i.status !== 'pending')

  return (
    <div className="rounded-[18px] p-4 border border-white/[0.07] bg-[#101012]">
      <MetadataLabel text="PARENT ACCESS" />
      <p className="text-[12px] text-white/55 mt-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        Invite a parent to follow your matches and coach feedback.
      </p>

      {pending.map(invite => (
        <div key={invite.id} className="mt-3 rounded-[14px] p-3 bg-white/[0.03] border border-white/[0.06]">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] text-white/85 truncate" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {invite.parent_email}
              </p>
              <p className="text-[11px] text-white/40 mt-0.5" style={{ fontFamily: "'DM Mono', monospace" }}>
                WAITING TO JOIN
              </p>
            </div>
            <button
              onClick={() => handleShare(invite)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-[12px] font-medium"
              style={{ background: '#C8F25A', color: '#0A0A0B' }}
            >
              {copied === invite.id
                ? <><Check size={13} /> Copied</>
                : <>{typeof navigator.share === 'function' ? <Share2 size={13} /> : <Copy size={13} />} Send link</>}
            </button>
          </div>

          {revealed === invite.id && (
            <p
              className="mt-2 text-[11px] text-white/60 break-all select-all"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              {linkFor(invite.invite_token)}
            </p>
          )}
        </div>
      ))}

      {accepted.map(invite => (
        <div key={invite.id} className="mt-3 flex items-center gap-2">
          <Check size={14} color="#C8F25A" />
          <p className="text-[13px] text-white/70 truncate" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            {invite.parent_email} joined
          </p>
        </div>
      ))}

      {pending.length === 0 && (
        <div className="mt-3 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Parent’s email"
            className="flex-1 min-w-0 rounded-[10px] px-3 py-2 text-[13px] bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/30 outline-none focus:border-white/20"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          />
          <button
            onClick={handleCreate}
            disabled={busy}
            className="shrink-0 px-3 py-2 rounded-[10px] text-[12px] font-medium disabled:opacity-50"
            style={{ background: '#C8F25A', color: '#0A0A0B' }}
          >
            {busy ? 'Adding…' : 'Invite'}
          </button>
        </div>
      )}
    </div>
  )
}
