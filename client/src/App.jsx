import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import VideoList from './components/VideoList';
import SeriesDetail from './components/SeriesDetail';
import Player from './components/Player';
import Logo from './components/Logo';
import './App.css';

const isDev = process.env.NODE_ENV !== 'production';
const API = isDev ? 'http://localhost:4000' : '';
const AUTH_URL = isDev ? 'http://localhost:4000/auth/google' : '/auth/google';

function App() {
  const [auth, setAuth] = useState({ checked: false, authenticated: false, user: null });
  const [movies, setMovies] = useState([]);
  const [seriesList, setSeriesList] = useState([]);
  const [currentSeries, setCurrentSeries] = useState(null);
  const [currentEntry, setCurrentEntry] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [warning, setWarning] = useState(null);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch(`${API}/api/auth/status`, { credentials: 'include' });
      const data = await res.json();
      setAuth({ checked: true, authenticated: data.authenticated, user: data.user || null });
      setAvatarError(false);
    } catch {
      setAuth({ checked: true, authenticated: false, user: null });
    }
  };

  const fetchVideos = async () => {
    setLoading(true);
    setWarning(null);
    try {
      const res = await fetch(`${API}/api/videos`, { credentials: 'include' });
      const data = await res.json();
      setMovies(data.movies || []);
      setSeriesList(data.series || []);
      if (data.warning) setWarning(data.warning);
    } catch (err) {
      console.error('Error fetching videos:', err);
    }
    setLoading(false);
    setInitialLoading(false);
  };

  useEffect(() => {
    if (auth.authenticated) {
      fetchVideos();
    }
  }, [auth.authenticated]);

  const handleLogout = async () => {
    await fetch(`${API}/api/auth/logout`, { credentials: 'include' });
    setAuth({ checked: true, authenticated: false, user: null });
    setMovies([]);
    setSeriesList([]);
    setCurrentSeries(null);
    setCurrentEntry(null);
    setWarning(null);
    setAvatarError(false);
  };

  if (!auth.checked) {
    return <div className="loading-screen">Cargando...</div>;
  }

  if (!auth.authenticated) {
    return <Login authUrl={AUTH_URL} onLogin={checkAuth} />;
  }

  const totalVideos = movies.length + seriesList.reduce((sum, s) => sum + s.episodes.length, 0);

  return (
    <div className="app">
      <header className="header">
        <Logo size={28} />
        <div className="header-right">
          {auth.user && (
            <span className="user-name">
              {auth.user.picture && !avatarError ? (
                <img
                  src={auth.user.picture}
                  alt=""
                  className="avatar"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <span className="avatar-fallback">
                  {(auth.user.name || auth.user.email || '?').charAt(0).toUpperCase()}
                </span>
              )}
              {auth.user.name || auth.user.email}
            </span>
          )}
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </header>

      <main className="main">
        {currentEntry ? (
          <div className="player-section">
            <button onClick={() => setCurrentEntry(null)} className="btn-back">
              &larr; Volver
            </button>
            <Player
              videoId={currentEntry.video.id}
              title={currentEntry.type === 'episode'
                ? `${currentSeries?.name || ''} - ${currentEntry.season} - ${currentEntry.folderName}`
                : currentEntry.folderName}
              subtitles={currentEntry.subtitles}
              posterUrl={currentEntry.image ? `${API}/api/images/${currentEntry.image.id}` : null}
              apiUrl={API}
              {...(currentEntry.type === 'episode' && currentSeries
                ? (() => {
                    const episodes = currentSeries.episodes;
                    const idx = episodes.findIndex(ep => ep.video.id === currentEntry.video.id);
                    return {
                      episodeIndex: idx >= 0 ? idx : -1,
                      episodeCount: episodes.length,
                      onPrev: idx > 0 ? () => setCurrentEntry(episodes[idx - 1]) : null,
                      onNext: idx < episodes.length - 1 ? () => setCurrentEntry(episodes[idx + 1]) : null,
                    };
                  })()
                : {}
              )}
            />
          </div>
        ) : currentSeries ? (
          <SeriesDetail
            series={currentSeries}
            apiUrl={API}
            onBack={() => setCurrentSeries(null)}
            onSelect={(entry) => setCurrentEntry(entry)}
          />
        ) : initialLoading ? (
          <div className="initial-loading">
            <Logo size={48} />
            <div className="spinner-large" />
            <span className="loading-text">Cargando biblioteca...</span>
          </div>
        ) : (
          <>
            <div className="toolbar">
              <button onClick={fetchVideos} disabled={loading} className="btn-refresh">
                {loading ? 'Cargando...' : 'Actualizar'}
              </button>
              <span className="video-count">{totalVideos} videos encontrados</span>
            </div>
            {warning && <div className="warning-banner">{warning}</div>}
            <VideoList
              movies={movies}
              seriesList={seriesList}
              apiUrl={API}
              onSelectMovie={setCurrentEntry}
              onSelectSeries={setCurrentSeries}
            />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
