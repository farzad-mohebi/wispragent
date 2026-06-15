import { useState, useEffect } from 'react';
import { Shield, Search, Trash2, ArrowLeft, RefreshCw, UserCheck } from 'lucide-react';

interface UserItem {
  id: number;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

interface AdminDashboardProps {
  token: string;
  onClose: () => void;
}

export const AdminDashboard = ({ token, onClose }: AdminDashboardProps) => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch users');
      }
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Error loading users');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const handleToggleRole = async (userId: number, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update user role');
      }
      
      // Update locally
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err: any) {
      alert(err.message || 'Error updating role');
    }
  };

  const handleDeleteUser = async (userId: number, userName: string) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete user ${userName}? This will remove all their documents permanently.`);
    if (!confirmDelete) return;

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }
      
      // Update locally
      setUsers(users.filter(u => u.id !== userId));
    } catch (err: any) {
      alert(err.message || 'Error deleting user');
    }
  };

  const filteredUsers = users.filter(user => {
    const term = searchTerm.toLowerCase();
    return (
      (user.name || '').toLowerCase().includes(term) ||
      (user.email || '').toLowerCase().includes(term) ||
      (user.role || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="admin-dashboard-overlay">
      <div className="admin-dashboard-container glass-panel">
        <header className="admin-header">
          <div className="admin-title-area">
            <button className="btn-icon" onClick={onClose} title="Back to workspace">
              <ArrowLeft size={16} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={20} className="text-primary" />
              <h3>Admin User Management</h3>
            </div>
          </div>
          <button className="btn-secondary btn-sm" onClick={fetchUsers} title="Refresh User Directory">
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </header>

        <div className="admin-toolbar">
          <div className="search-bar" style={{ margin: 0, flex: 1 }}>
            <Search size={16} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search by name, email, or role..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="admin-body">
          {error && <div className="auth-error-alert">{error}</div>}

          {isLoading ? (
            <div className="admin-loading">
              <RefreshCw size={24} className="animate-spin" />
              <p>Loading users...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="admin-empty">
              <p>No users found matching "{searchTerm}"</p>
            </div>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Name</th>
                    <th>Email Address</th>
                    <th>Registration Date</th>
                    <th>Role</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td>#{user.id}</td>
                      <td style={{ fontWeight: 600 }}>{user.name}</td>
                      <td>{user.email}</td>
                      <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                      <td>
                        <span className={`role-badge ${user.role}`}>
                          {user.role}
                        </span>
                      </td>
                      <td>
                        <div className="admin-table-actions">
                          <button
                            className="action-btn"
                            onClick={() => handleToggleRole(user.id, user.role)}
                            title={user.role === 'admin' ? "Demote to standard user" : "Promote to admin"}
                          >
                            <UserCheck size={14} className={user.role === 'admin' ? 'text-primary' : ''} />
                          </button>
                          <button
                            className="action-btn delete-btn"
                            onClick={() => handleDeleteUser(user.id, user.name)}
                            title="Delete User Account"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
