import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';

import { Header } from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { registerSchema } from '../schemas';

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
  });

  async function onSubmit(values) {
    setServerError('');
    try {
      await registerUser(values);
      navigate('/self-healing', { replace: true });
    } catch (error) {
      setServerError(error.message || 'Unable to create account');
    }
  }

  return (
    <>
      <Header />
      <main className="page-center">
        <form className="auth-card" onSubmit={handleSubmit(onSubmit)} noValidate>
          <h1>Create Account</h1>

          <label>
            Full Name *
            <input type="text" {...register('name')} />
            {errors.name && <small className="error">{errors.name.message}</small>}
          </label>

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
            {isSubmitting ? 'Creating account...' : 'Create Account'}
          </button>

          {serverError && <p className="error">{serverError}</p>}

          <p>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </main>
    </>
  );
}
