/**
 * pages/RegisterPage.jsx — User Registration Page
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerUser } from '../services/authService';

const RegisterPage = () => {
  const navigate = useNavigate();
  const [form, setForm]       = useState({ username: '', email: '', password: '', confirmPassword: '', fullName: '', phone: '' });
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      return setError('Passwords do not match');
    }
    if (form.password.length < 8) {
      return setError('Password must be at least 8 characters');
    }

    setLoading(true);
    try {
      await registerUser({
        username: form.username,
        email:    form.email,
        password: form.password,
        fullName: form.fullName,
        phone:    form.phone,
      });

      setSuccess('Registration successful! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="auth-logo">
          <h1>🔒 SecureBank</h1>
          <p>Create a secure account</p>
        </div>

        {error   && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}
        {success && <div style={{ background: 'rgb(34 197 94 / 0.1)', border: '1px solid rgb(34 197 94 / 0.3)', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', color: 'var(--color-success)', marginBottom: '1rem', fontSize: '0.875rem' }}>{success}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[
            { id: 'username',  label: 'Username',     type: 'text',     placeholder: 'john_doe',           required: true },
            { id: 'email',     label: 'Email',        type: 'email',    placeholder: 'you@example.com',    required: true },
            { id: 'fullName',  label: 'Full Name',    type: 'text',     placeholder: 'John Doe',           required: false },
            { id: 'phone',     label: 'Phone',        type: 'tel',      placeholder: '+880 1XXX XXXXXX',   required: false },
            { id: 'password',  label: 'Password',     type: 'password', placeholder: '••••••••',           required: true },
            { id: 'confirmPassword', label: 'Confirm Password', type: 'password', placeholder: '••••••••', required: true },
          ].map((field) => (
            <div className="form-group" key={field.id}>
              <label className="form-label" htmlFor={field.id}>{field.label}</label>
              <input
                id={field.id}
                name={field.id}
                type={field.type}
                className="form-input"
                value={form[field.id]}
                onChange={handleChange}
                placeholder={field.placeholder}
                required={field.required}
              />
            </div>
          ))}

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>

          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            Already have an account? <Link to="/login">Log In</Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default RegisterPage;
