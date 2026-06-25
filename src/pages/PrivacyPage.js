import React from 'react';
import { Link } from 'react-router-dom';
import './PrivacyPage.css';

const PrivacyPage = () => (
  <div className="privacy-page">
    <Link to="/dashboard" className="privacy-back">← Back</Link>
    <h1>Privacy Policy</h1>
  </div>
);

export default PrivacyPage;
