import React, { useState, useEffect, useCallback } from 'react';
import { ListTodo, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  fetchGoogleTasks, createGoogleTask, updateGoogleTask, deleteGoogleTask,
} from '../utils/googleCalendar';
import { Panel, PanelHeader } from './Panel';
import './TasksWidget.css';

// TasksWidget — dashboard panel for the user's Google Tasks (the OAuth scope
// the login screen has always requested finally gets a UI). Lists open tasks
// (overdue/dated first), checks them off, quick-adds to the default list,
// and deletes. All reads/writes go straight to the Google Tasks API via the
// existing utils; nothing is stored in Loop's DB.
export default function TasksWidget() {
  const [tasks,    setTasks]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [newText,  setNewText]  = useState('');
  const [adding,   setAdding]   = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [busyIds,  setBusyIds]  = useState(new Set()); // tasks mid-toggle/delete

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTasks(await fetchGoogleTasks());
    } catch (err) {
      setError(err.message || 'Could not load tasks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setBusy = (id, on) => setBusyIds(prev => {
    const next = new Set(prev);
    on ? next.add(id) : next.delete(id);
    return next;
  });

  // toggle — optimistic check-off, rolled back if Google rejects the patch.
  const toggle = async (task) => {
    setBusy(task.id, true);
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t));
    try {
      await updateGoogleTask(task.listId, task.id, { text: task.text, completed: !task.completed });
    } catch {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: task.completed } : t));
    } finally {
      setBusy(task.id, false);
    }
  };

  const remove = async (task) => {
    setBusy(task.id, true);
    try {
      await deleteGoogleTask(task.listId, task.id);
      setTasks(prev => prev.filter(t => t.id !== task.id));
    } catch {
      setBusy(task.id, false);
    }
  };

  const add = async () => {
    const text = newText.trim();
    if (!text || adding) return;
    setAdding(true);
    try {
      const task = await createGoogleTask(text);
      setTasks(prev => [task, ...prev]);
      setNewText('');
    } catch {
      setError('Could not add the task.');
    } finally {
      setAdding(false);
    }
  };

  // dueLabel — "Overdue"/"Today"/"Tomorrow"/short date for a task's due date.
  const dueLabel = (iso) => {
    if (!iso) return null;
    const due = new Date(iso);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dueDay = new Date(due); dueDay.setHours(0, 0, 0, 0);
    const diff = Math.round((dueDay - today) / 86400000);
    if (diff < 0)  return { text: 'Overdue', cls: 'overdue' };
    if (diff === 0) return { text: 'Today', cls: 'today' };
    if (diff === 1) return { text: 'Tomorrow', cls: '' };
    return { text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), cls: '' };
  };

  // Open tasks first, dated ones (earliest due) before undated.
  const open = tasks
    .filter(t => !t.completed)
    .sort((a, b) => (a.due ? new Date(a.due) : Infinity) - (b.due ? new Date(b.due) : Infinity));
  const done = tasks.filter(t => t.completed);

  return (
    <Panel className="tw-panel">
      <PanelHeader icon={ListTodo} title="Tasks">
        <button className="panel-icon-btn" onClick={load} title="Refresh">
          <RefreshCw size={14} />
        </button>
      </PanelHeader>

      <div className="tw-body">
        <div className="tw-add-row">
          <input
            className="tw-input"
            type="text"
            placeholder="Add a task…"
            value={newText}
            maxLength={200}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            disabled={adding}
          />
          <button className="tw-add-btn" onClick={add} disabled={adding || !newText.trim()} title="Add task">
            <Plus size={15} />
          </button>
        </div>

        {error && <p className="tw-error">{error}</p>}

        {loading ? (
          <p className="tw-hint">Loading…</p>
        ) : open.length === 0 && done.length === 0 ? (
          <p className="tw-hint">Nothing on your list. Anything you add here syncs with Google Tasks.</p>
        ) : (
          <>
            <ul className="tw-list">
              {open.map(t => {
                const due = dueLabel(t.due);
                return (
                  <li key={t.id} className="tw-item">
                    <input
                      type="checkbox"
                      className="tw-check"
                      checked={false}
                      disabled={busyIds.has(t.id)}
                      onChange={() => toggle(t)}
                      title="Mark done"
                    />
                    <span className="tw-text">{t.text}</span>
                    {due && <span className={`tw-due ${due.cls}`}>{due.text}</span>}
                    <button className="tw-del" title="Delete task" disabled={busyIds.has(t.id)}
                      onClick={() => remove(t)}>
                      <Trash2 size={12} />
                    </button>
                  </li>
                );
              })}
            </ul>

            {done.length > 0 && (
              <>
                <button className="tw-done-toggle" onClick={() => setShowDone(v => !v)}>
                  {showDone ? 'Hide' : 'Show'} completed ({done.length})
                </button>
                {showDone && (
                  <ul className="tw-list tw-list-done">
                    {done.map(t => (
                      <li key={t.id} className="tw-item done">
                        <input
                          type="checkbox"
                          className="tw-check"
                          checked
                          disabled={busyIds.has(t.id)}
                          onChange={() => toggle(t)}
                          title="Mark not done"
                        />
                        <span className="tw-text">{t.text}</span>
                        <button className="tw-del" title="Delete task" disabled={busyIds.has(t.id)}
                          onClick={() => remove(t)}>
                          <Trash2 size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
