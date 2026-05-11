require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const path = require('path');
const { spawn } = require('child_process');
const { Transform } = require('stream');

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ── Config ──────────────────────────────────────────────────────────
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const VIDEO_MIME_TYPES = [
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'video/x-msvideo', 'video/x-matroska', 'video/x-ms-wmv',
  'video/x-flv', 'video/3gpp', 'video/mpeg',
];

const IMAGE_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff',
];

const AUDIO_MIME_TYPES = [
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/aac', 'audio/wav', 'audio/webm',
  'audio/x-m4a', 'audio/flac', 'audio/opus',
];

// ── Helpers ─────────────────────────────────────────────────────────
function detectLang(filename) {
  const match = filename.match(/\.([a-z]{2}(-[A-Z]{2})?)\.(srt|vtt)$/i);
  if (match) return match[1].toLowerCase();
  const base = filename.replace(/\.(srt|vtt)$/i, '').toLowerCase();
  if (base.includes('es') || base.includes('spanish')) return 'es';
  if (base.includes('en') || base.includes('english')) return 'en';
  if (base.includes('fr') || base.includes('french')) return 'fr';
  if (base.includes('pt') || base.includes('portuguese')) return 'pt';
  if (base.includes('de') || base.includes('german')) return 'de';
  if (base.includes('ja') || base.includes('japanese')) return 'ja';
  if (base.includes('ko') || base.includes('korean')) return 'ko';
  if (base.includes('zh') || base.includes('chinese')) return 'zh';
  return 'es';
}

function audioLabel(filename) {
  const noExt = filename.replace(/\.\w+$/, '');
  const nameLower = noExt.toLowerCase();
  if (nameLower.includes('latino')) return 'Latino';
  if (nameLower.includes('castellano')) return 'Castellano';
  if (nameLower.includes('espanol') || nameLower.includes('español')) return 'Español';
  const lang = detectLang(filename + '.srt');
  const map = { es: 'Español', en: 'English', fr: 'Français', pt: 'Português', de: 'Deutsch', ja: '日本語', ko: '한국어', zh: '中文' };
  if (map[lang] && map[lang] !== 'Español') return map[lang];
  return noExt || 'Audio';
}

function embeddedStreamLabel(stream) {
  const tags = stream.tags || {};
  const lang = (tags.language || '').toLowerCase();
  const title = tags.title || '';
  const LANG = {
    spa: 'Español', es: 'Español', 'es-es': 'Castellano', 'es-mx': 'Latino',
    eng: 'English', en: 'English', fra: 'Français', fr: 'Français',
    por: 'Português', pt: 'Português', deu: 'Deutsch', de: 'Deutsch',
    jpn: '日本語', ja: '日本語', kor: '한국어', ko: '한국어',
    zho: '中文', zh: '中文', ita: 'Italiano', it: 'Italiano',
  };
  if (lang) {
    const name = LANG[lang] || lang.toUpperCase();
    return title ? `${name} (${title})` : name;
  }
  if (title) return title;
  return `Pista ${stream.index}`;
}

function extractSeasonNumber(folderName) {
  const match = folderName.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function srtToVtt(content) {
  let vtt = 'WEBVTT\n\n';
  const blocks = content.replace(/\r\n/g, '\n').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    // Skip index line if it's a number
    let timeIdx = 0;
    if (/^\d+$/.test(lines[0].trim())) timeIdx = 1;
    if (timeIdx >= lines.length - 1) continue;
    // Convert timestamp: 00:00:01,000 --> 00:00:01.000
    const timeLine = lines[timeIdx].replace(/,/g, '.');
    const text = lines.slice(timeIdx + 1).join('\n');
    vtt += timeLine + '\n' + text + '\n\n';
  }
  return vtt;
}

// ── OAuth Clients ────────────────────────────────────────────────────

// Client usado solo para login de usuarios (verificar identidad)
const loginClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Owner client: siempre accede al Drive del dueño
let ownerClient = null;
let ownerDrive = null;

