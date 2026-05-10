require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const path = require('path');

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
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/x-ms-wmv',
  'video/x-flv',
  'video/3gpp',
  'video/mpeg',
];

const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
];

const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// ── Middleware ───────────────────────────────────────────────────────
app.use(cors({
  origin: NODE_ENV === 'production' ? true : FRONTEND_URL,
  credentials: true,
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
  },
}));

// Trust proxy in production (Render, Heroku, etc.)
if (NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// ── Auth Middleware ──────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.tokens) {
    return res.status(401).json({ error: 'No autenticado. Ve a /auth/google' });
  }
  oauth2Client.setCredentials(req.session.tokens);
  next();
}

// ── Auth Routes ─────────────────────────────────────────────────────
app.get('/auth/google', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
  res.redirect(authUrl);
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const { tokens } = await oauth2Client.getToken(code);
    req.session.tokens = tokens;

    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
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
    });
  }
  res.json({ authenticated: false });
});

app.get('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// ── Video Routes ────────────────────────────────────────────────────
app.get('/api/videos', requireAuth, async (req, res) => {
  try {
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    let hatrixFolderId = null;
    const searchNames = ['Hackix', 'hackix', 'HACKIX'];

    for (const name of searchNames) {
      const hatrixRes = await drive.files.list({
        q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        pageSize: 5,
        fields: 'files(id, name)',
      });
      if (hatrixRes.data.files && hatrixRes.data.files.length > 0) {
        hatrixFolderId = hatrixRes.data.files[0].id;
        break;
      }
    }

    if (!hatrixFolderId) {
      const allFolders = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
        pageSize: 20,
        fields: 'files(name)',
      });
      const folderNames = (allFolders.data.files || []).map(f => f.name);
      return res.json({
        entries: [],
        warning: `No se encontro la carpeta "Hackix". Carpetas en tu Drive: ${folderNames.join(', ') || '(ninguna)'}`,
      });
    }

    const subfoldersRes = await drive.files.list({
      q: `'${hatrixFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      pageSize: 100,
      fields: 'files(id, name)',
    });

    const subfolders = subfoldersRes.data.files || [];

    if (subfolders.length === 0) {
      return res.json({ entries: [], warning: 'La carpeta "Hackix" esta vacia. Crea subcarpetas con videos y portadas adentro.' });
    }

    const entries = await Promise.all(
      subfolders.map(async (folder) => {
        const filesRes = await drive.files.list({
          q: `'${folder.id}' in parents and trashed=false`,
          pageSize: 50,
          fields: 'files(id, name, mimeType, size)',
        });

        const files = filesRes.data.files || [];

        const video = files.find(f => VIDEO_MIME_TYPES.includes(f.mimeType));
        const image = files.find(f => IMAGE_MIME_TYPES.includes(f.mimeType));

        return {
          folderName: folder.name,
          video: video ? { id: video.id, name: video.name, mimeType: video.mimeType, size: video.size } : null,
          image: image ? { id: image.id, name: image.name } : null,
        };
      })
    );

    const validEntries = entries.filter(e => e.video);

    res.json({ entries: validEntries });
  } catch (err) {
    console.error('Error listando videos:', err.message);
    res.status(500).json({ error: 'Error al listar videos' });
  }
});

// ── Stream video con Range support ──────────────────────────────────
app.get('/api/videos/:id/stream', requireAuth, async (req, res) => {
  try {
    const fileId = req.params.id;
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const meta = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size',
    });

    const fileSize = parseInt(meta.data.size, 10);
    const fileName = meta.data.name;
    const mimeType = meta.data.mimeType;

    const range = req.headers.range;

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
      stream.data.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': `inline; filename="${fileName}"`,
      });

      const stream = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      stream.data.on('error', (err) => {
        console.error('Stream error:', err.message);
        if (!res.headersSent) res.status(500).end();
      });

      stream.data.pipe(res);
    }
  } catch (err) {
    console.error('Error streameando video:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error al reproducir el video' });
    }
  }
});

// ── Servir imagenes de portada ──────────────────────────────────────
app.get('/api/images/:id', requireAuth, async (req, res) => {
  try {
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
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
    stream.data.pipe(res);
  } catch (err) {
    console.error('Error sirviendo imagen:', err.message);
    res.status(500).json({ error: 'Error al obtener imagen' });
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
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Frontend: ${FRONTEND_URL}`);
  console.log(`Entorno: ${NODE_ENV}`);
});
