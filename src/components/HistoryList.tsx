import { useState } from 'react';
import { 
  FileText, 
  Trash2, 
  Search, 
  Plus,
  Edit2,
  Check
} from 'lucide-react';

export interface DocumentItem {
  id: string;
  title: string;
  timestamp: string;
  rawText: string;
  formattedText: string;
}

interface DocumentListProps {
  items: DocumentItem[];
  activeId: string | null;
  onSelectDocument: (id: string) => void;
  onCreateDocument: () => void;
  onDeleteDocument: (id: string) => void;
  onUpdateTitle: (id: string, newTitle: string) => void;
}

export const HistoryList = ({ 
  items, 
  activeId,
  onSelectDocument, 
  onCreateDocument,
  onDeleteDocument, 
  onUpdateTitle
}: DocumentListProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const startEditing = (e: React.MouseEvent, doc: DocumentItem) => {
    e.stopPropagation();
    setEditingId(doc.id);
    setEditTitle(doc.title);
  };

  const saveTitle = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (editTitle.trim()) {
      onUpdateTitle(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const filteredItems = items.filter(item => {
    const titleMatch = (item.title || '').toLowerCase().includes(searchTerm.toLowerCase());
    const rawMatch = (item.rawText || '').toLowerCase().includes(searchTerm.toLowerCase());
    const formattedMatch = (item.formattedText || '').toLowerCase().includes(searchTerm.toLowerCase());
    return titleMatch || rawMatch || formattedMatch;
  });

  return (
    <div className="history-sidebar">
      <div className="history-header" style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FileText size={18} />
          <h2>My Documents</h2>
        </div>
        <button 
          onClick={onCreateDocument}
          className="btn-icon"
          title="New Document"
          style={{ width: '32px', height: '32px', borderRadius: '8px' }}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="search-bar">
        <Search size={16} className="search-icon" />
        <input 
          type="text" 
          placeholder="Search documents..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="history-items">
        {filteredItems.length === 0 ? (
          <div className="empty-history">
            <FileText size={32} style={{ opacity: 0.4 }} />
            <p>{searchTerm ? 'No matches found.' : 'No documents yet. Create one to begin!'}</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isActive = item.id === activeId;
            const isEditing = item.id === editingId;
            return (
              <div 
                key={item.id} 
                className={`history-card ${isActive ? 'expanded' : ''}`}
                style={{ 
                  borderColor: isActive ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255, 255, 255, 0.04)',
                  background: isActive ? 'rgba(168, 85, 247, 0.06)' : 'rgba(255, 255, 255, 0.02)'
                }}
                onClick={() => onSelectDocument(item.id)}
              >
                <div className="history-card-header">
                  <div className="history-card-meta" style={{ flex: 1, marginRight: '8px' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '4px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="text" 
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveTitle(e as any, item.id);
                          }}
                          style={{
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(168, 85, 247, 0.5)',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '0.85rem',
                            padding: '2px 6px',
                            width: '100%',
                            outline: 'none'
                          }}
                          autoFocus
                        />
                        <button 
                          onClick={(e) => saveTitle(e, item.id)}
                          className="action-btn"
                          style={{ background: 'rgba(168, 85, 247, 0.2)' }}
                        >
                          <Check size={12} className="text-success" />
                        </button>
                      </div>
                    ) : (
                      <span className="timestamp" style={{ fontWeight: 600, fontSize: '0.9rem', color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--text-primary))' }}>
                        {item.title}
                      </span>
                    )}
                    <span className="timestamp" style={{ fontSize: '0.72rem', marginTop: '2px' }}>{item.timestamp}</span>
                  </div>
                  
                  {!isEditing && (
                    <div className="history-card-actions">
                      <button 
                        onClick={(e) => startEditing(e, item)}
                        title="Rename Document"
                        className="action-btn"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteDocument(item.id);
                        }}
                        title="Delete Document"
                        className="action-btn delete-btn"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="history-card-preview" style={{ marginTop: '6px', fontSize: '0.8rem' }}>
                  {item.formattedText || item.rawText || 'Empty document...'}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