function initOwnerClient() {
  const token = process.env.OWNER_REFRESH_TOKEN;
  if (!token) {
    console.warn('OWNER_REFRESH_TOKEN no configurado. Las consultas a Drive fallaran.');
    return null;
  }
  if (ownerClient) return ownerClient;

  ownerClient = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  ownerClient.setCredentials({ refresh_token: token });
  ownerDrive = google.drive({ version: 'v3', auth: ownerClient });
  console.log('Owner client inicializado con refresh token');
  return ownerClient;
}

function getOwnerDrive() {
  if (!ownerDrive) initOwnerClient();
  if (!ownerDrive) throw new Error('OWNER_REFRESH_TOKEN no configurado');
  return ownerDrive;
}

// ── Middleware ───────────────────────────────────────────────────────
if (NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(cors({
  origin: NODE_ENV === 'production' ? true : FRONTEND_URL,
  credentials: true,
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: process.env.COOKIE_SECURE === 'true' || (NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false'),
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: process.env.COOKIE_SECURE === 'true' && NODE_ENV === 'production' ? 'none' : 'lax',
  },
}));

// ── Auth Middleware (solo verifica que el usuario hizo login) ────────
function requireAuth(req, res, next) {
  if (!req.session.tokens) {
    console.log(`401: ${req.method} ${req.path} — session:${!!req.session} tokens:${!!req.session?.tokens} sid:${req.sessionID?.slice(0,8)}`);
    return res.status(401).json({ error: 'No autenticado. Ve a /auth/google' });
  }
  next();
}

// ── Auth Routes (login de cualquier usuario) ────────────────────────
app.get('/auth/google', (req, res) => {
  const authUrl = loginClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
  res.redirect(authUrl);
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const { tokens } = await loginClient.getToken(code);
    req.session.tokens = tokens;

    loginClient.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: loginClient });
    const userInfo = await oauth2.userinfo.get();
    req.session.user = userInfo.data;

    res.redirect(FRONTEND_URL);
  } catch (err) {
    console.error('Error en autenticacion:', err.message);
    res.status(500).send('Error de autenticacion. Revisa los logs.');
  }
});

app.get('/api/auth/status', (req, res) => {
  if (req.session.tokens && req.session.user) {
    return res.json({
      authenticated: true,
      user: req.session.user,
      isOwner: req.session.user.email === process.env.OWNER_EMAIL,
    });
  }
  res.json({ authenticated: false });
});

app.get('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// ── Admin: obtener refresh token del dueño ──────────────────────────
app.get('/api/admin/my-token', requireAuth, (req, res) => {
  const rt = req.session.tokens?.refresh_token;
  if (!rt) {
    return res.json({
      refresh_token: null,
      warning: 'No se recibio refresh token. Cierra sesion y vuelve a entrar. Asegurate de que el .env tenga el redirect URI correcto.',
    });
  }
  res.json({ refresh_token: rt });
});

// ── Admin: Debug del owner client ───────────────────────────────────
app.get('/api/admin/debug', requireAuth, async (req, res) => {
  try {
    const drive = getOwnerDrive();
    const about = await drive.about.get({ fields: 'user' });
    res.json({
      ownerEmail: process.env.OWNER_EMAIL,
      tokenSet: !!process.env.OWNER_REFRESH_TOKEN,
      driveAccount: about.data.user?.emailAddress || about.data.user?.displayName || 'desconocido',
    });
  } catch (err) {
    res.json({
      ownerEmail: process.env.OWNER_EMAIL,
      tokenSet: !!process.env.OWNER_REFRESH_TOKEN,
      error: err.message,
    });
  }
});

// ── Helpers de Drive ─────────────────────────────────────────────────

async function listSubfolders(drive, parentId) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    pageSize: 100,
    fields: 'files(id, name)',
  });
  return res.data.files || [];
}

