import { Link } from 'react-router-dom';

import { Header } from '../components/Header';
import { pricing } from '../content';

const ALL_FEATURES = Array.from(new Set(pricing.flatMap((plan) => plan.features)));

function hasFeature(plan, feature) {
  return plan.features.includes(feature);
}

export default function PricingPlansPage() {
  return (
    <>
      <Header />
      <main className="section alt">
        <div className="container">
          <h1>Pricing Plans</h1>
          <p>Detailed plan comparison for teams scaling from single QA ownership to enterprise governance.</p>

          <section className="grid-3 section-compact">
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
          </section>

          <section className="card section-compact">
            <h3>Feature Matrix</h3>
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
                  {ALL_FEATURES.map((feature) => (
                    <tr key={feature}>
                      <td>{feature}</td>
                      {pricing.map((plan) => (
                        <td key={`${plan.name}-${feature}`}>{hasFeature(plan, feature) ? 'Yes' : '-'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="hero-actions">
            <Link className="btn btn-outline" to="/pricing/calculator">
              Estimate Cost
            </Link>
            <Link className="btn btn-primary" to="/pricing/faq">
              Pricing FAQ
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
