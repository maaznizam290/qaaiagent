import { Header } from '../components/Header';
import { challenges } from '../content';

export default function CapabilitiesPage() {
  return (
    <>
      <Header />
      <main className="section alt">
        <div className="container">
          <h1>Capabilities</h1>
          <div className="grid-3">
            {challenges.map((item) => (
              <article key={item.title} className="card">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
