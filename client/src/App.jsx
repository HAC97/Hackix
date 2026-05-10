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
  const [warning, setWarning] = useState(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch(`${API}/api/auth/status`, { credentials: 'include' });
      const data = await res.json();
      setAuth({ checked: true, authenticated: data.authenticated, user: data.user || null });
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
              {auth.user.picture && <img src={auth.user.picture} alt="" className="avatar" />}
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
              apiUrl={API}
            />
          </div>
        ) : currentSeries ? (
          <SeriesDetail
            series={currentSeries}
            apiUrl={API}
            onBack={() => setCurrentSeries(null)}
            onSelect={(entry) => setCurrentEntry(entry)}
          />
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
