import React, { useState, useEffect } from 'react';
import { Users, Plus, Mail, Phone, Trash2, Search, Edit2, Save, X } from 'lucide-react';
import './ContactList.css';

const ContactList = () => {
  const [contacts, setContacts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newContact, setNewContact] = useState({
    name: '',
    email: '',
    phone: ''
  });
  const [editContact, setEditContact] = useState({
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

  const startEdit = (contact) => {
    setEditingId(contact.id);
    setEditContact({
      name: contact.name,
      email: contact.email || '',
      phone: contact.phone || ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContact({ name: '', email: '', phone: '' });
  };

  const saveEdit = (id) => {
    if (!editContact.name.trim()) {
      alert('Name is required');
      return;
    }

    setContacts(contacts.map(contact =>
      contact.id === id ? { ...contact, ...editContact } : contact
    ));
    cancelEdit();
  };

  const deleteContact = (id) => {
    if (window.confirm('Are you sure you want to delete this contact?')) {
      setContacts(contacts.filter(contact => contact.id !== id));
    }
  };

  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (contact.email && contact.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (contact.phone && contact.phone.includes(searchTerm))
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
              {editingId === contact.id ? (
                <div className="edit-contact-form">
                  <div className="contact-avatar">
                    {editContact.name.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="edit-fields">
                    <input
                      type="text"
                      value={editContact.name}
                      onChange={(e) => setEditContact({ ...editContact, name: e.target.value })}
                      placeholder="Name *"
                      className="edit-input"
                    />
                    <input
                      type="email"
                      value={editContact.email}
                      onChange={(e) => setEditContact({ ...editContact, email: e.target.value })}
                      placeholder="Email"
                      className="edit-input"
                    />
                    <input
                      type="tel"
                      value={editContact.phone}
                      onChange={(e) => setEditContact({ ...editContact, phone: e.target.value })}
                      placeholder="Phone"
                      className="edit-input"
                    />
                  </div>
                  <div className="edit-actions">
                    <button
                      className="save-contact-btn"
                      onClick={() => saveEdit(contact.id)}
                    >
                      <Save size={18} />
                    </button>
                    <button
                      className="cancel-contact-btn"
                      onClick={cancelEdit}
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
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
                  <div className="contact-actions">
                    <button
                      className="edit-contact-btn"
                      onClick={() => startEdit(contact)}
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      className="delete-contact-btn"
                      onClick={() => deleteContact(contact.id)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ContactList;
