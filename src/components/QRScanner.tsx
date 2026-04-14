import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Button } from '@/components/ui/Button';
import { X, QrCode, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
  title?: string;
  description?: string;
}

const PW = 640;
const PH = 360;

export function QRScanner({ isOpen, onClose, onScan, title = 'Scan QR', description = 'Point camera at QR code' }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const doneRef = useRef(false);
  const grayRef = useRef(new Uint8Array(PW * PH));
  const integralRef = useRef(new Int32Array((PW + 1) * (PH + 1)));
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    doneRef.current = false;
    setError(null);
    const timer = setTimeout(() => startCamera(), 150);
    return () => {
      clearTimeout(timer);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const adaptiveThreshold = (imageData: ImageData) => {
    const { data, width, height } = imageData;
    const gray = grayRef.current;
    const integral = integralRef.current;
    const S = 8;
    const T = 0.85;
    const w1 = width + 1;
    for (let i = 0, j = 0; j < data.length; i++, j += 4) {
      gray[i] = (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) | 0;
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        integral[(y + 1) * w1 + (x + 1)] =
          gray[y * width + x] +
          integral[y * w1 + (x + 1)] +
          integral[(y + 1) * w1 + x] -
          integral[y * w1 + x];
      }
    }
    for (let y = 0; y < height; y++) {
      const y1 = Math.max(0, y - S);
      const y2 = Math.min(height - 1, y + S);
      for (let x = 0; x < width; x++) {
        const x1 = Math.max(0, x - S);
        const x2 = Math.min(width - 1, x + S);
        const cnt = (y2 - y1 + 1) * (x2 - x1 + 1);
        const sum =
          integral[(y2 + 1) * w1 + (x2 + 1)] -
          integral[y1 * w1 + (x2 + 1)] -
          integral[(y2 + 1) * w1 + x1] +
          integral[y1 * w1 + x1];
        const val = gray[y * width + x] < (sum / cnt) * T ? 0 : 255;
        const j = (y * width + x) * 4;
        data[j] = data[j + 1] = data[j + 2] = val;
      }
    }
  };

  const scanFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || doneRef.current) {
      animRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      animRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    canvas.width = PW;
    canvas.height = PH;
    ctx.drawImage(video, 0, 0, PW, PH);
    const imageData = ctx.getImageData(0, 0, PW, PH);
    adaptiveThreshold(imageData);
    const code = jsQR(imageData.data, PW, PH, { inversionAttempts: 'attemptBoth' });
    if (code && !doneRef.current) {
      doneRef.current = true;
      cleanup();
      onScan(code.data);
      onClose();
      return;
    }
    animRef.current = requestAnimationFrame(scanFrame);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsScanning(true);
        setError(null);
        animRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Cannot access camera. Grant permission and try again.');
    }
  };

  const cleanup = () => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  };

  const handleClose = () => {
    cleanup();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative aspect-square overflow-hidden rounded-lg bg-background">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />
            {!isScanning && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
            {isScanning && (
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute left-0 top-0 h-10 w-10 rounded-tl-lg border-l-4 border-t-4 border-primary" />
                <div className="absolute right-0 top-0 h-10 w-10 rounded-tr-lg border-r-4 border-t-4 border-primary" />
                <div className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-lg border-b-4 border-l-4 border-primary" />
                <div className="absolute bottom-0 right-0 h-10 w-10 rounded-br-lg border-b-4 border-r-4 border-primary" />
              </div>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleClose} variant="outline" className="w-full">
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
