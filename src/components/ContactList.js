import React, { useState, useEffect } from 'react';
import { Users, Plus, Mail, Phone, Trash2, Search } from 'lucide-react';
import './ContactList.css';

const ContactList = () => {
  const [contacts, setContacts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    email: '',
    phone: ''
  });

  useEffect(() => {
    // Load contacts from localStorage
    const savedContacts = localStorage.getItem('contacts');
    if (savedContacts) {
      setContacts(JSON.parse(savedContacts));
    } else {
      // Add some sample contacts
      const sampleContacts = [
        { id: 1, name: 'John Doe', email: 'john@example.com', phone: '(555) 123-4567' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', phone: '(555) 987-6543' }
      ];
      setContacts(sampleContacts);
    }
  }, []);

  useEffect(() => {
    // Save contacts to localStorage whenever they change
    localStorage.setItem('contacts', JSON.stringify(contacts));
  }, [contacts]);

  const addContact = (e) => {
    e.preventDefault();
    if (newContact.name.trim()) {
      setContacts([
        ...contacts,
        {
          id: Date.now(),
          ...newContact
        }
      ]);
      setNewContact({ name: '', email: '', phone: '' });
      setShowAddForm(false);
    }
  };

  const deleteContact = (id) => {
    setContacts(contacts.filter(contact => contact.id !== id));
  };

  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="contact-component">
      <div className="component-header">
        <Users size={24} />
        <h2>Contacts</h2>
      </div>

      <div className="search-bar">
        <Search size={18} />
        <input
          type="text"
          placeholder="Search contacts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <button
        className="add-contact-btn"
        onClick={() => setShowAddForm(!showAddForm)}
      >
        <Plus size={20} />
        Add Contact
      </button>

      {showAddForm && (
        <form className="add-contact-form" onSubmit={addContact}>
          <input
            type="text"
            placeholder="Name *"
            value={newContact.name}
            onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={newContact.email}
            onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
          />
          <input
            type="tel"
            placeholder="Phone"
            value={newContact.phone}
            onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
          />
          <div className="form-buttons">
            <button type="submit" className="save-btn">Save</button>
            <button
              type="button"
              className="cancel-btn"
              onClick={() => {
                setShowAddForm(false);
                setNewContact({ name: '', email: '', phone: '' });
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="contacts-list">
        {filteredContacts.length === 0 ? (
          <div className="empty-state">
            <Users size={48} />
            <p>No contacts found</p>
          </div>
        ) : (
          filteredContacts.map(contact => (
            <div key={contact.id} className="contact-item">
              <div className="contact-avatar">
                {contact.name.charAt(0).toUpperCase()}
              </div>
              <div className="contact-info">
                <h3>{contact.name}</h3>
                {contact.email && (
                  <div className="contact-detail">
                    <Mail size={14} />
                    <span>{contact.email}</span>
                  </div>
                )}
                {contact.phone && (
                  <div className="contact-detail">
                    <Phone size={14} />
                    <span>{contact.phone}</span>
                  </div>
                )}
              </div>
              <button
                className="delete-contact-btn"
                onClick={() => deleteContact(contact.id)}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ContactList;
