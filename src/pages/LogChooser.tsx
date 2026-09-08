import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { Goal } from 'lucide-react';

const LogChooser = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate('/');
  }, [loading, user, navigate]);

  return (
    <div className="app-container flex flex-col min-h-screen bg-background">
      <div className="flex-1 flex flex-col items-center justify-start pt-20 px-[18px] pb-24 text-center">
        <h1 className="text-[26px] text-foreground mb-7">
          What are you logging?
        </h1>
        <div className="w-full max-w-[320px]">
          <button
            onClick={() => navigate('/log/match')}
            className="w-full flex flex-col items-center justify-center gap-3 rounded-[18px] p-7 border border-primary/20 cursor-pointer transition-all active:scale-95 active:border-primary bg-card"
          >
            <Goal size={48} strokeWidth={1.25} className="text-primary" />
            <div className="text-center">
              <p className="text-[22px] text-foreground">Match</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">Log a match and<br/>compute your rating</p>
            </div>
          </button>
        </div>
        <div className="absolute bottom-24 left-0 right-0 flex justify-center">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-sm text-muted-foreground px-8 py-2.5 bg-secondary rounded-xl"
          >
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogChooser;
