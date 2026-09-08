import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { RatingBandPill } from '@/lib/ratingBand';
import { User as UserIcon, Star, MessageCircle } from 'lucide-react';

const CoachPlayerProfile = () => {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [player, setPlayer] = useState<any>(null);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [showRequest, setShowRequest] = useState(false);
  const [requestReason, setRequestReason] = useState('');

  useEffect(() => {
    if (!user || !id) return;
    supabase.from('squad_players').select('*').eq('id', id).eq('coach_user_id', user.id).maybeSingle()
      .then(({ data }) => setPlayer(data));
    supabase.from('coach_assessments').select('*, coach_sessions(title, session_type)')
      .eq('squad_player_id', id).eq('coach_user_id', user.id).order('created_at', { ascending: false })
      .then(async ({ data }) => {
        const list = data || [];
        setAssessments(list);
        if (list.length) {
          const { data: notes } = await supabase.from('coach_assessment_notes')
            .select('assessment_id, note')
            .in('assessment_id', list.map((a: any) => a.id));
          const map: Record<string, string> = {};
          notes?.forEach((n: any) => { map[n.assessment_id] = n.note });
          setNotesById(map);
        }
      });
  }, [user, id]);

  const handleRequest = async () => {
    if (!user || !id) return;
    const { error } = await supabase.from('meeting_requests').insert({
      coach_user_id: user.id,
      squad_player_id: id,
      reason: requestReason || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Meeting request sent!');
    setShowRequest(false);
    setRequestReason('');
  };

  if (!player) return <div className="app-container flex items-center justify-center min-h-screen text-foreground">Loading...</div>;

  const avgCoach = assessments.length > 0
    ? (assessments.reduce((s, a) => s + Number(a.coach_rating), 0) / assessments.length).toFixed(1)
    : '—';

  return (
    <div className="app-container px-[18px] py-6 pb-8">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/coach/squad')} className="w-[34px] h-[34px] bg-secondary border border-border rounded-[10px] flex items-center justify-center text-foreground text-sm">←</button>
        <span className="text-[26px] text-foreground">Player profile</span>
      </div>

      {/* Player Header */}
      <div className="rounded-2xl p-4 mb-4 border border-border bg-card">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-[52px] h-[52px] rounded-[14px] bg-primary/15 flex items-center justify-center flex-shrink-0">
            <UserIcon size={22} className="text-primary" />
          </div>
          <div>
            <h2 className="text-xl text-foreground">{player.player_name}</h2>
            <p className="text-[11px] text-muted-foreground">{player.position} {player.age ? `· Age ${player.age}` : ''} {player.shirt_number ? `· #${player.shirt_number}` : ''}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center rounded-lg py-2 bg-secondary flex flex-col items-center justify-center">
            {avgCoach !== '—' ? <RatingBandPill rating={Number(avgCoach)} /> : <p className="text-2xl leading-none text-foreground">—</p>}
            <p className="section-label mt-1">Coach Avg</p>
          </div>
          <div className="text-center rounded-lg py-2 bg-secondary">
            <p className="text-2xl text-primary leading-none">—</p>
            <p className="section-label mt-1">Computed</p>
          </div>
          <div className="text-center rounded-lg py-2 bg-secondary">
            <p className="text-2xl text-foreground leading-none">{assessments.length}</p>
            <p className="section-label mt-1">Assessed</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        <button onClick={() => navigate('/coach/assess')}
          className="rounded-[10px] py-3 bg-primary text-primary-foreground text-sm font-medium inline-flex items-center justify-center gap-1.5">
          <Star size={14} /> New Assessment
        </button>
        <button onClick={() => setShowRequest(!showRequest)}
          className="bg-card border border-border rounded-[10px] py-3 text-foreground text-sm font-medium inline-flex items-center justify-center gap-1.5">
          <MessageCircle size={14} /> Request 1-on-1
        </button>
      </div>

      {/* Meeting Request */}
      {showRequest && (
        <div className="bg-card border border-border rounded-xl p-4 mb-4 space-y-3">
          <Input placeholder="Reason (optional)" value={requestReason} onChange={e => setRequestReason(e.target.value)} className="bg-secondary border-border" />
          <button onClick={handleRequest}
            className="w-full rounded-[10px] py-3 bg-primary text-primary-foreground text-sm font-medium">
            Send Request →
          </button>
        </div>
      )}

      {/* Assessment History */}
      <p className="section-label mb-3">Assessment History</p>
      {assessments.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-4 text-center">
          <p className="text-xs text-muted-foreground">No assessments yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assessments.map(a => (
            <div key={a.id} className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{(a.coach_sessions as any)?.title || 'General'}</p>
                  <p className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleDateString()} · {a.appearance || ''}</p>
                </div>
                <RatingBandPill rating={Number(a.coach_rating)} />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { l: 'Work Rate', v: a.work_rate },
                  { l: 'Tactical', v: a.tactical },
                  { l: 'Attitude', v: a.attitude },
                  { l: 'Technical', v: a.technical },
                  { l: 'Physical', v: a.physical },
                  { l: 'Coachability', v: a.coachability },
                ].map(c => (
                  <span key={c.l} className="text-[10px] text-muted-foreground">{c.l} <span className="text-foreground font-medium">{c.v}</span></span>
                ))}
              </div>
              {notesById[a.id] && (
                <p className="text-xs text-muted-foreground mt-2 border-l-2 border-coach-orange/40 pl-2 italic">{notesById[a.id]}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CoachPlayerProfile;
