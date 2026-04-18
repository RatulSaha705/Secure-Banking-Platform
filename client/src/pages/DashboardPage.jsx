import React from 'react';
import DashboardLayout from '../components/layout/DashboardLayout';
import { useAuth } from '../context/AuthContext';

const DashboardPage = () => {
  const { currentUser } = useAuth();

  return (
    <DashboardLayout>
      <div className="page-header">
        <h2 className="page-title">Dashboard</h2>
        <p className="page-subtitle">Welcome to your secure banking portal.</p>
      </div>

      <div className="card">
        <h3 style={{ fontWeight: 600, marginBottom: '1rem' }}>👋 Welcome</h3>
        <div style={{ display: 'grid', gap: '0.75rem', color: 'var(--color-text-muted)' }}>
          <div><strong>User ID:</strong> {currentUser?.id || 'N/A'}</div>
          <div><strong>Role:</strong> {currentUser?.role || 'user'}</div>
          <div><strong>Status:</strong> Logged in successfully</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <h3 style={{ fontWeight: 600, marginBottom: '0.75rem' }}>📌 Current Phase</h3>
        <div style={{ display: 'grid', gap: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>
          <span>✅ Feature 1: User Registration</span>
          <span>✅ Feature 2: Secure Login</span>
          <span>⏳ Other banking and security features will be added later</span>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;