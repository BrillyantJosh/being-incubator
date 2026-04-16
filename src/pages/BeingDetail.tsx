import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function BeingDetail() {
  const { name } = useParams();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen px-4 py-6 sm:p-6 bg-gradient-to-br from-background via-background to-secondary safe-bottom">
      <div className="mx-auto max-w-xl space-y-6">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <Card className="space-y-4">
          <h1 className="font-display text-3xl font-semibold">{name}</h1>
          <p className="text-muted-foreground">
            This Being is alive on its own domain. Visit it there.
          </p>
          <Button asChild size="lg" className="w-full">
            <a href={`https://${name}.lana.is`} target="_blank" rel="noreferrer">
              Open {name}.lana.is <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </Card>
      </div>
    </div>
  );
}
