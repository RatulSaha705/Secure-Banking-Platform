import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUser, verifyLoginOtp } from '../services/authService';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');

  const [twoFactorData, setTwoFactorData] = useState(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const isOtpStep = Boolean(twoFactorData?.challengeId && twoFactorData?.userId);

  const handleCredentials = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await loginUser({
        identifier,
        password,
      });

      const data = res.data;

      if (data?.requiresTwoFactor) {
        setTwoFactorData({
          challengeId: data.challenge?.challengeId,
          userId: data.pendingUser?.id,
          maskedDestination: data.challenge?.maskedDestination,
          expiresAt: data.challenge?.expiresAt,
          devOtp: data.challenge?.devOtp,
        });

        setPassword('');
        setSuccess(
          data.message ||
            'Primary credentials verified. Enter the OTP sent to your email.'
        );
        return;
      }

      if (data?.accessToken && data?.user) {
        login(data.user, data.accessToken);
        navigate('/dashboard');
        return;
      }

      throw new Error('Unexpected login response from server');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerification = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await verifyLoginOtp({
        challengeId: twoFactorData.challengeId,
        userId: twoFactorData.userId,
        otp,
      });

      const data = res.data;

      if (!data?.accessToken || !data?.user) {
        throw new Error('Login verification failed');
      }

      login(data.user, data.accessToken);
      navigate('/dashboard');
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          'OTP verification failed'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setTwoFactorData(null);
    setOtp('');
    setPassword('');
    setError('');
    setSuccess('');
  };

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="auth-logo">
          <h1>🔒 SecureBank</h1>
          <p>Secure Banking System — CSE447 Lab</p>
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
            onSubmit={handleCredentials}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div className="form-group">
              <label className="form-label" htmlFor="identifier">
                Email or Username
              </label>
              <input
                id="identifier"
                type="text"
                className="form-input"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                placeholder="you@example.com or username"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Checking Credentials...' : 'Log In'}
            </button>

            <p
              style={{
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                fontSize: '0.875rem',
              }}
            >
              Don't have an account? <Link to="/register">Register</Link>
            </p>
          </form>
        ) : (
          <form
            onSubmit={handleOtpVerification}
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
              <strong>{twoFactorData.maskedDestination || 'your email'}</strong>.
            </div>

            {twoFactorData.devOtp && (
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
                Development OTP: <strong>{twoFactorData.devOtp}</strong>
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
              {loading ? 'Verifying OTP...' : 'Verify OTP & Log In'}
            </button>

            <button
              type="button"
              className="btn"
              onClick={handleBackToLogin}
              disabled={loading}
              style={{
                background: 'transparent',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              Use Different Account
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default LoginPage;