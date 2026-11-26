import { api } from './lib.jsx';

// Queue alerts on the candidate's phone, through the browser's push service.
// State: 'unsupported' | 'ios-install' (iPhone: add to Home Screen first) | 'blocked' | 'off' | 'on'.

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function keyBytes(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const registration = () => navigator.serviceWorker.register('/sw.js');

export async function pushState() {
  if (!pushSupported()) return isIos() && !standalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub && Notification.permission === 'granted') {
      // Keep the server's copy fresh (it may have been dropped, or saved for another login).
      api('/me/push', { method: 'POST', body: { subscription: sub.toJSON() } }).catch(() => {});
      return 'on';
    }
  } catch {
    /* falls through to off */
  }
  return 'off';
}

// Asks for permission (this must run from a tap), subscribes this phone and tells the server.
export async function turnOnPush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const { key } = await api('/push/key');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  await api('/me/push', { method: 'POST', body: { subscription: sub.toJSON() } });
  return 'on';
}

export async function turnOffPush() {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await api('/me/push', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  }
  return 'off';
}

export const testPush = () => api('/me/push/test', { method: 'POST' });

// Right after logging in or registering, the candidate is asked once to allow alerts.
const ASK = 'jobfair_ask_push';
export function askForAlerts() {
  try {
    sessionStorage.setItem(ASK, '1');
  } catch {
    /* private mode: no prompt, the card on the dashboard still offers it */
  }
}
export function takeAskFlag() {
  try {
    const asked = sessionStorage.getItem(ASK) === '1';
    sessionStorage.removeItem(ASK);
    return asked;
  } catch {
    return false;
  }
}
