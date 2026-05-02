import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import { getUnreadNotificationCount } from '../../services/notificationService';

const normalizeRole = (role) => {
  return String(role || '').trim().toLowerCase();
};

const Sidebar = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const role = normalizeRole(currentUser?.role);
  const isAdmin = role === 'admin';

  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const res = await getUnreadNotificationCount();
        const count = res.data?.data?.unreadCount || 0;

        setUnreadCount(count);
      } catch {
        setUnreadCount(0);
      }
    };

    fetchUnreadCount();
  }, []);

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

      <NavLink to="/profile" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
        👤 My Profile
      </NavLink>

      <NavLink to="/account-balance" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
        💰 Account Balance
      </NavLink>

      <NavLink to="/transfer" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
        💸 Money Transfer
      </NavLink>

      <NavLink to="/transactions" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
        📜 Transaction History
      </NavLink>

      <NavLink to="/support-tickets" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
        🎧 Support Tickets
      </NavLink>

      <NavLink to="/notifications" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
        <span>🔔 Notifications</span>

        {unreadCount > 0 && (
          <span
            style={{
              marginLeft: 'auto',
              background: 'var(--color-danger)',
              color: '#ffffff',
              borderRadius: '999px',
              padding: '2px 8px',
              fontSize: '0.7rem',
              fontWeight: '700',
            }}
          >
            {unreadCount}
          </span>
        )}
      </NavLink>

      {isAdmin && (
        <NavLink to="/admin/support-tickets" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          🛡️ Admin Tickets
        </NavLink>
      )}

      <div style={{ marginTop: 'auto' }}>
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            color: 'var(--color-text-muted)',
            fontSize: '0.75rem',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <span className={`badge badge-${isAdmin ? 'admin' : 'user'}`}>
            {role || 'user'}
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