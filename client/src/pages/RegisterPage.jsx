/**
 * pages/RegisterPage.jsx — User Registration Page
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerUser, verifyRegistrationOtp } from '../services/authService';

const RegisterPage = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    phone: '',
  });

  const [otp, setOtp] = useState('');
  const [verificationData, setVerificationData] = useState(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const isOtpStep = Boolean(
    verificationData?.pendingRegistrationId && verificationData?.challengeId
  );

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const res = await registerUser({
        username: form.username,
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        phone: form.phone,
        contact: form.phone,
      });

      const data = res.data;

      if (data?.requiresEmailVerification) {
        setVerificationData({
          pendingRegistrationId: data.pendingRegistrationId,
          challengeId: data.challengeId,
          expiresAt: data.expiresAt,
          maskedEmail: data.maskedEmail,
          devOtp: data.devOtp,
        });

        setSuccess(
          data.message ||
            'OTP sent to your email. Verify OTP to complete registration.'
        );
        return;
      }

      setSuccess('Registration successful! Redirecting to login...');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await verifyRegistrationOtp({
        pendingRegistrationId: verificationData.pendingRegistrationId,
        challengeId: verificationData.challengeId,
        otp,
      });

      setSuccess('Registration verified successfully. Redirecting to login...');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          'Registration OTP verification failed'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBackToForm = () => {
    setVerificationData(null);
    setOtp('');
    setError('');
    setSuccess('');
  };

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="auth-logo">
          <h1>🔒 SecureBank</h1>
          <p>Create a secure account</p>
        </div>

        {error && (
          <div className="error-message" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              background: 'rgb(34 197 94 / 0.1)',
              border: '1px solid rgb(34 197 94 / 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem',
              color: 'var(--color-success)',
              marginBottom: '1rem',
              fontSize: '0.875rem',
            }}
          >
            {success}
          </div>
        )}

        {!isOtpStep ? (
          <form
            onSubmit={handleRegisterSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            {[
              {
                id: 'username',
                label: 'Username',
                type: 'text',
                placeholder: 'john_doe',
                required: true,
              },
              {
                id: 'email',
                label: 'Email',
                type: 'email',
                placeholder: 'you@example.com',
                required: true,
              },
              {
                id: 'fullName',
                label: 'Full Name',
                type: 'text',
                placeholder: 'John Doe',
                required: false,
              },
              {
                id: 'phone',
                label: 'Phone',
                type: 'tel',
                placeholder: '+880 1XXX XXXXXX',
                required: false,
              },
              {
                id: 'password',
                label: 'Password',
                type: 'password',
                placeholder: '••••••••',
                required: true,
              },
              {
                id: 'confirmPassword',
                label: 'Confirm Password',
                type: 'password',
                placeholder: '••••••••',
                required: true,
              },
            ].map((field) => (
              <div className="form-group" key={field.id}>
                <label className="form-label" htmlFor={field.id}>
                  {field.label}
                </label>
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

            <p
              style={{
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                fontSize: '0.875rem',
              }}
            >
              Already have an account? <Link to="/login">Log In</Link>
            </p>
          </form>
        ) : (
          <form
            onSubmit={handleOtpSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div
              style={{
                color: 'var(--color-text-muted)',
                fontSize: '0.875rem',
                lineHeight: 1.5,
              }}
            >
              Enter the 6-digit OTP sent to{' '}
              <strong>{verificationData.maskedEmail || form.email}</strong> to
              complete your registration.
            </div>

            {verificationData.devOtp && (
              <div
                style={{
                  background: 'rgb(245 158 11 / 0.1)',
                  border: '1px solid rgb(245 158 11 / 0.3)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 1rem',
                  color: 'rgb(245 158 11)',
                  fontSize: '0.875rem',
                }}
              >
                Development OTP: <strong>{verificationData.devOtp}</strong>
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="otp">
                OTP Code
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength="6"
                className="form-input"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                required
                autoComplete="one-time-code"
                placeholder="123456"
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Verifying OTP...' : 'Verify OTP & Complete Registration'}
            </button>

            <button
              type="button"
              className="btn"
              onClick={handleBackToForm}
              disabled={loading}
              style={{
                background: 'transparent',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              Back to Registration Form
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default RegisterPage;