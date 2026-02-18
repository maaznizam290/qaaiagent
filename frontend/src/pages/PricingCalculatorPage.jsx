import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Header } from '../components/Header';

function calculateEstimatedCost(UserType, TeamSeats) {
  const individualBase = 39;
  const teamBase = 150;
  const standardSeats = 5;

  if (typeof UserType !== 'string') {
    throw new Error('Invalid input: UserType must be a string.');
  }

  const normalizedType = UserType.trim().toLowerCase();
  if (normalizedType !== 'individual' && normalizedType !== 'team') {
    throw new Error("Invalid input: UserType must be 'individual' or 'team'.");
  }

  if (!Number.isInteger(TeamSeats)) {
    throw new Error('Invalid input: TeamSeats must be an integer.');
  }

  if (TeamSeats <= 0) {
    throw new Error('Invalid input: TeamSeats must be greater than 0.');
  }

  if (normalizedType === 'individual') {
    return individualBase * TeamSeats;
  }

  return teamBase * (TeamSeats / standardSeats);
}

export default function PricingCalculatorPage() {
  const [teamSeats, setTeamSeats] = useState('5');
  const [userType, setUserType] = useState('team');

  const result = useMemo(() => {
    if (teamSeats === '' || userType.trim() === '') {
      return { estimatedCost: null, error: 'Enter Team Seats and User Type.' };
    }

    try {
      const estimatedCost = calculateEstimatedCost(userType, Number(teamSeats));
      return { estimatedCost, error: '' };
    } catch (error) {
      return { estimatedCost: null, error: error.message || 'Invalid input.' };
    }
  }, [teamSeats, userType]);

  return (
    <>
      <Header />
      <main className="section">
        <div className="container narrow">
          <h1>Pricing Calculator</h1>
          <p>Estimate annual pricing based on Team Seats and User Type.</p>

          <section className="card">
            <form className="waitlist-form" onSubmit={(e) => e.preventDefault()}>
              <label>
                Team Seats
                <input
                  type="number"
                  min="1"
                  value={teamSeats}
                  onChange={(e) => setTeamSeats(e.target.value)}
                  placeholder="Enter team seats (integer)"
                />
              </label>
              <label>
                User Type
                <select value={userType} onChange={(e) => setUserType(e.target.value)}>
                  <option value="individual">individual</option>
                  <option value="team">team</option>
                </select>
              </label>
            </form>

            <div className="pricing-result">
              {result.estimatedCost !== null ? (
                <>
                  <h3>Recommended Plan: {userType === 'individual' ? 'Individual' : 'Team'}</h3>
                  <p>
                    <strong>Estimated Cost:</strong> ${result.estimatedCost}/year
                  </p>
                </>
              ) : (
                <p>Enter valid Team Seats and User Type to see the estimate.</p>
              )}
              {result.error ? <p className="error">{result.error}</p> : null}
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
