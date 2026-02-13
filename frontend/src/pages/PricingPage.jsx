import { Header } from '../components/Header';
import { pricing } from '../content';

export default function PricingPage() {
  return (
    <>
      <Header />
      <main className="section alt">
        <div className="container">
          <h1>Pricing</h1>
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
      </main>
    </>
  );
}
