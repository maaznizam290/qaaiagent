import { Link } from 'react-router-dom';

import { Header } from '../components/Header';

const FAQS = [
  {
    q: 'Can we switch plans mid-cycle?',
    a: 'Yes. Upgrades are immediate and prorated. Downgrades apply at the next billing cycle.',
  },
  {
    q: 'Do you offer annual discounts?',
    a: 'Yes. Annual billing applies a 20% discount compared to month-to-month pricing.',
  },
  {
    q: 'What happens if we exceed test-run limits?',
    a: 'For non-enterprise plans, overage is billed in usage blocks. Enterprise includes negotiated limits.',
  },
  {
    q: 'Is enterprise onboarding included?',
    a: 'Enterprise includes a dedicated onboarding specialist and a customer success manager.',
  },
];

export default function PricingFaqPage() {
  return (
    <>
      <Header />
      <main className="section alt">
        <div className="container narrow">
          <h1>Pricing FAQ</h1>
          <div className="roadmap-grid">
            {FAQS.map((item) => (
              <article key={item.q} className="card">
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </article>
            ))}
          </div>
          <div className="hero-actions">
            <Link className="btn btn-outline" to="/pricing/plans">
              Compare Plans
            </Link>
            <Link className="btn btn-primary" to="/pricing/calculator">
              Open Calculator
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
