/**
 * components/layout/DashboardLayout.jsx — Shared Layout Wrapper
 */

import React from 'react';
import Sidebar from './Sidebar';

const DashboardLayout = ({ children }) => {
  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
};

export default DashboardLayout;
