import React, { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isDemo, exitDemo } from '../demo/demoStore';
import { uninstallDemoFetch } from '../demo/demoFetch';
import './DemoBanner.css';

// DemoBanner — the standing reminder that none of this is real, on every page
// while demo mode is on.
//
// A visitor who wandered in from the landing page needs to be able to tell at a
// glance that the friends, calendar and messages are made up, and needs a way
// out that doesn't involve clearing storage by hand. The assistant carries its
// own separate notice (ChatHub) because that's where the fakery is easiest to
// mistake for the real thing.
const DemoBanner = () => {
  const ref = useRef(null);
  // Reading isDemo() alone would leave the banner on screen after logging out
  // of a demo: it clears the flag but nothing re-renders this component.
  // Subscribing to auth state gives it the re-render it needs.
  const { isAuthenticated } = useAuth();

  // The banner's height is not a constant: its text wraps to two or three
  // lines on a phone. The sticky page header sits below it via
  // `top: var(--dm-banner-h)` (App.css), so a hardcoded value would leave the
  // header stuck *inside* the banner on narrow screens — and since the banner
  // wins on z-index, that hides the nav entirely. Measure instead.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () =>
      document.documentElement.style.setProperty('--dm-banner-h', `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--dm-banner-h');
    };
  }, []);

  if (!isAuthenticated || !isDemo()) return null;

  // leave — tear the demo down completely, then hard-reload. The reload is not
  // optional: components are holding demo data in state, and the patched fetch
  // has to be gone before anything issues a real request.
  const leave = () => {
    exitDemo();
    uninstallDemoFetch();
    window.location.href = '/dashboard';
  };

  const signUp = () => {
    exitDemo();
    uninstallDemoFetch();
    window.location.href = '/login';
  };

  return (
    <div className="dm-banner" role="status" ref={ref}>
      <span className="dm-banner-text">
        <strong>Demo.</strong> These friends, messages and events are made up — nothing is saved.
      </span>
      <div className="dm-banner-actions">
        <button className="dm-banner-btn" onClick={leave}>Exit demo</button>
        <button className="dm-banner-btn dm-banner-primary" onClick={signUp}>Sign up</button>
      </div>
    </div>
  );
};

export default DemoBanner;