async function processMediaFolder(drive, folder, extra = {}) {
  const filesRes = await drive.files.list({
    q: `'${folder.id}' in parents and trashed=false`,
    pageSize: 50,
    fields: 'files(id, name, mimeType, size, createdTime)',
  });
  const files = filesRes.data.files || [];
  const video = files.find(f => VIDEO_MIME_TYPES.includes(f.mimeType));
  const image = files.find(f => IMAGE_MIME_TYPES.includes(f.mimeType));
  const subtitles = files.filter(f =>
    f.name.endsWith('.srt') || f.name.endsWith('.vtt') ||
    f.mimeType === 'text/vtt'
  ).map(s => ({ id: s.id, name: s.name, lang: detectLang(s.name) }));

  const audioTracks = files.filter(f =>
    AUDIO_MIME_TYPES.includes(f.mimeType)
  ).map(a => ({ id: a.id, name: a.name, label: audioLabel(a.name) }));

  return {
    ...extra,
    folderName: folder.name,
    video: video ? { id: video.id, name: video.name, mimeType: video.mimeType, size: video.size, year: video.createdTime ? new Date(video.createdTime).getFullYear() : null } : null,
    image: image ? { id: image.id, name: image.name } : null,
    subtitles: subtitles.length > 0 ? subtitles : null,
    audioTracks: audioTracks.length > 0 ? audioTracks : null,
  };
}

// ── Video Routes (siempre usan el Drive del dueño) ──────────────────
app.get('/api/videos', requireAuth, async (req, res) => {
  try {
    const drive = getOwnerDrive();

    let driveOwner = 'desconocido';
    try {
      const about = await drive.about.get({ fields: 'user' });
      driveOwner = about.data.user?.emailAddress || about.data.user?.displayName || 'desconocido';
    } catch (_) {}

    let hackixFolderId = null;
    const searchNames = ['Hackix', 'hackix', 'HACKIX'];

    for (const name of searchNames) {
      const res = await drive.files.list({
        q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        pageSize: 5,
        fields: 'files(id, name)',
      });
      if (res.data.files && res.data.files.length > 0) {
        hackixFolderId = res.data.files[0].id;
        break;
      }
    }

    if (!hackixFolderId) {
      const allFolders = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
        pageSize: 20,
        fields: 'files(name)',
      });
      const folderNames = (allFolders.data.files || []).map(f => f.name);
      return res.json({
        entries: [],
        warning: `No se encontro la carpeta "Hackix". Carpetas en el Drive del dueno: ${folderNames.join(', ') || '(ninguna)'}`,
      });
    }

    const rootFolders = await listSubfolders(drive, hackixFolderId);

    const peliculasFolder = rootFolders.find(f => f.name.toLowerCase() === 'peliculas');
    const seriesFolder = rootFolders.find(f => f.name.toLowerCase() === 'series');

    if (!peliculasFolder && !seriesFolder) {
      if (rootFolders.length === 0) {
        return res.json({ movies: [], series: [], warning: 'La carpeta "Hackix" esta vacia. Crea las carpetas "Peliculas" y/o "Series" adentro.' });
      }
      // Fallback: legacy structure (direct subfolders = movies)
      const entries = await Promise.all(
        rootFolders.map(f => processMediaFolder(drive, f, { type: 'movie' }))
      );
      return res.json({ movies: entries.filter(e => e.video), series: [], driveOwner });
    }

    let movies = [];

    // ── Peliculas ──────────────────────────────────────
    if (peliculasFolder) {
      const movieFolders = await listSubfolders(drive, peliculasFolder.id);
      const movieEntries = await Promise.all(
        movieFolders.map(f => processMediaFolder(drive, f, { type: 'movie' }))
      );
      movies = movieEntries.filter(e => e.video);
    }

    // ── Series ─────────────────────────────────────────
    const seriesList = [];

    if (seriesFolder) {
      const seriesFolders = await listSubfolders(drive, seriesFolder.id);

      for (const series of seriesFolders) {
        // Look for a poster image at the series folder level
        const seriesFilesRes = await drive.files.list({
          q: `'${series.id}' in parents and trashed=false`,
          pageSize: 10,
          fields: 'files(id, name, mimeType)',
        });
        const seriesFiles = seriesFilesRes.data.files || [];
        const seriesImage = seriesFiles.find(f => IMAGE_MIME_TYPES.includes(f.mimeType));

        const seasonFolders = await listSubfolders(drive, series.id);
        const episodes = [];

        for (const season of seasonFolders) {
          const seasonNum = extractSeasonNumber(season.name);
          const seasonLabel = seasonNum != null ? `Temporada ${seasonNum}` : season.name;
          const episodeFolders = await listSubfolders(drive, season.id);

          for (const episode of episodeFolders) {
            const entry = await processMediaFolder(drive, episode, {
              type: 'episode',
              season: seasonLabel,
            });
            if (entry.video) episodes.push(entry);
          }
        }

        if (episodes.length > 0) {
          seriesList.push({
            name: series.name,
            image: seriesImage ? { id: seriesImage.id, name: seriesImage.name } : null,
            episodes,
          });
        }
      }
    }

    res.json({ movies, series: seriesList, driveOwner });
  } catch (err) {
    console.error('Error listando videos:', err.message);
    res.status(500).json({ error: 'Error al listar videos' });
  }
});

