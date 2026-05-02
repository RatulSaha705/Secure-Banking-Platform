import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import DashboardLayout from '../components/layout/DashboardLayout';
import { getMyProfile, updateMyProfile } from '../services/profileService';

/* ─────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

const initForm = (profile) => ({
  username:    profile?.username    ?? '',
  contact:     profile?.contact     ?? '',
  phone:       profile?.phone       ?? '',
  fullName:    profile?.fullName    ?? '',
  address:     profile?.address     ?? '',
  dateOfBirth: profile?.dateOfBirth ?? '',
  nid:         profile?.nid         ?? '',
});

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-BD', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

/* ─────────────────────────────────────────────────────────────────────────── */
/* Sub-components                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

/* Avatar with initials */
const Avatar = ({ name, role }) => {
  const initials = (name || 'U')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="relative">
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 text-3xl font-extrabold text-white shadow-xl ring-4 ring-blue-500/30">
        {initials}
      </div>
      <span className="absolute -bottom-2 -right-2 rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-bold capitalize text-white shadow">
        {role || 'user'}
      </span>
    </div>
  );
};

/* Read-only field row */
const InfoRow = ({ label, value, mono = false }) => (
  <div className="flex flex-col gap-1 rounded-2xl bg-slate-800/60 px-5 py-4">
    <span className="text-[0.7rem] font-semibold uppercase tracking-widest text-slate-400">
      {label}
    </span>
    <span
      className={`text-sm font-medium text-slate-100 ${mono ? 'font-mono' : ''}`}
    >
      {value || <span className="italic text-slate-500">Not set</span>}
    </span>
  </div>
);

/* Input field for edit form */
const FormField = ({ id, label, type = 'text', value, onChange, placeholder, hint }) => (
  <div className="form-group">
    <label htmlFor={id} className="form-label">
      {label}
    </label>
    <input
      id={id}
      name={id}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="form-input"
      autoComplete="off"
    />
    {hint && (
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    )}
  </div>
);


/* ─────────────────────────────────────────────────────────────────────────── */
/* Main Page Component                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */

