import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => (
  <footer className="site-footer">
    <span className="site-footer-copy">Copyright 2026 Danish Pastry House is a Front.</span>
    <Link to="/privacy" className="site-footer-link">Privacy Policy</Link>
  </footer>
);

export default Footer;
