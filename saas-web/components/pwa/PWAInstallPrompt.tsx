'use client';

import { useState, useEffect } from 'react';
import { X, Share, PlusSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PWAInstallPrompt() {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true); // Default to true to prevent hydration mismatch
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Detect iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
    
    // Check if already installed (running in standalone mode)
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || 
                             (window.navigator as any).standalone === true;

    setIsIOS(isIOSDevice && isSafari);
    setIsStandalone(isStandaloneMode);

    // Show prompt only if on iOS Safari, not installed, and hasn't dismissed recently
    if (isIOSDevice && isSafari && !isStandaloneMode) {
      const dismissed = localStorage.getItem('pwa-prompt-dismissed');
      if (!dismissed || Date.now() - parseInt(dismissed) > 86400000) { // 24 hours
        // Small delay to not annoy the user immediately
        const timer = setTimeout(() => setShowPrompt(true), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const dismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-prompt-dismissed', Date.now().toString());
  };

  if (!showPrompt || !isIOS || isStandalone) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-card border shadow-xl rounded-2xl p-4 animate-in slide-in-from-bottom-5">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="font-semibold text-base mb-1">Install MoveCar App</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Add to your home screen to receive instant push alerts when someone scans your car.
          </p>
          <div className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded-lg">
            <span>1. Tap</span> <Share className="w-4 h-4 text-blue-500" />
            <span>2. Scroll down & tap</span>
            <span className="font-medium flex items-center gap-1">
              Add to Home Screen <PlusSquare className="w-4 h-4" />
            </span>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="-mt-2 -mr-2" onClick={dismiss}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}