import { Header } from '../components/Header';
import { useAuth } from '../context/AuthContext';

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <>
      <Header />
      <main className="section">
        <div className="container narrow">
          <h1>Profile</h1>
          <section className="card">
            <h3>Account Details</h3>
            <p>
              <strong>Name:</strong> {user?.name || 'N/A'}
            </p>
            <p>
              <strong>Email:</strong> {user?.email || 'N/A'}
            </p>
            <p>
              <strong>Role:</strong> {user?.role || 'User'}
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
