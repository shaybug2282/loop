import React, { useState, useEffect } from 'react';
import { CheckSquare, Square, Plus, Trash2, RefreshCw, Edit2, Save, X } from 'lucide-react';
import { fetchGoogleTasks, updateGoogleTask, deleteGoogleTask } from '../utils/googleCalendar';
import './TodoList.css';

const TodoList = () => {
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    loadTodos();
  }, []);

  useEffect(() => {
    // Save only local todos to localStorage
    const localTodos = todos.filter(t => !t.fromGoogle);
    localStorage.setItem('todos', JSON.stringify(localTodos));
  }, [todos]);

  const loadTodos = async () => {
    try {
      setLoading(true);
      
      // Load local todos
      const savedTodos = localStorage.getItem('todos');
      const localTodos = savedTodos ? JSON.parse(savedTodos) : [];
      
      // Load Google Tasks
      const googleTasks = await fetchGoogleTasks();
      
      // Combine both
      setTodos([...googleTasks, ...localTodos]);
    } catch (error) {
      console.error('Error loading todos:', error);
      // If Google Tasks fail, still load local todos
      const savedTodos = localStorage.getItem('todos');
      if (savedTodos) {
        setTodos(JSON.parse(savedTodos));
      }
    } finally {
      setLoading(false);
    }
  };

  const addTodo = (e) => {
    e.preventDefault();
    if (newTodo.trim()) {
      setTodos([
        ...todos,
        {
          id: Date.now(),
          text: newTodo,
          completed: false,
          createdAt: new Date().toISOString(),
          fromGoogle: false
        }
      ]);
      setNewTodo('');
    }
  };

  const toggleTodo = async (todo) => {
    if (todo.fromGoogle) {
      // Update Google Task
      try {
        await updateGoogleTask(todo.listId, todo.id, {
          text: todo.text,
          completed: !todo.completed
        });
        
        setTodos(todos.map(t =>
          t.id === todo.id ? { ...t, completed: !t.completed } : t
        ));
      } catch (error) {
        console.error('Error updating Google Task:', error);
        alert('Failed to update task. Please try again.');
      }
    } else {
      // Update local todo
      setTodos(todos.map(t =>
        t.id === todo.id ? { ...t, completed: !t.completed } : t
      ));
    }
  };

  const deleteTodo = async (todo) => {
    if (todo.fromGoogle) {
      // Delete Google Task
      try {
        await deleteGoogleTask(todo.listId, todo.id);
        setTodos(todos.filter(t => t.id !== todo.id));
      } catch (error) {
        console.error('Error deleting Google Task:', error);
        alert('Failed to delete task. Please try again.');
      }
    } else {
      // Delete local todo
      setTodos(todos.filter(t => t.id !== todo.id));
    }
  };

  const startEdit = (todo) => {
    setEditingId(todo.id);
    setEditText(todo.text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const saveEdit = async (todo) => {
    if (!editText.trim()) {
      cancelEdit();
      return;
    }

    if (todo.fromGoogle) {
      // Update Google Task
      try {
        await updateGoogleTask(todo.listId, todo.id, {
          text: editText,
          completed: todo.completed
        });
        
        setTodos(todos.map(t =>
          t.id === todo.id ? { ...t, text: editText } : t
        ));
        cancelEdit();
      } catch (error) {
        console.error('Error updating Google Task:', error);
        alert('Failed to update task. Please try again.');
      }
    } else {
      // Update local todo
      setTodos(todos.map(t =>
        t.id === todo.id ? { ...t, text: editText } : t
      ));
      cancelEdit();
    }
  };

  const activeTodos = todos.filter(t => !t.completed);
  const completedTodos = todos.filter(t => t.completed);

  if (loading) {
    return (
      <div className="todo-component">
        <div className="component-header">
          <CheckSquare size={24} />
          <h2>To-Do List</h2>
        </div>
        <div className="loading">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="todo-component">
      <div className="component-header">
        <CheckSquare size={24} />
        <h2>To-Do List</h2>
        <button onClick={loadTodos} className="refresh-btn" title="Refresh from Google">
          <RefreshCw size={18} />
        </button>
      </div>

      <form className="todo-input-form" onSubmit={addTodo}>
        <input
          type="text"
          placeholder="Add a new task..."
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          className="todo-input"
        />
        <button type="submit" className="add-btn">
          <Plus size={20} />
        </button>
      </form>

      <div className="todos-container">
        {activeTodos.length === 0 && completedTodos.length === 0 ? (
          <div className="empty-state">
            <CheckSquare size={48} />
            <p>No tasks yet. Add one above!</p>
          </div>
        ) : (
          <>
            {activeTodos.map(todo => (
              <div key={todo.id} className={`todo-item ${todo.fromGoogle ? 'from-google' : ''}`}>
                <button
                  className="checkbox"
                  onClick={() => toggleTodo(todo)}
                >
                  <Square size={20} />
                </button>
                
                {editingId === todo.id ? (
                  <>
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="edit-input"
                      autoFocus
                    />
                    <button
                      className="save-edit-btn"
                      onClick={() => saveEdit(todo)}
                    >
                      <Save size={18} />
                    </button>
                    <button
                      className="cancel-edit-btn"
                      onClick={cancelEdit}
                    >
                      <X size={18} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="todo-text">
                      {todo.text}
                      {todo.fromGoogle && <span className="google-badge">Google</span>}
                    </span>
                    <button
                      className="edit-btn"
                      onClick={() => startEdit(todo)}
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      className="delete-btn"
                      onClick={() => deleteTodo(todo)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </>
                )}
              </div>
            ))}

            {completedTodos.length > 0 && (
              <>
                <div className="completed-divider">
                  Completed ({completedTodos.length})
                </div>
                {completedTodos.map(todo => (
                  <div key={todo.id} className={`todo-item completed ${todo.fromGoogle ? 'from-google' : ''}`}>
                    <button
                      className="checkbox"
                      onClick={() => toggleTodo(todo)}
                    >
                      <CheckSquare size={20} />
                    </button>
                    <span className="todo-text">
                      {todo.text}
                      {todo.fromGoogle && <span className="google-badge">Google</span>}
                    </span>
                    <button
                      className="delete-btn"
                      onClick={() => deleteTodo(todo)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TodoList;
