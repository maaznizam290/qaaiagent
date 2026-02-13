import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Header() {
  const { isAuthenticated, user, logout } = useAuth();

  return (
    <header className="site-header">
      <div className="container nav-wrap">
        <Link className="brand" to="/">
          Test Flux
        </Link>

        <nav className="nav-links">
          <NavLink to="/capabilities">Capabilities</NavLink>
          <NavLink to="/roadmap">Roadmap</NavLink>
          <NavLink to="/pricing">Pricing</NavLink>
          <NavLink to="/script-engine">Script Engine</NavLink>
          {isAuthenticated && <NavLink to="/self-healing">Self-Healing</NavLink>}
        </nav>

        <div className="nav-actions">
          {isAuthenticated ? (
            <>
              <NavLink className="btn btn-ghost" to="/dashboard">
                {user?.name || 'Dashboard'}
              </NavLink>
              <button className="btn btn-outline" onClick={logout} type="button">
                Logout
              </button>
            </>
          ) : (
            <>
              <NavLink className="btn btn-ghost" to="/login">
                Sign In
              </NavLink>
              <NavLink className="btn btn-primary" to="/register">
                Get Early Access
              </NavLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
