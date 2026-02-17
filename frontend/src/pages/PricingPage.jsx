import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocation } from 'react-router-dom';

import { Header } from '../components/Header';
import { pricing } from '../content';

function normalizePlanName(value) {
  return String(value || '').trim().toLowerCase();
}

function getPlanFromSearch(search) {
  const params = new URLSearchParams(search || '');
  const requested = normalizePlanName(params.get('plan'));
  const matched = pricing.find((plan) => normalizePlanName(plan.name) === requested);
  return matched?.name || pricing[0]?.name || 'Solo';
}

export default function PricingPage() {
  const location = useLocation();
  const [selectedPlan, setSelectedPlan] = useState(() => getPlanFromSearch(location.search));
  const matrixRef = useRef(null);
  const allFeatures = useMemo(() => Array.from(new Set(pricing.flatMap((plan) => plan.features))), []);

  useEffect(() => {
    setSelectedPlan(getPlanFromSearch(location.search));
  }, [location.search]);

  function handlePlanClick(planName) {
    setSelectedPlan(planName);
    matrixRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      <Header />
      <main className="section alt">
        <div className="container">
          <h1>Pricing</h1>
          <p>Choose the plan that fits your team today, then scale without migration pain later.</p>
          <div className="grid-3">
            {pricing.map((plan) => (
              <button
                key={plan.name}
                type="button"
                className={`card plan-select-card ${plan.popular ? 'featured' : ''} ${selectedPlan === plan.name ? 'plan-selected' : ''}`}
                onClick={() => handlePlanClick(plan.name)}
              >
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
              </button>
            ))}
          </div>

          <section className="card section-compact" ref={matrixRef}>
            <h3>Feature Matrix</h3>
            <p>Selected Plan: <strong>{selectedPlan}</strong></p>
            <div className="table-wrap">
              <table className="pricing-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    {pricing.map((plan) => (
                      <th key={plan.name}>{plan.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allFeatures.map((feature) => (
                    <tr key={feature}>
                      <td>{feature}</td>
                      {pricing.map((plan) => (
                        <td key={`${plan.name}-${feature}`} className={selectedPlan === plan.name ? 'feature-selected-col' : ''}>
                          {plan.features.includes(feature) ? 'Yes' : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="hero-actions">
            <Link className="btn btn-outline" to="/pricing/plans">
              Detailed Plan Comparison
            </Link>
            <Link className="btn btn-outline" to="/pricing/calculator">
              Pricing Calculator
            </Link>
            <Link className="btn btn-primary" to="/pricing/faq">
              Billing FAQ
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
