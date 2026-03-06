import React, { useState, useEffect } from 'react';
import { CheckSquare, Square, Plus, Trash2 } from 'lucide-react';
import './TodoList.css';

const TodoList = () => {
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState('');

  useEffect(() => {
    // Load todos from localStorage
    const savedTodos = localStorage.getItem('todos');
    if (savedTodos) {
      setTodos(JSON.parse(savedTodos));
    }
  }, []);

  useEffect(() => {
    // Save todos to localStorage whenever they change
    localStorage.setItem('todos', JSON.stringify(todos));
  }, [todos]);

  const addTodo = (e) => {
    e.preventDefault();
    if (newTodo.trim()) {
      setTodos([
        ...todos,
        {
          id: Date.now(),
          text: newTodo,
          completed: false,
          createdAt: new Date().toISOString()
        }
      ]);
      setNewTodo('');
    }
  };

  const toggleTodo = (id) => {
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };

  const deleteTodo = (id) => {
    setTodos(todos.filter(todo => todo.id !== id));
  };

  const activeTodos = todos.filter(t => !t.completed);
  const completedTodos = todos.filter(t => t.completed);

  return (
    <div className="todo-component">
      <div className="component-header">
        <CheckSquare size={24} />
        <h2>To-Do List</h2>
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
              <div key={todo.id} className="todo-item">
                <button
                  className="checkbox"
                  onClick={() => toggleTodo(todo.id)}
                >
                  <Square size={20} />
                </button>
                <span className="todo-text">{todo.text}</span>
                <button
                  className="delete-btn"
                  onClick={() => deleteTodo(todo.id)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}

            {completedTodos.length > 0 && (
              <>
                <div className="completed-divider">
                  Completed ({completedTodos.length})
                </div>
                {completedTodos.map(todo => (
                  <div key={todo.id} className="todo-item completed">
                    <button
                      className="checkbox"
                      onClick={() => toggleTodo(todo.id)}
                    >
                      <CheckSquare size={20} />
                    </button>
                    <span className="todo-text">{todo.text}</span>
                    <button
                      className="delete-btn"
                      onClick={() => deleteTodo(todo.id)}
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
