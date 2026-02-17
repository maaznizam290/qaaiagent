import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { api } from '../api';
import { Header } from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { loginSchema } from '../schemas';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  async function onSubmit(values) {
    setServerError('');
    try {
      const check = await api.userExists(values.email);
      if (!check.exists) {
        setServerError('This user is not found');
        return;
      }
    } catch (error) {
      // Fall through to login and use backend-authored errors.
    }

    try {
      await login(values);
      navigate(location.state?.from?.pathname || '/self-healing', { replace: true });
    } catch (error) {
      if (error.message === 'This user is not found') {
        setServerError('This user is not found');
        return;
      }
      setServerError(error.message === 'Request failed' ? 'This user is not found' : error.message || 'Unable to sign in');
    }
  }

  return (
    <>
      <Header />
      <main className="page-center">
        <form className="auth-card" onSubmit={handleSubmit(onSubmit)} noValidate>
          <h1>Sign In</h1>

          <label>
            Email *
            <input type="email" {...register('email')} />
            {errors.email && <small className="error">{errors.email.message}</small>}
          </label>

          <label>
            Password *
            <input type="password" {...register('password')} />
            {errors.password && <small className="error">{errors.password.message}</small>}
          </label>

          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>

          {serverError && <p className="error">{serverError}</p>}

          <p>
            Need an account? <Link to="/register">Register</Link>
          </p>
        </form>
      </main>
    </>
  );
}
