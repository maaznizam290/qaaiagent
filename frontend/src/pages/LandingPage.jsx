import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { NavLink } from 'react-router-dom';

import { api } from '../api';
import { Header } from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { challenges, pricing, roadmap } from '../content';
import { waitlistSchema } from '../schemas';

export default function LandingPage() {
  const { token } = useAuth();
  const [submitMessage, setSubmitMessage] = useState('');
  const [submitError, setSubmitError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: zodResolver(waitlistSchema),
    defaultValues: {
      email: '',
      fullName: '',
      company: '',
      role: '',
    },
  });

  async function onSubmit(values) {
    setSubmitMessage('');
    setSubmitError('');

    try {
      const payload = {
        email: values.email,
        fullName: values.fullName || undefined,
        company: values.company || undefined,
        role: values.role || undefined,
      };
      const result = await api.waitlist(payload, token);
      setSubmitMessage(result.message);
      reset();
    } catch (error) {
      setSubmitError(error.message || 'Unable to submit waitlist form');
    }
  }

  return (
    <>
      <Header />

      <main>
        <section className="hero section">
          <div className="container">
            <p className="eyebrow">Autonomous QA Platform</p>
            <h1>Test Flux writes tests, self-heals failures, and evolves with your codebase.</h1>
            <p className="subhead">Ship faster with reliable AI-assisted test automation from idea to CI.</p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#waitlist">
                Get Early Access
              </a>
              <NavLink className="btn btn-outline" to="/roadmap">
                Watch Demo
              </NavLink>
            </div>
            <div className="stats">
              <article>
                <strong>10x</strong>
                <span>Faster Test Creation</span>
              </article>
              <article>
                <strong>90%</strong>
                <span>Less Maintenance</span>
              </article>
              <article>
                <strong>30min</strong>
                <span>Regression Cycles</span>
              </article>
            </div>
          </div>
        </section>

        <section id="capabilities" className="section alt">
          <div className="container">
            <h2>Capabilities</h2>
            <div className="grid-3">
              {challenges.map((item) => (
                <article key={item.title} className="card">
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="roadmap" className="section">
          <div className="container">
            <h2>Product Roadmap</h2>
            <div className="roadmap-grid">
              {roadmap.map((phase) => (
                <article key={phase.phase} className="card">
                  <p className="eyebrow">{phase.phase}</p>
                  <h3>{phase.title}</h3>
                  <p>{phase.timeline}</p>
                  <ul>
                    {phase.items.map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                  <p className="outcome">{phase.outcome}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="section alt">
          <div className="container">
            <h2>Simple, Transparent Pricing</h2>
            <div className="grid-3">
              {pricing.map((plan) => (
                <article key={plan.name} className={`card ${plan.popular ? 'featured' : ''}`}>
                  {plan.popular && <span className="badge">Most Popular</span>}
                  <h3>{plan.name}</h3>
                  <p>{plan.description}</p>
                  <p>
                    <strong>{plan.price}</strong>
                    {plan.period}
                  </p>
                  <ul>
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="waitlist" className="section">
          <div className="container narrow">
            <h2>Ready to Transform Your QA?</h2>
            <p>Join the waitlist for early access. Be among the first to experience autonomous QA.</p>

            <form className="waitlist-form" onSubmit={handleSubmit(onSubmit)} noValidate>
              <label>
                Email *
                <input type="email" {...register('email')} placeholder="Enter your email" />
                {errors.email && <small className="error">{errors.email.message}</small>}
              </label>

              <label>
                Full Name (optional)
                <input type="text" {...register('fullName')} placeholder="Jane Doe" />
                {errors.fullName && <small className="error">{errors.fullName.message}</small>}
              </label>

              <label>
                Company (optional)
                <input type="text" {...register('company')} placeholder="Acme Inc" />
                {errors.company && <small className="error">{errors.company.message}</small>}
              </label>

              <label>
                Role (optional)
                <input type="text" {...register('role')} placeholder="QA Lead" />
                {errors.role && <small className="error">{errors.role.message}</small>}
              </label>

              <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Join Waitlist'}
              </button>

              {submitMessage && <p className="success">{submitMessage}</p>}
              {submitError && <p className="error">{submitError}</p>}
            </form>
          </div>
        </section>
      </main>
    </>
  );
}
