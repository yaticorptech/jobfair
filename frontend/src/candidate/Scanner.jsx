import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { Camera, CameraOff, ImageUp, RefreshCw } from 'lucide-react';
import { Button, Card, Spinner } from '../ui.jsx';

// A desk QR code holds an address ending in /c/<company number>. Only that number is used, and
// the company is opened inside this site, so a scanned code can never lead to another website.
export function companyIdFrom(text) {
  const match = /\/c\/(\d{1,12})\/?(?:[?#].*)?$/.exec(String(text ?? '').trim());
  return match ? match[1] : null;
}

const NOT_OURS = 'That is not a desk QR code of this job fair. Scan the QR code on the poster at a company’s interview desk.';

// The company registration QR code is for companies (an address ending in /r/<code>).
const isCompanyCode = (text) => /\/r\/[0-9A-Za-z]{6,16}\/?(?:[?#].*)?$/.test(String(text ?? '').trim());
const FOR_COMPANY = 'That QR code is for companies to register. Scan a desk QR code: the poster with the big desk number.';
const problemWith = (text) => (isCompanyCode(text) ? FOR_COMPANY : NOT_OURS);

// Why the live camera cannot be used, in words a candidate can act on.
const PROBLEMS = {
  unavailable: {
    title: 'The live camera cannot be used on this page',
    text: 'Use the button below to take a photo of the QR code instead. It works the same way.',
  },
  blocked: {
    title: 'Camera permission is blocked',
    text: 'Allow the camera for this site in your browser settings and try again, or take a photo of the QR code instead.',
    retry: true,
  },
  nocamera: {
    title: 'No camera was found',
    text: 'This device has no camera the browser can use. Open this page on your phone, or take a photo of the QR code instead.',
    retry: true,
  },
  error: {
    title: 'The camera could not be started',
    text: 'Another app may be using it. Close other camera apps and try again, or take a photo of the QR code instead.',
    retry: true,
  },
};

function readPixels(source, width, height, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

async function loadPhoto(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* some browsers cannot decode every photo format this way; try the other way below */
    }
  }
  const url = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// The live camera view with a "take a photo instead" fallback. Candidates use it to open a company;
// companies use it to activate the QR code at their desk.
// onText(text) is given what a QR code says. It returns nothing when that was the right kind of
// code (the reader then stops looking), or the message to show when it was not. It may take its
// time: a company's scan is checked by the server.
export function QrReader({ onText, footer }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('starting'); // starting | scanning | one of PROBLEMS
  const [note, setNote] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [reading, setReading] = useState(false);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  // The last code that was refused: while it stays in front of the camera it is not asked about again.
  const refused = useRef({ text: '', at: 0 });

  // True when the code was accepted.
  const handle = useCallback(async (text) => {
    if (text === refused.current.text && Date.now() - refused.current.at < 4000) return false;
    const problem = await onTextRef.current(text);
    if (!problem) {
      navigator.vibrate?.(60);
      return true;
    }
    refused.current = { text, at: Date.now() };
    setNote(problem);
    return false;
  }, []);

  useEffect(() => {
    // Browsers only give the camera to pages opened with https (or on this computer itself).
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable');
      return undefined;
    }
    let stopped = false;
    let stream = null;
    let timer = null;
    setStatus('starting');

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (err) {
        if (stopped) return;
        if (err.name === 'NotAllowedError' || err.name === 'SecurityError') setStatus('blocked');
        else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') setStatus('nocamera');
        else setStatus('error');
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const video = videoRef.current;
      video.srcObject = stream;
      // Not waited for: on some phones this never finishes when the camera gives no picture.
      video.play().catch(() => {});

      // Phones that can read QR codes themselves do it faster; the others use the built-in reader.
      let detector = null;
      if ('BarcodeDetector' in window) {
        try {
          const formats = await window.BarcodeDetector.getSupportedFormats();
          if (formats.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        } catch {
          detector = null;
        }
      }
      if (stopped) return;

      const startedAt = Date.now();
      let seeing = false;
      const tick = async () => {
        if (stopped) return;
        let text = null;
        const hasPicture = video.readyState >= 2 && video.videoWidth > 0;
        if (hasPicture && !seeing) {
          seeing = true;
          setStatus('scanning');
        }
        if (!seeing && Date.now() - startedAt > 8000) {
          // The camera was opened but shows nothing (often because another app is using it).
          stopped = true;
          stream.getTracks().forEach((track) => track.stop());
          setStatus('error');
          return;
        }
        if (hasPicture) {
          try {
            if (detector) {
              text = (await detector.detect(video))[0]?.rawValue || null;
            } else {
              const image = readPixels(video, video.videoWidth, video.videoHeight, 800);
              text = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data || null;
            }
          } catch {
            detector = null; // fall back to the built-in reader for the next frames
          }
        }
        if (stopped) return;
        if (text && (await handle(text))) return;
        if (stopped) return;
        timer = setTimeout(tick, 150);
      };
      tick();
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [attempt, handle]);

  async function fromPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setNote('');
    setReading(true);
    try {
      const photo = await loadPhoto(file);
      let text = null;
      // Phone photos are large; a smaller copy is tried first because it is read much faster.
      for (const maxSide of [1000, 2000]) {
        const image = readPixels(photo, photo.width, photo.height, maxSide);
        text = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data || null;
        if (text) break;
      }
      if (!text) setNote('No QR code was found in that photo. Hold the phone straight, bring the QR code closer and try again.');
      else {
        refused.current = { text: '', at: 0 }; // a photo is a fresh try, also of a code that was refused a moment ago
        await handle(text);
      }
    } catch {
      setNote('That photo could not be read. Please try again.');
    } finally {
      setReading(false);
    }
  }

  const live = status === 'starting' || status === 'scanning';
  const problem = PROBLEMS[status];

  return (
    <div className="space-y-4">
      {live && (
        <div className="relative aspect-square overflow-hidden rounded-3xl bg-slate-900">
          <video ref={videoRef} muted playsInline autoPlay className="size-full object-cover" aria-label="Camera view" />
          {/* Frame that shows where to hold the QR code */}
          <div className="pointer-events-none absolute inset-[14%]" aria-hidden="true">
            <span className="absolute left-0 top-0 size-10 rounded-tl-2xl border-l-4 border-t-4 border-amber-400" />
            <span className="absolute right-0 top-0 size-10 rounded-tr-2xl border-r-4 border-t-4 border-amber-400" />
            <span className="absolute bottom-0 left-0 size-10 rounded-bl-2xl border-b-4 border-l-4 border-amber-400" />
            <span className="absolute bottom-0 right-0 size-10 rounded-br-2xl border-b-4 border-r-4 border-amber-400" />
          </div>
          {status === 'starting' ? (
            <div className="absolute inset-0 grid place-items-center bg-slate-900 text-center text-sm font-semibold text-white">
              <span>
                <Spinner className="mx-auto size-8 text-amber-300" />
                <span className="mt-3 block">Starting the camera…</span>
                <span className="mt-1 block text-xs font-normal text-slate-300">If your phone asks, tap Allow.</span>
              </span>
            </div>
          ) : (
            <p className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-4 pb-4 pt-8 text-center text-sm font-semibold text-white">
              Hold the QR code inside the frame
            </p>
          )}
        </div>
      )}

      {problem && (
        <Card className="p-5 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500">
            <CameraOff className="size-6" aria-hidden="true" />
          </span>
          <p className="mt-3 font-bold text-slate-900">{problem.title}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">{problem.text}</p>
          {problem.retry && (
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => setAttempt((n) => n + 1)}>
              <RefreshCw className="size-4" aria-hidden="true" /> Try the camera again
            </Button>
          )}
        </Card>
      )}

      {note && (
        <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
          {note}
        </p>
      )}

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-bold text-slate-900">
          <Camera className="size-5 text-blue-700" aria-hidden="true" /> {live ? 'Camera not working?' : 'Take a photo instead'}
        </h2>
        <p className="mt-1 text-sm text-slate-600">Take a photo of the QR code and it will be read from the photo.</p>
        {/* A label around a hidden file field: on a phone this opens the camera to take one photo. */}
        <label className="mt-3 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-700 sm:w-auto">
          {reading ? <Spinner className="size-4 text-white" /> : <ImageUp className="size-4" aria-hidden="true" />}
          {reading ? 'Reading the photo…' : 'Take a photo of the QR code'}
          <input type="file" accept="image/*" capture="environment" onChange={fromPhoto} disabled={reading} className="sr-only" />
        </label>
        {footer && <p className="mt-3 text-xs text-slate-500">{footer}</p>}
      </Card>
    </div>
  );
}

// The Scan QR tab of the candidate dashboard.
export default function Scanner() {
  const navigate = useNavigate();

  // Opens the company when the text is one of our desk codes.
  const open = useCallback(
    (text) => {
      const id = companyIdFrom(text);
      if (!id) return problemWith(text);
      navigate(`/c/${id}`);
      return '';
    },
    [navigate],
  );

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Scan a desk QR code</h1>
        <p className="mt-1 text-sm text-slate-600">
          Point the camera at the QR code on the poster at a company&rsquo;s interview desk. You will see the company, its open positions and vacancies, and you can apply.
        </p>
      </div>
      <QrReader onText={open} footer="You can also find any company and its interview desk in the Companies tab." />
    </div>
  );
}
