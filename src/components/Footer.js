import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => (
  <footer className="site-footer">
    <span className="site-footer-copy">© 2026 Loop</span>
    <Link to="/privacy" className="site-footer-link">Privacy Policy</Link>
  </footer>
);

export default Footer;
