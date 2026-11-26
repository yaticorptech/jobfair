import webpush from 'web-push';
import { notifications, now, pushSubs, setSetting, settings } from './db.js';

// Push notifications to candidates' phones ("It's your turn at desk 3"). The server's VAPID keys
// come from .env if given, otherwise they are made once and kept in the database, so the
// subscriptions phones already hold keep working after a restart.
async function loadKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const row = await settings.findOne({ _id: 'vapid_keys' });
  if (row) return JSON.parse(row.value);
  const keys = webpush.generateVAPIDKeys();
  await setSetting('vapid_keys', JSON.stringify(keys));
  return keys;
}

const keys = await loadKeys();
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:noreply@example.com', keys.publicKey, keys.privateKey);

export const pushPublicKey = keys.publicKey;

// Keeps a phone's subscription for a candidate. The same phone subscribing again replaces it.
export async function saveSubscription(candidateId, sub) {
  const endpoint = String(sub?.endpoint ?? '');
  const p256dh = String(sub?.keys?.p256dh ?? '');
  const auth = String(sub?.keys?.auth ?? '');
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) return false;
  await pushSubs.updateOne(
    { endpoint },
    { $set: { candidate_id: candidateId, endpoint, keys: { p256dh, auth }, updated_at: new Date() } },
    { upsert: true },
  );
  return true;
}

export const removeSubscription = (candidateId, endpoint) => pushSubs.deleteOne({ candidate_id: candidateId, endpoint: String(endpoint ?? '') });

// Sends one alert to every phone of a candidate. Never throws: an alert that cannot be delivered
// must not stop the desk from calling the token. Subscriptions the browser has dropped are removed.
export async function notify(candidateId, { title, body, url = '/dashboard', tag }) {
  try {
    // Kept in the candidate's notification history (a test alert is not), even without a phone subscribed.
    if (tag !== 'test') await notifications.insertOne({ candidate_id: candidateId, title, body, url, tag: tag ?? '', created_at: now() });
    const subs = await pushSubs.find({ candidate_id: candidateId }).toArray();
    const payload = JSON.stringify({ title, body, url, tag });
    await Promise.all(
      subs.map((s) =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 600, urgency: 'high', topic: tag?.slice(0, 32) }).catch(async (err) => {
          if (err.statusCode === 404 || err.statusCode === 410) await pushSubs.deleteOne({ endpoint: s.endpoint });
        }),
      ),
    );
  } catch (err) {
    console.error('Push failed:', err.message);
  }
}

// Sends one alert to every phone that turned on alerts (an announcement to all candidates), a
// few dozen at a time so a large fair does not open thousands of connections at once.
export async function notifyEveryone(message) {
  const subs = await pushSubs.find({}, { projection: { _id: 0, endpoint: 1, keys: 1 } }).toArray();
  const payload = JSON.stringify(message);
  let sent = 0;
  for (let i = 0; i < subs.length; i += 50) {
    await Promise.all(
      subs.slice(i, i + 50).map((s) =>
        webpush
          .sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 3600, urgency: 'high' })
          .then(() => {
            sent += 1;
          })
          .catch(async (err) => {
            if (err.statusCode === 404 || err.statusCode === 410) await pushSubs.deleteOne({ endpoint: s.endpoint });
          }),
      ),
    );
  }
  return sent;
}
