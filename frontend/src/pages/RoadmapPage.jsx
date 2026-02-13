import { Header } from '../components/Header';
import { roadmap } from '../content';

export default function RoadmapPage() {
  return (
    <>
      <Header />
      <main className="section">
        <div className="container">
          <h1>Product Roadmap</h1>
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
      </main>
    </>
  );
}
