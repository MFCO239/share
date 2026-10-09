/**
 * Marco Fishing Co. guest uploads -> Google Drive ("MFCO Raw Footage/Guest Uploads").
 *
 * The share page (GitHub Pages) asks this script for a one-time Google Drive upload link per file,
 * then sends the file straight to Google. The page never sees a password or token.
 * Deploy: Extensions > Apps Script > Deploy > Web app, Execute as: Me, Who has access: Anyone.
 */

const FOLDER_ID = '1EbfegnpqRH_JXy0Rv6NiPB1BrZ-JIgIp';
const ORIGIN = 'https://share.marcofishingcompany.com';           // the share page's address
const MAX_BYTES = 4 * 1024 * 1024 * 1024;             // 4 GB per file
const MAX_PER_HOUR = 300;                             // upload links handed out per hour, all guests
const OK_TYPES = /^(image|video)\//;

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ error: 'bad request' });
  }
  if (req.action === 'start') return start(req);
  if (req.action === 'done') return done(req);
  return reply({ error: 'unknown action' });
}

function doGet() {
  return reply({ ok: true });
}

function start(req) {
  const size = Number(req.size);
  const type = String(req.type || '');
  if (!OK_TYPES.test(type)) return reply({ error: 'Photos and videos only.' });
  if (!(size > 0) || size > MAX_BYTES) return reply({ error: 'That file is too big (4 GB max).' });
  if (!underLimit()) return reply({ error: 'Lots of uploads right now. Please try again in an hour.' });

  const stamp = Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd HHmm');
  const guest = clean(req.guest).slice(0, 40) || 'guest';
  const name = `${stamp} ${guest} - ${clean(req.name).slice(0, 80) || 'upload'}`;

  const res = UrlFetchApp.fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
        'X-Upload-Content-Type': type,
        'X-Upload-Content-Length': String(size),
        Origin: ORIGIN,                              // lets the browser send the file to Google
      },
      payload: JSON.stringify({ name: name, parents: [FOLDER_ID] }),
      muteHttpExceptions: true,
    });
  const url = res.getHeaders()['Location'] || res.getHeaders()['location'];
  if (!url) return reply({ error: 'Upload could not start. Please try again.' });
  return reply({ url: url });
}

function done(req) {
  // One small note per visit: who sent what, and that they said we can post it.
  const lines = [
    'Guest upload ' + new Date().toISOString(),
    'Name: ' + clean(req.guest).slice(0, 60),
    'Trip date: ' + clean(req.tripDate).slice(0, 20),
    'Captain: ' + clean(req.captain).slice(0, 40),
    'OK to post: ' + (req.consent === true ? 'YES (checked the box)' : 'NO'),
    'Files: ' + (req.files || []).map(clean).slice(0, 50).join(', '),
  ];
  DriveApp.getFolderById(FOLDER_ID).createFile(
    '_note ' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd HHmmss') + '.txt',
    lines.join('\n'));
  return reply({ ok: true });
}

function underLimit() {
  const cache = CacheService.getScriptCache();
  const key = 'n' + Math.floor(Date.now() / 3600000);
  const n = Number(cache.get(key) || 0);
  if (n >= MAX_PER_HOUR) return false;
  cache.put(key, String(n + 1), 3700);
  return true;
}

function clean(s) {
  return String(s || '').replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').trim();
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
