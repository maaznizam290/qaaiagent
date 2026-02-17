import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Header } from '../components/Header';

const PLAN_RULES = [
  { name: 'Solo', maxSeats: 1, basePrice: 49 },
  { name: 'Startup', maxSeats: 20, basePrice: 299 },
  { name: 'Enterprise', maxSeats: Infinity, basePrice: 999 },
];

function estimatePrice(seats, runs, yearly) {
  const matchedPlan = PLAN_RULES.find((p) => seats <= p.maxSeats) || PLAN_RULES[PLAN_RULES.length - 1];
  const usageOverage = Math.max(0, runs - 2000);
  const overageCost = matchedPlan.name === 'Enterprise' ? 0 : Math.ceil(usageOverage / 1000) * 30;
  const monthly = matchedPlan.basePrice + overageCost;
  const total = yearly ? Math.round(monthly * 12 * 0.8) : monthly;
  return { plan: matchedPlan.name, total };
}

export default function PricingCalculatorPage() {
  const [teamSeats, setTeamSeats] = useState(5);
  const [monthlyRuns, setMonthlyRuns] = useState(1500);
  const [yearlyBilling, setYearlyBilling] = useState(false);

  const estimate = useMemo(
    () => estimatePrice(Number(teamSeats), Number(monthlyRuns), yearlyBilling),
    [teamSeats, monthlyRuns, yearlyBilling]
  );

  return (
    <>
      <Header />
      <main className="section">
        <div className="container narrow">
          <h1>Pricing Calculator</h1>
          <p>Estimate your recommended plan and spend based on team size and test run volume.</p>

          <section className="card">
            <form className="waitlist-form" onSubmit={(e) => e.preventDefault()}>
              <label>
                Team Seats
                <input
                  type="number"
                  min="1"
                  value={teamSeats}
                  onChange={(e) => setTeamSeats(e.target.value)}
                />
              </label>
              <label>
                Monthly Test Runs
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={monthlyRuns}
                  onChange={(e) => setMonthlyRuns(e.target.value)}
                />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={yearlyBilling}
                  onChange={(e) => setYearlyBilling(e.target.checked)}
                />
                Use yearly billing (20% discount)
              </label>
            </form>

            <div className="pricing-result">
              <h3>Recommended Plan: {estimate.plan}</h3>
              <p>
                <strong>Estimated Cost:</strong> ${estimate.total}
                {yearlyBilling ? '/year' : '/month'}
              </p>
            </div>
          </section>

          <div className="hero-actions">
            <Link className="btn btn-outline" to="/pricing/plans">
              View Plan Matrix
            </Link>
            <Link className="btn btn-primary" to="/pricing/faq">
              Read Billing FAQ
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
