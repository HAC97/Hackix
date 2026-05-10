import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import VideoList from './components/VideoList';
import Player from './components/Player';
import './App.css';

const API = '';

function App() {
  const [auth, setAuth] = useState({ checked: false, authenticated: false, user: null });
  const [entries, setEntries] = useState([]);
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
      setEntries(data.entries || []);
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
    setEntries([]);
    setCurrentEntry(null);
    setWarning(null);
  };

  if (!auth.checked) {
    return <div className="loading-screen">Cargando...</div>;
  }

  if (!auth.authenticated) {
    return <Login apiUrl={API} onLogin={checkAuth} />;
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Google Drive Player</h1>
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
              title={currentEntry.folderName}
              apiUrl={API}
            />
          </div>
        ) : (
          <>
            <div className="toolbar">
              <button onClick={fetchVideos} disabled={loading} className="btn-refresh">
                {loading ? 'Cargando...' : 'Actualizar'}
              </button>
              <span className="video-count">{entries.length} videos encontrados</span>
            </div>
            {warning && <div className="warning-banner">{warning}</div>}
            <VideoList entries={entries} apiUrl={API} onSelect={setCurrentEntry} />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
