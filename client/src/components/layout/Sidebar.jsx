import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Sidebar = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };
  
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">🔒 SecureBank</div>

      <NavLink to="/dashboard" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
        📊 Dashboard
      </NavLink>

      <div style={{ marginTop: 'auto' }}>
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            color: 'var(--color-text-muted)',
            fontSize: '0.75rem',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <span className={`badge badge-${currentUser?.role === 'admin' ? 'admin' : 'user'}`}>
            {currentUser?.role || 'user'}
          </span>
        </div>

        <button
          onClick={handleLogout}
          className="sidebar-link"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            textAlign: 'left',
            color: 'var(--color-danger)',
          }}
        >
          🚪 Log Out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;