const ProfilePage = () => {

  const [profile,   setProfile]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [editing,   setEditing]   = useState(false);
  const [form,      setForm]      = useState({});
  const [errors,    setErrors]    = useState({});
  const firstInputRef             = useRef(null);

  /* ── Fetch profile ────────────────────────────────────────────────────── */
  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyProfile();
      const p   = res.data?.profile ?? null;
      setProfile(p);
      setForm(initForm(p));
    } catch (err) {
      toast.error(
        err.response?.data?.message || 'Failed to load profile. Please retry.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  /* Focus first field when edit mode opens */
  useEffect(() => {
    if (editing && firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, [editing]);

  /* ── Form handlers ────────────────────────────────────────────────────── */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validate = () => {
    const newErrors = {};

    if (form.username && (form.username.length < 3 || form.username.length > 30)) {
      newErrors.username = 'Username must be 3–30 characters.';
    }
    if (form.username && !/^[a-zA-Z0-9_]+$/.test(form.username)) {
      newErrors.username = 'Only letters, numbers, and underscores allowed.';
    }
    if (form.contact && form.contact.length > 30) {
      newErrors.contact = 'Contact must be at most 30 characters.';
    }
    if (form.phone && form.phone.length > 30) {
      newErrors.phone = 'Phone must be at most 30 characters.';
    }
    if (form.fullName && form.fullName.length > 100) {
      newErrors.fullName = 'Full name must be at most 100 characters.';
    }
    if (form.address && form.address.length > 255) {
      newErrors.address = 'Address must be at most 255 characters.';
    }
    if (form.dateOfBirth) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth)) {
        newErrors.dateOfBirth = 'Use YYYY-MM-DD format.';
      } else if (new Date(form.dateOfBirth) > new Date()) {
        newErrors.dateOfBirth = 'Date of birth cannot be in the future.';
      }
    }
    if (form.nid && (form.nid.length < 5 || form.nid.length > 30)) {
      newErrors.nid = 'NID must be 5–30 characters.';
    }

    return newErrors;
  };

  const handleCancel = () => {
    setForm(initForm(profile));
    setErrors({});
    setEditing(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const fieldErrors = validate();
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    /* Build only non-empty / changed fields */
    const payload = {};
    const editableKeys = [
      'username', 'contact', 'phone', 'fullName',
      'address', 'dateOfBirth', 'nid',
    ];

    for (const key of editableKeys) {
      const val = form[key]?.trim() ?? '';
      payload[key] = val || null; // send null to clear a field
    }

    setSaving(true);
    try {
      const res    = await updateMyProfile(payload);
      const updated = res.data?.profile ?? null;
      setProfile(updated);
      setForm(initForm(updated));
      setEditing(false);
      toast.success('Profile updated successfully!');
    } catch (err) {
      const serverErrors = err.response?.data?.errors;
      if (Array.isArray(serverErrors) && serverErrors.length > 0) {
        const mapped = {};
        serverErrors.forEach(({ field, message }) => {
          mapped[field] = message;
        });
        setErrors(mapped);
        toast.error('Please fix the highlighted errors.');
      } else {
        toast.error(err.response?.data?.message || 'Failed to update profile.');
      }
    } finally {
      setSaving(false);
    }
  };

  /* ── Loading state ────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            <p className="text-sm font-medium text-slate-400">
              Decrypting your profile…
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  /* ── Main render ──────────────────────────────────────────────────────── */
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-8 px-2 py-4">

        {/* ── Page header ───────────────────────────────────────────────── */}
        <div className="page-header mb-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
            Feature 6
          </p>
          <h1 className="page-title mt-1 text-2xl">Profile Management</h1>
          <p className="page-subtitle mt-1">
            View and update your personal information. All data is encrypted
            end-to-end using RSA + ECC before being stored.
          </p>
        </div>

        {/* ── Hero card ──────────────────────────────────────────────────── */}
        <section className="overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 shadow-lg">
          <div className="flex flex-col gap-6 px-6 py-8 sm:flex-row sm:items-center sm:gap-8 sm:px-8 sm:py-10">
            <Avatar
              name={profile?.fullName || profile?.username}
            />

            <div className="min-w-0 flex-1">
              <h2 className="truncate text-2xl font-extrabold text-white sm:text-3xl">
                {profile?.fullName || profile?.username || 'Authenticated User'}
              </h2>
              <p className="mt-1 truncate text-sm text-slate-400">
                {profile?.email || '—'}
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600/20 px-3 py-1 text-xs font-semibold text-blue-300 ring-1 ring-blue-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                  Dual-asymmetric encryption active
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/20 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  HMAC-SHA256 integrity verified
                </span>
              </div>
            </div>

            {!editing && (
              <button
                type="button"
                id="btn-edit-profile"
                onClick={() => setEditing(true)}
                className="shrink-0 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-blue-500 hover:shadow-blue-500/30 active:scale-95"
              >
                ✏️  Edit Profile
              </button>
            )}
          </div>
        </section>

        {/* ── Main body ─────────────────────────────────────────────────── */}
        <div>

          {/* Left — view or edit form ─────────────────────────────────── */}
          <div className="card space-y-6">

            {editing ? (
              /* ── Edit Form ────────────────────────────────────────── */
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-100">
                    Edit Your Information
                  </h2>
                  <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-400 ring-1 ring-amber-400/30">
                    Edit Mode
                  </span>
                </div>

                <p className="text-xs leading-5 text-slate-500">
                  Email cannot be changed from this screen. All fields are
                  optional — only the fields you fill in will be updated.
                </p>

                <form
                  id="profile-edit-form"
                  onSubmit={handleSubmit}
                  noValidate
                  className="space-y-5"
                >
                  {/* Username */}
                  <div className="form-group">
                    <FormField
                      id="username"
                      label="Username"
                      value={form.username}
                      onChange={handleChange}
                      placeholder="e.g. john_doe"
                      hint="3–30 chars · letters, numbers, underscores only"
                    />
                    {errors.username && (
                      <p className="mt-1 text-xs text-red-400">{errors.username}</p>
                    )}
                  </div>

                  {/* Full name */}
                  <div className="form-group">
                    <FormField
                      id="fullName"
                      label="Full Name"
                      value={form.fullName}
                      onChange={handleChange}
                      placeholder="e.g. John Doe"
                    />
                    {errors.fullName && (
                      <p className="mt-1 text-xs text-red-400">{errors.fullName}</p>
                    )}
                  </div>

                  {/* Contact & Phone — side by side */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="form-group">
                      <FormField
                        id="contact"
                        label="Contact / Handle"
                        value={form.contact}
                        onChange={handleChange}
                        placeholder="e.g. @john"
                      />
                      {errors.contact && (
                        <p className="mt-1 text-xs text-red-400">{errors.contact}</p>
                      )}
                    </div>

                    <div className="form-group">
                      <FormField
                        id="phone"
                        label="Phone Number"
                        type="tel"
                        value={form.phone}
                        onChange={handleChange}
                        placeholder="e.g. +8801XXXXXXXXX"
                      />
                      {errors.phone && (
                        <p className="mt-1 text-xs text-red-400">{errors.phone}</p>
                      )}
                    </div>
                  </div>

                  {/* Address */}
                  <div className="form-group">
                    <label htmlFor="address" className="form-label">Address</label>
                    <textarea
                      id="address"
                      name="address"
                      rows={2}
                      value={form.address}
                      onChange={handleChange}
                      placeholder="Your residential or mailing address"
                      className="form-input resize-none"
                    />
                    {errors.address && (
                      <p className="mt-1 text-xs text-red-400">{errors.address}</p>
                    )}
                  </div>

                  {/* Date of birth & NID — side by side */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="form-group">
                      <FormField
                        id="dateOfBirth"
                        label="Date of Birth"
                        type="date"
                        value={form.dateOfBirth}
                        onChange={handleChange}
                      />
                      {errors.dateOfBirth && (
                        <p className="mt-1 text-xs text-red-400">{errors.dateOfBirth}</p>
                      )}
                    </div>

                    <div className="form-group">
                      <FormField
                        id="nid"
                        label="NID Number"
                        value={form.nid}
                        onChange={handleChange}
                        placeholder="National ID number"
                      />
                      {errors.nid && (
                        <p className="mt-1 text-xs text-red-400">{errors.nid}</p>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      id="btn-save-profile"
                      disabled={saving}
                      className="flex-1 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Encrypting &amp; saving…
                        </span>
                      ) : (
                        '💾  Save Changes'
                      )}
                    </button>

                    <button
                      type="button"
                      id="btn-cancel-edit"
                      onClick={handleCancel}
                      disabled={saving}
                      className="rounded-xl bg-slate-700 px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-600 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* ── View Mode ────────────────────────────────────────── */
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-100">
                    Personal Information
                  </h2>
                  <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-400 ring-1 ring-emerald-400/30">
                    Decrypted view
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoRow label="Username"     value={profile?.username}    />
                  <InfoRow label="Email"        value={profile?.email}       />
                  <InfoRow label="Full Name"    value={profile?.fullName}    />
                  <InfoRow label="Contact"      value={profile?.contact}     />
                  <InfoRow label="Phone"        value={profile?.phone}       />
                  <InfoRow label="Date of Birth" value={profile?.dateOfBirth} />
                  <InfoRow label="NID Number"   value={profile?.nid} mono    />
                  <InfoRow label="Address"      value={profile?.address}     />
                </div>

                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <InfoRow label="Profile Created" value={formatDate(profile?.createdAt)} />
                  <InfoRow label="Last Updated"    value={formatDate(profile?.updatedAt)} />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    id="btn-edit-profile-bottom"
                    onClick={() => setEditing(true)}
                    className="rounded-xl bg-slate-700 px-5 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-blue-600 hover:text-white"
                  >
                    ✏️  Edit Information
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ProfilePage;