// ── Stream video (desde el Drive del dueño) ─────────────────────────
app.get('/api/videos/:id/stream', requireAuth, async (req, res) => {
  try {
    const fileId = req.params.id;
    const drive = getOwnerDrive();

    const meta = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size',
    });

    const fileSize = parseInt(meta.data.size, 10);
    const fileName = meta.data.name;
    const mimeType = meta.data.mimeType;
    const range = req.headers.range;

    let aborted = false;
    req.on('close', () => { aborted = true; });
    res.on('error', (err) => {
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
      console.error('Response error:', err.message);
    });

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
      });

      const stream = await drive.files.get(
        { fileId, alt: 'media' },
        { headers: { Range: `bytes=${start}-${end}` }, responseType: 'stream' }
      );
      stream.data.on('error', (err) => {
        if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
        if (!aborted && !res.headersSent) {
          console.error('Stream error:', err.message);
          res.status(500).end();
        }
      });
      stream.data.on('error', () => {});
    res.on('error', () => {});
    stream.data.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': 'no-cache',
      });

      const stream = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      stream.data.on('error', (err) => {
        if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
        if (!aborted && !res.headersSent) {
          console.error('Stream error:', err.message);
          res.status(500).end();
        }
      });

      stream.data.on('end', () => {
        if (!res.writableEnded) res.end();
      });

      stream.data.on('error', () => {});
    res.on('error', () => {});
    stream.data.pipe(res);
    }
  } catch (err) {
    console.error('Error streameando video:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error al reproducir el video' });
    }
  }
});

