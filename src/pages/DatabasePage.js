import React, { useState } from 'react';
import { Menu, Database, RefreshCw, Plus, Trash2, Edit2, Save, X, ChevronRight } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import supabase from '../utils/supabaseClient';
import './DatabasePage.css';
import './PageLayout.css';

// Columns auto-managed by Postgres — shown but not editable
const READ_ONLY_COLS = new Set(['id', 'created_at', 'updated_at']);

// Infer column names from Supabase's OpenAPI spec when the table is empty.
// Returns an array of column name strings, or null on failure.
const fetchTableSchema = async (tableName) => {
  try {
    const res = await fetch(`${process.env.REACT_APP_SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: process.env.REACT_APP_SUPABASE_ANON_KEY },
    });
    const spec = await res.json();
    const props = spec.definitions?.[tableName]?.properties;
    return props ? Object.keys(props) : null;
  } catch {
    return null;
  }
};

const DatabasePage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inputTable, setInputTable] = useState('');
  const [tableName, setTableName] = useState('');
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [addingRow, setAddingRow] = useState(false);
  const [newRowValues, setNewRowValues] = useState({});
  const [saving, setSaving] = useState(false);

  // Show setup instructions if env vars are missing
  if (!supabase) {
    return (
      <div className="page-layout">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="page-header">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <h1>Database</h1>
        </div>
        <div className="page-content">
          <div className="db-not-configured">
            <Database size={48} />
            <h2>Supabase not configured</h2>
            <p>Add these to your <code>.env</code> file and restart the dev server:</p>
            <pre className="db-env-block">
{`REACT_APP_SUPABASE_URL=https://xxxx.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key`}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  // Load rows for the entered table name
  const loadTable = async () => {
    const target = inputTable.trim();
    if (!target) return;

    setLoading(true);
    setError(null);
    setEditingId(null);
    setAddingRow(false);
    setRows([]);
    setColumns([]);

    const { data, error: fetchError } = await supabase
      .from(target)
      .select('*')
      .limit(200);

    if (fetchError) {
      setError(fetchError.message);
    } else {
      const loaded = data || [];
      let cols;
      if (loaded.length > 0) {
        cols = Object.keys(loaded[0]);
      } else {
        // Empty table — try to get schema from OpenAPI spec
        cols = (await fetchTableSchema(target)) || [];
      }
      setRows(loaded);
      setColumns(cols);
      setTableName(target);
    }
    setLoading(false);
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditValues({ ...row });
    setAddingRow(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  // Persist row changes; excludes auto-managed columns from the update payload
  const saveEdit = async () => {
    if (!('id' in editValues)) {
      setError('Cannot edit: no id column found. Edit/delete require an id column.');
      return;
    }
    setSaving(true);
    const updates = Object.fromEntries(
      Object.entries(editValues).filter(([k]) => !READ_ONLY_COLS.has(k))
    );
    const { error: saveError } = await supabase
      .from(tableName)
      .update(updates)
      .eq('id', editValues.id);

    if (saveError) {
      setError(saveError.message);
    } else {
      setRows(rows.map(r => r.id === editValues.id ? { ...r, ...editValues } : r));
      setEditingId(null);
    }
    setSaving(false);
  };

  const deleteRow = async (id) => {
    if (!window.confirm('Delete this row?')) return;
    const { error: delError } = await supabase
      .from(tableName)
      .delete()
      .eq('id', id);

    if (delError) {
      setError(delError.message);
    } else {
      setRows(rows.filter(r => r.id !== id));
    }
  };

  const startAddRow = () => {
    const blank = Object.fromEntries(
      columns.filter(c => !READ_ONLY_COLS.has(c)).map(c => [c, ''])
    );
    setNewRowValues(blank);
    setAddingRow(true);
    setEditingId(null);
  };

  // Insert new row; Supabase auto-fills id/created_at/updated_at
  const saveNewRow = async () => {
    setSaving(true);
    const { data, error: insertError } = await supabase
      .from(tableName)
      .insert(newRowValues)
      .select();

    if (insertError) {
      setError(insertError.message);
    } else {
      const inserted = data || [];
      setRows([...inserted, ...rows]);
      if (columns.length === 0 && inserted.length > 0) {
        setColumns(Object.keys(inserted[0]));
      }
      setAddingRow(false);
      setNewRowValues({});
    }
    setSaving(false);
  };

  const hasIdCol = columns.includes('id');
  const editableCols = columns.filter(c => !READ_ONLY_COLS.has(c));

  return (
    <div className="page-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="page-header">
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
        <h1>Database</h1>
      </div>

      <div className="page-content db-page-content">

        {/* Table selector toolbar */}
        <div className="db-toolbar">
          <div className="db-input-wrap">
            <Database size={16} className="db-input-icon" />
            <input
              type="text"
              className="db-table-input"
              placeholder="Table name..."
              value={inputTable}
              onChange={e => setInputTable(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadTable()}
            />
            <button
              className="db-load-btn"
              onClick={loadTable}
              disabled={loading || !inputTable.trim()}
            >
              {loading
                ? <RefreshCw size={15} className="db-spinning" />
                : <ChevronRight size={15} />
              }
              Load
            </button>
          </div>

          {tableName && (
            <div className="db-toolbar-actions">
              <span className="db-row-count">{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
              <button
                className="db-new-row-btn"
                onClick={startAddRow}
                disabled={addingRow || editableCols.length === 0}
              >
                <Plus size={15} />
                New Row
              </button>
            </div>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="db-error-banner">
            <span>{error}</span>
            <button className="db-error-dismiss" onClick={() => setError(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="db-loading">
            <RefreshCw size={22} className="db-spinning" />
            <span>Loading {inputTable}…</span>
          </div>
        )}

        {/* Table card */}
        {tableName && !loading && (
          <div className="db-card">
            <div className="db-card-title">
              <Database size={15} />
              <span>{tableName}</span>
            </div>

            {columns.length === 0 ? (
              <div className="db-empty">
                <p>No rows in <strong>{tableName}</strong> and schema could not be detected.</p>
                <p>Populate the table via the Supabase dashboard, then reload.</p>
              </div>
            ) : (
              <div className="db-scroll">
                <table className="db-table">
                  <thead>
                    <tr>
                      {columns.map(col => (
                        <th key={col}>
                          {col}
                          {READ_ONLY_COLS.has(col) && (
                            <span className="db-auto-badge">auto</span>
                          )}
                        </th>
                      ))}
                      <th className="db-th-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>

                    {/* New row inputs */}
                    {addingRow && (
                      <tr className="db-row-new">
                        {columns.map(col => (
                          <td key={col}>
                            {READ_ONLY_COLS.has(col)
                              ? <span className="db-auto-val">auto</span>
                              : (
                                <input
                                  className="db-cell-input"
                                  placeholder={col}
                                  value={newRowValues[col] ?? ''}
                                  onChange={e =>
                                    setNewRowValues({ ...newRowValues, [col]: e.target.value })
                                  }
                                />
                              )
                            }
                          </td>
                        ))}
                        <td className="db-td-actions">
                          <button className="db-btn-save" onClick={saveNewRow} disabled={saving} title="Save">
                            <Save size={14} />
                          </button>
                          <button className="db-btn-cancel" onClick={() => setAddingRow(false)} title="Cancel">
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    )}

                    {/* Existing rows */}
                    {rows.map((row, i) => (
                      <tr key={row.id ?? i} className={editingId === row.id ? 'db-row-editing' : ''}>
                        {columns.map(col => (
                          <td key={col}>
                            {editingId === row.id && !READ_ONLY_COLS.has(col)
                              ? (
                                <input
                                  className="db-cell-input"
                                  value={editValues[col] ?? ''}
                                  onChange={e =>
                                    setEditValues({ ...editValues, [col]: e.target.value })
                                  }
                                />
                              )
                              : (
                                <span className="db-cell-val" title={String(row[col] ?? '')}>
                                  {String(row[col] ?? '')}
                                </span>
                              )
                            }
                          </td>
                        ))}
                        <td className="db-td-actions">
                          {editingId === row.id ? (
                            <>
                              <button className="db-btn-save" onClick={saveEdit} disabled={saving} title="Save">
                                <Save size={14} />
                              </button>
                              <button className="db-btn-cancel" onClick={cancelEdit} title="Cancel">
                                <X size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="db-btn-edit"
                                onClick={() => startEdit(row)}
                                disabled={!hasIdCol}
                                title={hasIdCol ? 'Edit' : 'Requires id column'}
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                className="db-btn-delete"
                                onClick={() => deleteRow(row.id)}
                                disabled={!hasIdCol}
                                title={hasIdCol ? 'Delete' : 'Requires id column'}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}

                    {rows.length === 0 && !addingRow && (
                      <tr>
                        <td colSpan={columns.length + 1} className="db-no-rows">
                          No rows yet. Click <strong>New Row</strong> to add one.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DatabasePage;
