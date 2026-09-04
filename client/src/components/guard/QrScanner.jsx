import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, CameraOff, Flashlight, FlashlightOff, Square, ZoomIn } from 'lucide-react';
import cn from '../../lib/cn.js';
import { reduceMotion } from '../../lib/motion.js';
import Spinner from '../ui/Spinner.jsx';
import Button from '../ui/Button.jsx';

// html5-qrcode is its own Vite chunk (see vite.config.js manualChunks) —
// fetching and parsing it is real time, and paying that cost only once the
// visitor taps "Start camera" makes the button feel slow for no reason. This
// warms the browser's module cache as soon as the module loads, so the
// `import()` in the start sequence below usually resolves instantly by the
// time anyone clicks. Cached as a function rather than a bare promise so a
// failed prefetch (offline, blocked request) doesn't permanently poison every
// later start attempt — a rejected import here is retried, not remembered.
let scannerLibraryPromise = null;
function loadScannerLibrary() {
  if (!scannerLibraryPromise) {
    scannerLibraryPromise = import('html5-qrcode').catch((err) => {
      scannerLibraryPromise = null;
      throw err;
    });
  }
  return scannerLibraryPromise;
}
loadScannerLibrary();

/** Straight-line distance between two touch points, for pinch-to-zoom. */
function touchDistance(touches) {
  const [a, b] = touches;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * Camera QR reader built on html5-qrcode.
 *
 * The lifecycle here is the whole job: React 18 StrictMode mounts effects twice
 * in development, and html5-qrcode throws if you start a running scanner or stop
 * one that never started. A start guard plus try/catch on teardown is what keeps
 * the camera from being left on.
 *
 * `active` is controlled by the caller — this never turns the camera on by
 * itself. `onToggle` is called when the visitor taps the Start/Stop control.
 */
export default function QrScanner({ onResult, onError, active = false, onToggle, className }) {
  const regionId = useId().replace(/:/g, '');
  const containerRef = useRef(null);
  const scannerRef = useRef(null);
  const startingRef = useRef(false);
  const lastResultRef = useRef({ text: '', at: 0 });
  const capabilitiesRef = useRef(null); // CameraCapabilities from the running track
  const audioCtxRef = useRef(null);
  const pinchRef = useRef({ startDistance: 0, startZoom: 0 });

  const [state, setState] = useState('idle'); // idle | starting | running | error
  const [message, setMessage] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [zoom, setZoom] = useState(null);
  const [zoomRange, setZoomRange] = useState(null); // { min, max, step }
  const [cameras, setCameras] = useState([]); // [{ id, label }]
  const [selectedCameraId, setSelectedCameraId] = useState(null); // null = auto (rear camera)

  const report = useCallback(
    (text) => {
      setState('error');
      setMessage(text);
      onError?.(text);
    },
    [onError]
  );

  // Unlocks audio playback on browsers (notably iOS Safari) that only allow
  // sound after a direct user gesture. Called from the Start-camera click —
  // priming here means the success beep later actually plays.
  const primeAudio = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      else if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    } catch {
      /* no Web Audio support — feedback silently degrades to vibration only */
    }
  };

  /** Short synthesized beep — no audio asset to ship or fetch. */
  const playBeep = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!active) {
      // Mirrors the teardown branch below: nothing to stop the first time
      // through, but if we just got toggled off, the visual state must catch
      // up — otherwise the viewfinder overlay stays on a dead video element.
      setState('idle');
      return undefined;
    }

    let cancelled = false;
    let instance = null;

    (async () => {
      if (startingRef.current) return;
      startingRef.current = true;
      setState('starting');
      setMessage('');
      setTorchOn(false);
      setTorchAvailable(false);
      setZoom(null);
      setZoomRange(null);

      try {
        const { Html5Qrcode } = await loadScannerLibrary();
        if (cancelled) return;

        // Enable native barcode detection where the browser has it (Chrome/
        // Edge) — it's meaningfully faster and lighter than the JS decoder
        // fallback. This is html5-qrcode's own default, spelled out here so
        // it survives a future library upgrade changing that default.
        instance = new Html5Qrcode(regionId, { verbose: false, useBarCodeDetectorIfSupported: true });
        scannerRef.current = instance;

        const cameraIdOrConfig = selectedCameraId ? selectedCameraId : { facingMode: 'environment' };
        // html5-qrcode treats `configuration.videoConstraints` as a full
        // replacement for the camera selection above, not a merge with it —
        // passing resolution hints there on their own would silently drop
        // whichever camera was picked. Folding the same selection into this
        // object is what actually keeps both working together.
        const videoConstraints = {
          ...(selectedCameraId ? { deviceId: { exact: selectedCameraId } } : { facingMode: 'environment' }),
          // Higher capture resolution reads smaller/farther QR codes more
          // reliably; devices too weak for this fall back to their max.
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        };

        // Going straight to start() instead of pre-checking Html5Qrcode.getCameras()
        // first: that pre-check is its own camera negotiation round trip, and
        // start() reports the same "no camera" / "permission denied" cases
        // through its rejection — skipping it gets the picture on screen sooner.
        await instance.start(
          cameraIdOrConfig,
          {
            fps: 15,
            qrbox: (w, h) => {
              const size = Math.floor(Math.min(w, h) * 0.72);
              return { width: size, height: size };
            },
            aspectRatio: 1,
            disableFlip: false,
            videoConstraints,
          },
          (decodedText) => {
            const now = Date.now();
            const last = lastResultRef.current;
            // The same code decodes many times a second; accept it once.
            if (decodedText === last.text && now - last.at < 2500) return;
            lastResultRef.current = { text: decodedText, at: now };

            playBeep();
            try {
              navigator.vibrate?.(200);
            } catch {
              /* not all devices support vibration */
            }

            instance
              .stop()
              .catch(() => {})
              .finally(() => {
                if (!cancelled) setState('idle');
                onResult?.(decodedText);
              });
          },
          () => {
            /* per-frame decode misses are normal and noisy — ignore */
          }
        );

        if (cancelled) return;
        setState('running');

        // Capabilities (torch, zoom) are only known once the track is live.
        try {
          const capabilities = instance.getRunningTrackCameraCapabilities();
          capabilitiesRef.current = capabilities;

          const torchFeature = capabilities.torchFeature();
          setTorchAvailable(torchFeature.isSupported());

          const zoomFeature = capabilities.zoomFeature();
          if (zoomFeature.isSupported()) {
            const min = zoomFeature.min();
            const max = zoomFeature.max();
            const step = zoomFeature.step() || (max - min) / 20 || 0.1;
            setZoomRange({ min, max, step });
            setZoom(zoomFeature.value() ?? min);
          }
        } catch {
          setTorchAvailable(false);
        }

        // Camera permission is granted now, so the device list comes back
        // with real labels instead of blank strings — populate the picker.
        try {
          const list = await Html5Qrcode.getCameras();
          if (!cancelled && Array.isArray(list)) setCameras(list);
        } catch {
          /* picker just stays empty — not fatal */
        }
      } catch (err) {
        if (!cancelled) {
          const text = String(err?.message || err);
          const nameOrText = `${err?.name || ''} ${text}`;
          report(
            /notfound|devicesnotfound/i.test(nameOrText)
              ? 'No camera found on this device. Use search or the code instead.'
              : /permission|notallowed/i.test(nameOrText)
                ? 'Camera permission denied. Allow camera access in your browser settings, or use Search instead.'
                : `Could not start the camera. ${text}`
          );
        }
      } finally {
        startingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      capabilitiesRef.current = null;
      const running = scannerRef.current;
      scannerRef.current = null;
      if (!running) return;
      // stop() rejects when it was never running — that is fine here.
      Promise.resolve()
        .then(() => running.stop())
        .catch(() => {})
        .then(() => {
          try {
            running.clear();
          } catch {
            /* already torn down */
          }
        });
    };
  }, [active, regionId, onResult, report, selectedCameraId]);

  const toggleTorch = async () => {
    const torchFeature = capabilitiesRef.current?.torchFeature();
    if (!torchFeature?.isSupported()) return;
    try {
      await torchFeature.apply(!torchOn);
      setTorchOn((v) => !v);
    } catch {
      setTorchAvailable(false);
    }
  };

  // Tracked in a ref (not just state) so the touch-listener effect below can
  // read the current zoom without needing `zoom` in its dependency array —
  // otherwise every zoom update mid-pinch would tear down and re-add the
  // native listeners while a gesture is still in progress.
  const zoomValueRef = useRef(null);
  useEffect(() => {
    zoomValueRef.current = zoom;
  }, [zoom]);

  const applyZoom = (value) => {
    const zoomFeature = capabilitiesRef.current?.zoomFeature();
    if (!zoomFeature?.isSupported() || !zoomRange) return;
    const clamped = Math.min(zoomRange.max, Math.max(zoomRange.min, value));
    setZoom(clamped);
    zoomFeature.apply(clamped).catch(() => {});
  };

  // Native (non-passive) touchmove listener: React's JSX onTouchMove is
  // registered passive by default, so preventDefault() inside it is silently
  // ignored — the page would scroll/zoom instead of the video feed zooming.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !zoomRange) return undefined;

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        pinchRef.current = { startDistance: touchDistance(e.touches), startZoom: zoomValueRef.current ?? zoomRange.min };
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length !== 2 || !pinchRef.current.startDistance) return;
      e.preventDefault();
      const scale = touchDistance(e.touches) / pinchRef.current.startDistance;
      const range = zoomRange.max - zoomRange.min;
      const raw = pinchRef.current.startZoom + (scale - 1) * range;
      const stepped = Math.round(raw / zoomRange.step) * zoomRange.step;
      applyZoom(stepped);
    };
    const onTouchEnd = () => {
      pinchRef.current.startDistance = 0;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomRange]);

  return (
    <div
      ref={containerRef}
      style={{ touchAction: zoomRange ? 'none' : undefined }}
      className={cn('relative overflow-hidden rounded-2xl bg-ink-900', className)}
    >
      <div id={regionId} className="aspect-square w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />

      {/* Corner brackets + sweep line */}
      {state === 'running' && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute inset-[14%] rounded-2xl">
            {[
              'left-0 top-0 border-l-2 border-t-2 rounded-tl-xl',
              'right-0 top-0 border-r-2 border-t-2 rounded-tr-xl',
              'left-0 bottom-0 border-l-2 border-b-2 rounded-bl-xl',
              'right-0 bottom-0 border-r-2 border-b-2 rounded-br-xl',
            ].map((pos) => (
              <span key={pos} className={cn('absolute h-9 w-9 border-brand-400', pos)} />
            ))}
            {!reduceMotion && (
              <motion.span
                className="absolute inset-x-2 h-0.5 rounded-full bg-brand-400/80 shadow-[0_0_12px_2px_rgba(79,110,247,0.6)]"
                initial={{ top: '4%' }}
                animate={{ top: ['4%', '96%', '4%'] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </div>
        </div>
      )}

      {state === 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-900 px-6 text-center">
          <Camera size={30} className="text-white/50" aria-hidden="true" />
          <p className="text-sm text-white/80">Camera is off.</p>
          <Button
            size="sm"
            icon={Camera}
            onClick={() => {
              primeAudio();
              onToggle?.();
            }}
          >
            Start camera
          </Button>
        </div>
      )}

      {state === 'starting' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-900 text-white/80">
          <Spinner size="lg" />
          <p className="text-sm">Starting camera…</p>
        </div>
      )}

      {state === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-900 px-6 text-center">
          <CameraOff size={30} className="text-white/50" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-white/80">{message}</p>
        </div>
      )}

      {/* Bottom control bar: Stop · zoom slider · torch — only while running */}
      {state === 'running' && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-ink-900/90 to-transparent px-3 pb-3 pt-8">
          <button
            type="button"
            onClick={onToggle}
            aria-label="Stop camera"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-900/60 text-white backdrop-blur transition-colors hover:bg-ink-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Square size={16} aria-hidden="true" />
          </button>

          {zoomRange && (
            <div className="flex flex-1 items-center gap-2 rounded-full bg-ink-900/60 px-3 py-1.5 backdrop-blur">
              <ZoomIn size={15} className="shrink-0 text-white/70" aria-hidden="true" />
              <input
                type="range"
                aria-label="Zoom"
                min={zoomRange.min}
                max={zoomRange.max}
                step={zoomRange.step}
                value={zoom ?? zoomRange.min}
                onChange={(e) => applyZoom(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer accent-brand-400"
              />
            </div>
          )}

          {torchAvailable && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-label={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
              aria-pressed={torchOn}
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full backdrop-blur transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
                torchOn ? 'bg-white text-ink-900' : 'bg-ink-900/60 text-white'
              )}
            >
              {torchOn ? <Flashlight size={17} /> : <FlashlightOff size={17} />}
            </button>
          )}
        </div>
      )}

      {/* Camera picker — appears once permission is granted and there is a choice */}
      {state === 'running' && cameras.length > 1 && (
        <select
          aria-label="Choose camera"
          value={selectedCameraId || ''}
          onChange={(e) => setSelectedCameraId(e.target.value || null)}
          className="absolute right-3 top-3 max-w-[9.5rem] truncate rounded-full border border-white/20 bg-ink-900/60 px-3 py-1.5 text-xs text-white backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <option value="">Auto (rear)</option>
          {cameras.map((cam) => (
            <option key={cam.id} value={cam.id}>
              {cam.label || cam.id}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