// ── Servir portadas (desde el Drive del dueño) ──────────────────────
app.get('/api/images/:id', requireAuth, async (req, res) => {
  try {
    const drive = getOwnerDrive();
    const meta = await drive.files.get({
      fileId: req.params.id,
      fields: 'mimeType',
    });

    res.setHeader('Content-Type', meta.data.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const stream = await drive.files.get(
      { fileId: req.params.id, alt: 'media' },
      { responseType: 'stream' }
    );
    stream.data.on('error', () => {});
    res.on('error', () => {});
    stream.data.pipe(res);
  } catch (err) {
    console.error('Error sirviendo imagen:', err.message);
    res.status(500).json({ error: 'Error al obtener imagen' });
  }
});

// ── Servir subtítulos (convierte SRT a VTT automáticamente) ────────
app.get('/api/subtitles/:id', requireAuth, async (req, res) => {
  try {
    const drive = getOwnerDrive();
    const meta = await drive.files.get({
      fileId: req.params.id,
      fields: 'name, mimeType',
    });

    const fileName = meta.data.name;

    const response = await drive.files.get(
      { fileId: req.params.id, alt: 'media' },
      { responseType: 'text' }
    );

    let content = response.data;

    // Convertir SRT a VTT si es necesario
    if (fileName.endsWith('.srt')) {
      content = srtToVtt(content);
    }

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(content);
  } catch (err) {
    console.error('Error sirviendo subtitulos:', err.message);
    res.status(500).json({ error: 'Error al obtener subtitulos' });
  }
});

// ── Audio tracks: detectar pistas de audio embebidas ──────────────────
const audioTracksCache = new Map();

app.get('/api/videos/:id/audio-tracks', requireAuth, async (req, res) => {
  try {
    const fileId = req.params.id;
    const cacheKey = `at_${fileId}`;
    if (audioTracksCache.has(cacheKey)) {
      return res.json({ tracks: audioTracksCache.get(cacheKey) });
    }

    const drive = getOwnerDrive();
    const driveStream = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet', '-print_format', 'json',
      '-show_streams', '-select_streams', 'a', '-'
    ]);

    let output = '';
    let bytesRead = 0;
    const MAX_BYTES = 30 * 1024 * 1024;

    ffprobe.stdout.on('data', d => { output += d; });
    ffprobe.stderr.on('data', () => {});

    driveStream.data.on('data', (chunk) => {
      bytesRead += chunk.length;
      if (bytesRead <= MAX_BYTES) {
        ffprobe.stdin.write(chunk);
      }
      if (bytesRead >= MAX_BYTES) {
        if (!driveStream.data.destroyed) driveStream.data.destroy();
        ffprobe.stdin.end();
      }
    });

    driveStream.data.on('end', () => {
      ffprobe.stdin.end();
    });

    driveStream.data.on('error', () => {
      ffprobe.stdin.end();
    });

    ffprobe.on('close', (code) => {
      try {
        if (code !== 0 || !output) {
          audioTracksCache.set(cacheKey, []);
          return res.json({ tracks: [] });
        }
        const data = JSON.parse(output);
        const tracks = (data.streams || []).map((s) => ({
          index: s.index,
          label: embeddedStreamLabel(s),
        }));
        audioTracksCache.set(cacheKey, tracks);
        res.json({ tracks });
      } catch (_) {
        audioTracksCache.set(cacheKey, []);
        res.json({ tracks: [] });
      }
    });
  } catch (err) {
    console.error('Error detectando pistas de audio:', err.message);
    res.json({ tracks: [] });
  }
});

// ── Stream de pista de audio individual ──────────────────────────────
app.get('/api/videos/:id/audio/:streamIndex/stream', requireAuth, async (req, res) => {
  try {
    const fileId = req.params.id;
    const streamIndex = parseInt(req.params.streamIndex, 10);
    const drive = getOwnerDrive();

    const driveStream = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    const ffmpeg = spawn('ffmpeg', [
      '-i', 'pipe:0',
      '-map', `0:a:${streamIndex}`,
      '-c:a', 'libmp3lame',
      '-b:a', '192k',
      '-f', 'mp3',
      'pipe:1'
    ]);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');

    let aborted = false;
    req.on('close', () => { aborted = true; });
    res.on('error', (err) => {
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
      console.error('Audio response error:', err.message);
    });

    driveStream.data.on('error', (err) => {
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
      if (!aborted) ffmpeg.kill();
    });
    ffmpeg.stdin.on('error', (err) => {
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
    });
    ffmpeg.stdout.on('error', (err) => {
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
    });
    ffmpeg.on('error', (err) => {
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
      if (!aborted && !res.headersSent) {
        res.status(500).end();
      }
    });

    driveStream.data.pipe(ffmpeg.stdin);
    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on('data', () => {});

    req.on('close', () => {
      aborted = true;
      if (!driveStream.data.destroyed) driveStream.data.destroy();
      ffmpeg.kill();
    });
  } catch (err) {
    console.error('Error streameando audio:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Error al reproducir el audio' });
  }
});

// ── Serve React build in production ─────────────────────────────────
if (NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'build', 'index.html'));
  });
}

// ── Start ───────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ERR_STREAM_WRITE_AFTER_END') return;
  console.error('Uncaught:', err.message);
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Frontend: ${FRONTEND_URL}`);
  console.log(`Entorno: ${NODE_ENV}`);
  initOwnerClient();
});
