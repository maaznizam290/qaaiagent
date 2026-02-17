import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Header() {
  const { isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  const menuItems = [
    ...(isAuthenticated ? [{ to: '/profile', label: 'Maaz' }] : []),
    { to: '/capabilities', label: 'Capabilities' },
    { to: '/roadmap', label: 'Roadmap' },
    { to: '/pricing', label: 'Pricing' },
    { to: '/pricing/calculator', label: 'Calculator' },
    { to: '/script-engine', label: 'Script Engine' },
    ...(isAuthenticated ? [{ to: '/self-healing', label: 'Self-Healing' }] : []),
    ...(isAuthenticated ? [{ to: '/ai-failure-analysis', label: 'AI Failure Analysis' }] : []),
  ];

  return (
    <header className="site-header">
      <div className="container nav-wrap">
        <div className="nav-left">
          <Link className="brand" to="/">
            Test Flux
          </Link>
        </div>

        <div className="nav-actions">
          {isAuthenticated ? (
            <>
              <button className="btn btn-outline" onClick={logout} type="button">
                Logout
              </button>
              <div className="menu-wrap">
                <button
                  className="btn btn-outline menu-toggle"
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-expanded={menuOpen}
                  aria-controls="main-menu"
                >
                  Menu
                </button>
                {menuOpen && (
                  <div id="main-menu" className="hamburger-menu">
                    {menuItems.map((item) => (
                      <NavLink key={item.to} to={item.to} className="menu-item">
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <NavLink className="btn btn-ghost" to="/login">
                Sign In
              </NavLink>
              <NavLink className="btn btn-primary" to="/register">
                Get Early Access
              </NavLink>
              <div className="menu-wrap">
                <button
                  className="btn btn-outline menu-toggle"
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-expanded={menuOpen}
                  aria-controls="main-menu"
                >
                  Menu
                </button>
                {menuOpen && (
                  <div id="main-menu" className="hamburger-menu">
                    {menuItems.map((item) => (
                      <NavLink key={item.to} to={item.to} className="menu-item">
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
