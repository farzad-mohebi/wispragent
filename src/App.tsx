import { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  Settings, 
  Copy, 
  Volume2, 
  Languages as LangIcon,
  RefreshCw,
  Menu,
  X,
  Share,
  LogOut,
  Shield
} from 'lucide-react';
import { Waveform } from './components/Waveform';
import { HistoryList } from './components/HistoryList';
import type { DocumentItem } from './components/HistoryList';
import { SettingsModal, LANGUAGES } from './components/SettingsModal';
import { 
  formatTranscript, 
  FORMATTING_TEMPLATES
} from './utils/ai';
import type { 
  AISettings, 
  TemplateId 
} from './utils/ai';
import { getVaultHandle, verifyPermission } from './utils/obsidian';
import { AuthScreen } from './components/AuthScreen';
import { AdminDashboard } from './components/AdminDashboard';

// BlockNote Imports
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";

import './App.css';

// Declare SpeechRecognition for TS compiler
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

interface UserState {
  id: number;
  email: string;
  name: string;
  role: string;
}

export const App = () => {
  // Application State
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('grammar');
  const [language, setLanguage] = useState('en-US');
  const [settings, setSettings] = useState<AISettings>({
    provider: 'none',
    apiKey: '',
    customPrompt: '',
  });
  
  // Document Log State (previously history)
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastShow, setToastShow] = useState(false);

  // Audio stream reference for visualization
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  
  // Refs
  const recognitionRef = useRef<any>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const isUpdatingRef = useRef(false);

  // BlockNote Editor Instance
  const editor = useCreateBlockNote();

  // Authentication State
  const [token, setToken] = useState<string | null>(localStorage.getItem('wispr_token'));
  const [user, setUser] = useState<UserState | null>(() => {
    const u = localStorage.getItem('wispr_user');
    try {
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  });
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [appMode, setAppMode] = useState<'transcribe' | 'explain'>('transcribe');

  const fetchDocuments = async (authToken: string) => {
    try {
      const response = await fetch('/api/documents', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
        if (data.length > 0) {
          setActiveDocId(data[0].id);
        } else {
          // Create a default first document
          const newDoc: DocumentItem = {
            id: Date.now().toString(),
            title: 'Untitled Document',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }),
            rawText: '',
            formattedText: ''
          };
          await fetch('/api/documents', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(newDoc)
          });
          setDocuments([newDoc]);
          setActiveDocId(newDoc.id);
        }
      }
    } catch (e) {
      console.error("Failed to fetch documents", e);
    }
  };

  const fetchCredentials = async (authToken: string) => {
    try {
      const response = await fetch('/api/credentials', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (e) {
      console.error("Failed to fetch credentials", e);
    }
  };

  const handleSignOut = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('wispr_token');
    localStorage.removeItem('wispr_user');
    setDocuments([]);
    setActiveDocId(null);
    setIsAdminOpen(false);
  };

  const handleAuthSuccess = (newToken: string, newUser: UserState) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('wispr_token', newToken);
    localStorage.setItem('wispr_user', JSON.stringify(newUser));
    showToast(`Logged in as ${newUser.name}`);
  };

  // Load configuration from database or local storage on mount
  useEffect(() => {
    const savedLanguage = localStorage.getItem('wispr_lang');
    if (savedLanguage) setLanguage(savedLanguage);

    if (token) {
      fetchDocuments(token);
      fetchCredentials(token);
      
      fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }).then(res => {
        if (!res.ok) {
          handleSignOut();
        }
      }).catch(err => console.error("Me check failed", err));
    }
  }, [token]);

  // Sync editor fields when active document changes
  useEffect(() => {
    if (!editor || !activeDocId) return;
    const doc = documents.find(d => d.id === activeDocId);
    if (doc) {
      isUpdatingRef.current = true;
      try {
        const blocks = editor.tryParseHTMLToBlocks(doc.formattedText || doc.rawText || "<p></p>");
        editor.replaceBlocks(editor.document, blocks);
      } catch (e) {
        console.error("Failed to load blocks", e);
      }
      isUpdatingRef.current = false;
    }
  }, [activeDocId, editor]);

  // Handle editor edits
  const handleEditorChange = async () => {
    if (isUpdatingRef.current || !activeDocId || !editor) return;
    
    try {
      const html = await editor.blocksToHTMLLossy(editor.document);
      const markdown = await editor.blocksToMarkdownLossy(editor.document);
      
      setDocuments(prevDocs => {
        const docExists = prevDocs.some(d => d.id === activeDocId);
        if (!docExists) return prevDocs;
        
        const updated = prevDocs.map(doc => {
          if (doc.id === activeDocId) {
            if (doc.formattedText === html) return doc;

            if (token) {
              fetch(`/api/documents/${activeDocId}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                  title: doc.title,
                  rawText: markdown,
                  formattedText: html,
                  timestamp: doc.timestamp
                })
              }).catch(console.error);
            }

            return {
              ...doc,
              formattedText: html,
              rawText: markdown
            };
          }
          return doc;
        });
        return updated;
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectDocument = (id: string) => {
    const doc = documents.find(d => d.id === id);
    if (doc) {
      setActiveDocId(id);
      showToast(`Switched to: ${doc.title}`);
      setIsSidebarOpen(false);
    }
  };

  // Create new document action
  const handleCreateDocument = async () => {
    const newDoc: DocumentItem = {
      id: Date.now().toString(),
      title: `Document ${documents.length + 1}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }),
      rawText: '',
      formattedText: ''
    };

    if (token) {
      try {
        await fetch('/api/documents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(newDoc)
        });
      } catch (e) {
        console.error(e);
      }
    }

    const updated = [newDoc, ...documents];
    setDocuments(updated);
    setActiveDocId(newDoc.id);
    showToast('New document created!');
    setIsSidebarOpen(false);
  };

  // Update document title
  const handleUpdateTitle = async (id: string, newTitle: string) => {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;

    if (token) {
      try {
        await fetch(`/api/documents/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            title: newTitle,
            rawText: doc.rawText,
            formattedText: doc.formattedText,
            timestamp: doc.timestamp
          })
        });
      } catch (e) {
        console.error(e);
      }
    }

    const updated = documents.map(d => {
      if (d.id === id) {
        return { ...d, title: newTitle };
      }
      return d;
    });
    setDocuments(updated);
    showToast('Document renamed.');
  };

  // Delete document action
  const handleDeleteDocument = async (id: string) => {
    if (token) {
      try {
        await fetch(`/api/documents/${id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      } catch (e) {
        console.error(e);
      }
    }

    const updated = documents.filter(doc => doc.id !== id);
    setDocuments(updated);
    showToast('Document deleted.');

    if (activeDocId === id) {
      if (updated.length > 0) {
        handleSelectDocument(updated[0].id);
      } else {
        const fallback: DocumentItem = {
          id: Date.now().toString(),
          title: 'Untitled Document',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }),
          rawText: '',
          formattedText: ''
        };
        if (token) {
          try {
            await fetch('/api/documents', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify(fallback)
            });
          } catch (e) {
            console.error(e);
          }
        }
        setDocuments([fallback]);
        setActiveDocId(fallback.id);
      }
    }
  };

  // Save settings helpers
  const saveSettings = async (newSettings: AISettings) => {
    setSettings(newSettings);
    if (token) {
      try {
        await fetch('/api/credentials', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(newSettings)
        });
      } catch (e) {
        console.error(e);
      }
    }
    showToast('Settings saved successfully!');
  };

  const saveLanguage = (lang: string) => {
    setLanguage(lang);
    localStorage.setItem('wispr_lang', lang);
  };

  const clearHistory = async () => {
    if (token) {
      try {
        for (const doc of documents) {
          await fetch(`/api/documents/${doc.id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
        }
      } catch (e) {
        console.error(e);
      }
    }

    const emptyDocs = [{
      id: Date.now().toString(),
      title: 'Untitled Document',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }),
      rawText: '',
      formattedText: ''
    }];

    if (token) {
      try {
        await fetch('/api/documents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(emptyDocs[0])
        });
      } catch (e) {
        console.error(e);
      }
    }

    setDocuments(emptyDocs);
    setActiveDocId(emptyDocs[0].id);
    showToast('Dictation log cleared.');
    showToast('Dictation log cleared.');
  };

  // Toast Helper
  const showToast = (message: string) => {
    setToastMessage(message);
    setToastShow(true);
    setTimeout(() => {
      setToastShow(false);
    }, 2500);
  };

  // Copy to clipboard helper
  const copyToClipboard = async () => {
    if (!editor) return;
    try {
      const markdown = await editor.blocksToMarkdownLossy(editor.document);
      if (!markdown) return;
      navigator.clipboard.writeText(markdown);
      showToast('Copied document markdown to clipboard!');
    } catch (e) {
      console.error(e);
    }
  };

  // Upload/Sync active document to Obsidian vault
  const handleUploadToObsidian = async () => {
    if (!editor || !activeDoc) return;
    try {
      const markdown = await editor.blocksToMarkdownLossy(editor.document);
      if (!markdown) {
        showToast('Document is empty.');
        return;
      }

      // 1. Try local filesystem sync first
      const dirHandle = await getVaultHandle();
      if (dirHandle) {
        const hasPermission = await verifyPermission(dirHandle, true);
        if (hasPermission) {
          const safeTitle = (activeDoc.title || 'Untitled note')
            .replace(/[\\/:*?"<>|]/g, '_')
            .trim();
          
          const fileHandle = await dirHandle.getFileHandle(`${safeTitle}.md`, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(markdown);
          await writable.close();
          showToast(`Saved to Obsidian: ${safeTitle}.md!`);
          return;
        }
      }

      // 2. Fallback to Obsidian URI
      const vaultName = localStorage.getItem('obsidian_vault_name') || '';
      if (vaultName.trim()) {
        const safeTitle = encodeURIComponent(activeDoc.title || 'Untitled note');
        const encodedContent = encodeURIComponent(markdown);
        const obsidianUri = `obsidian://new?vault=${encodeURIComponent(vaultName.trim())}&name=${safeTitle}&content=${encodedContent}`;
        window.open(obsidianUri, '_blank');
        showToast('Opened note in Obsidian.');
      } else {
        // 3. Fallback: Prompt user to set up Vault name or directory
        const wantSetup = window.confirm("Obsidian Vault not connected. Would you like to open Settings to connect your vault?");
        if (wantSetup) {
          setIsSettingsOpen(true);
        } else {
          // Just download it
          const element = document.createElement("a");
          const file = new Blob([markdown], { type: 'text/plain' });
          element.href = URL.createObjectURL(file);
          element.download = `${activeDoc.title || 'note'}.md`;
          document.body.appendChild(element);
          element.click();
          document.body.removeChild(element);
          showToast('Downloaded markdown file.');
        }
      }
    } catch (e: any) {
      console.error(e);
      showToast(`Obsidian upload failed: ${e.message || e}`);
    }
  };

  // Setup Hotkey: Option + D (Mac) or Alt + D (Windows) to toggle recording
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.getAttribute('contenteditable') === 'true') {
        return;
      }

      if (e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        toggleRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording, language]);

  // Audio Recording & Speech Recognition Logic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setAudioStream(stream);
      activeStreamRef.current = stream;

      const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionClass) {
        showToast('Speech recognition not supported in this browser. Please use Chrome or Safari.');
        return;
      }

      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      
      if (language !== 'auto') {
        recognition.lang = language;
      }

      let finalTranscript = '';

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        const combined = (finalTranscript + interimTranscript).trim().replace(/\s+/g, ' ');
        setLiveTranscript(combined);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          showToast('Microphone access denied.');
        } else {
          showToast(`Speech recognition error: ${event.error}`);
        }
        stopMicrophone();
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
      showToast(`Recording in ${getLanguageName(language)}... Alt+D to stop.`);
    } catch (err: any) {
      console.error('Could not start recording:', err);
      showToast('Microphone access is required.');
      stopMicrophone();
    }
  };

  const stopMicrophone = () => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(track => track.stop());
      activeStreamRef.current = null;
    }
    setAudioStream(null);
    setIsRecording(false);
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    stopMicrophone();
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Run AI processing once raw transcript is stable/recording stops
  useEffect(() => {
    if (!isRecording && liveTranscript.trim() && !isProcessing) {
      processTranscription(liveTranscript);
      setLiveTranscript('');
    }
  }, [isRecording]);

  const processTranscription = async (textToProcess: string) => {
    if (!textToProcess.trim()) return;
    setIsProcessing(true);
    showToast(appMode === 'explain' ? 'AI is executing commands...' : 'AI is refining your speech...');

    try {
      const result = await formatTranscript(textToProcess, selectedTemplate, settings, appMode);
      
      if (editor) {
        const blocks = editor.tryParseHTMLToBlocks(result);
        const lastBlock = editor.document[editor.document.length - 1];
        if (lastBlock) {
          editor.insertBlocks(blocks, lastBlock, "after");
        } else {
          editor.replaceBlocks(editor.document, blocks);
        }
      }
      showToast(appMode === 'explain' ? 'Formatting applied!' : 'Speech refined and added!');
    } catch (error: any) {
      console.error(error);
      showToast('AI formatting failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTemplateChange = (templateId: TemplateId) => {
    setSelectedTemplate(templateId);
  };

  const getLanguageName = (code: string) => {
    return LANGUAGES.find(l => l.code === code)?.name.split(' ')[0] || 'English';
  };

  const activeDoc = documents.find(d => d.id === activeDocId);

  if (!token) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="app-container">
      {/* Mesh Background */}
      <div className="bg-mesh"></div>

      {/* Sidebar Backdrop Overlay on Mobile */}
      {isSidebarOpen && (
        <div 
          className="sidebar-backdrop" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Log history */}
      <div className={`sidebar-wrapper ${isSidebarOpen ? 'open' : ''}`}>
        <HistoryList 
          items={documents}
          activeId={activeDocId}
          onSelectDocument={handleSelectDocument}
          onCreateDocument={handleCreateDocument}
          onDeleteDocument={handleDeleteDocument}
          onUpdateTitle={handleUpdateTitle}
        />
      </div>

      {/* Main workspace */}
      <div className="main-workspace">
        {/* Navigation Bar */}
        <header className="top-nav">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              className="btn-icon mobile-menu-toggle" 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title="Toggle Menu"
            >
              {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="app-brand">
              <div className="brand-glow">
                <Mic size={18} color="white" />
              </div>
              <h1>Wisper Agent</h1>
            </div>
          </div>

          <div className="nav-actions">
            {user?.role === 'admin' && (
              <button 
                className="btn-icon text-primary" 
                onClick={() => setIsAdminOpen(true)}
                title="Admin Dashboard"
              >
                <Shield size={18} />
              </button>
            )}
            <span className="template-tag" style={{ background: 'rgba(255,255,255,0.03)', color: 'hsl(var(--text-muted))', border: '1px solid rgba(255,255,255,0.06)' }}>
              <LangIcon size={12} style={{ marginRight: '4px' }} />
              {getLanguageName(language)}
            </span>
            <button 
              className="btn-icon" 
              onClick={() => setIsSettingsOpen(true)}
              title="Settings"
            >
              <Settings size={18} />
            </button>
            <button 
              className="btn-icon text-error" 
              onClick={handleSignOut}
              title="Sign Out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Core content */}
        <main className="workspace-content document-view">
          {/* Top Sticky/Static Section */}
          <div className="workspace-header-section">
            {/* Mode Toggle Bar */}
            <div className="mode-toggle-container">
              <button 
                className={`mode-btn ${appMode === 'transcribe' ? 'active' : ''}`}
                onClick={() => setAppMode('transcribe')}
              >
                Transcribe Mode
              </button>
              <button 
                className={`mode-btn ${appMode === 'explain' ? 'active' : ''}`}
                onClick={() => setAppMode('explain')}
              >
                Explain Mode
              </button>
            </div>

            {/* Recording & Dictation Station */}
            <div className="dictate-center">
              <div className="mic-container">
                {isRecording && (
                  <>
                    <div className="ripple-effect"></div>
                    <div className="ripple-effect"></div>
                    <div className="ripple-effect"></div>
                  </>
                )}
                <button 
                  className={`mic-btn ${isRecording ? 'recording' : ''} ${isProcessing ? 'processing' : ''}`}
                  onClick={toggleRecording}
                  disabled={isProcessing}
                  title="Toggle Recording (Alt+D)"
                >
                  {isProcessing ? (
                    <RefreshCw size={36} className="animate-spin" style={{ animation: 'spin 2s linear infinite' }} />
                  ) : (
                    <Mic size={36} />
                  )}
                </button>
              </div>

              <div className="recording-status">
                {isRecording ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <p className="text-error" style={{ display: 'flex', alignItems: 'center', margin: 0 }}>
                      Listening
                      <span className="pulse-dots">
                        <span></span><span></span><span></span>
                      </span>
                    </p>
                    {liveTranscript && (
                      <div className="live-transcript-bubble">
                        "{liveTranscript}"
                      </div>
                    )}
                  </div>
                ) : isProcessing ? (
                  <p className="text-primary" style={{ display: 'flex', alignItems: 'center' }}>
                    Refining speech
                    <span className="pulse-dots">
                      <span></span><span></span><span></span>
                    </span>
                  </p>
                ) : (
                  <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.85rem' }}>
                    Click mic or press <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>Alt + D</kbd> to record
                  </p>
                )}
              </div>

              {/* Waveform component */}
              <Waveform isRecording={isRecording} stream={audioStream} />
            </div>

            {/* Smart Preset Formatting Bar */}
            <div className={`template-selector-container ${appMode === 'explain' ? 'disabled' : ''}`}>
              <span className="template-selector-label">Refinement Preset</span>
              <div className="template-selector">
                {FORMATTING_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    className={`template-btn ${selectedTemplate === t.id ? 'active' : ''}`}
                    onClick={() => appMode !== 'explain' && handleTemplateChange(t.id)}
                    disabled={appMode === 'explain'}
                  >
                    {t.name}
                  </button>
                ))}
                <button
                  className={`template-btn ${selectedTemplate === 'custom' ? 'active' : ''}`}
                  onClick={() => appMode !== 'explain' && handleTemplateChange('custom')}
                  disabled={appMode === 'explain'}
                >
                  Custom System Prompt
                </button>
              </div>
            </div>

            {/* Active document title and copy button - placed under recording section */}
            <div className="document-header">
              <h2 className="document-title">{activeDoc?.title || 'Untitled Document'}</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="btn-secondary btn-sm"
                  onClick={copyToClipboard}
                  title="Copy as Markdown"
                >
                  <Copy size={13} style={{ marginRight: '4px' }} />
                  Copy MD
                </button>
                <button 
                  className="btn-primary btn-sm"
                  onClick={handleUploadToObsidian}
                  title="Upload to Obsidian Vault"
                >
                  <Share size={13} style={{ marginRight: '4px' }} />
                  Obsidian Sync
                </button>
              </div>
            </div>
          </div>

          {/* Scrollable Editor Area */}
          <div className="editor-scroll-boundary">
            <div className="notion-editor-card glass-panel">
              <BlockNoteView 
                editor={editor} 
                theme="dark" 
                onChange={handleEditorChange}
              />
            </div>
          </div>
        </main>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          language={language}
          onSaveSettings={saveSettings}
          onSaveLanguage={saveLanguage}
          onClose={() => setIsSettingsOpen(false)}
          onClearHistory={clearHistory}
        />
      )}

      {/* Admin Dashboard */}
      {isAdminOpen && token && (
        <AdminDashboard
          token={token}
          onClose={() => setIsAdminOpen(false)}
        />
      )}

      {/* Toast Alert */}
      <div className={`toast ${toastShow ? 'show' : ''}`}>
        <Volume2 size={16} className="text-primary" />
        <span>{toastMessage}</span>
      </div>
    </div>
  );
};
