import { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  Settings, 
  Copy, 
  Volume2, 
  Languages as LangIcon,
  RefreshCw
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

export const App = () => {
  // Application State
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
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

  // Load configuration from local storage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('wispr_settings');
    const savedLanguage = localStorage.getItem('wispr_lang');
    const savedDocuments = localStorage.getItem('wispr_history');

    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (e) {
        console.error(e);
      }
    }
    if (savedLanguage) setLanguage(savedLanguage);
    
    let loadedDocs: DocumentItem[] = [];
    if (savedDocuments) {
      try {
        loadedDocs = JSON.parse(savedDocuments);
        setDocuments(loadedDocs);
      } catch (e) {
        console.error(e);
      }
    }

    // Initialize with a default document if empty
    if (loadedDocs.length === 0) {
      const defaultDoc: DocumentItem = {
        id: Date.now().toString(),
        title: 'Untitled Document',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }),
        rawText: '',
        formattedText: ''
      };
      setDocuments([defaultDoc]);
      setActiveDocId(defaultDoc.id);
      localStorage.setItem('wispr_history', JSON.stringify([defaultDoc]));
    } else {
      setActiveDocId(loadedDocs[0].id);
    }
  }, []);

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
            return {
              ...doc,
              formattedText: html,
              rawText: markdown
            };
          }
          return doc;
        });
        localStorage.setItem('wispr_history', JSON.stringify(updated));
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
    }
  };

  // Create new document action
  const handleCreateDocument = () => {
    const newDoc: DocumentItem = {
      id: Date.now().toString(),
      title: `Document ${documents.length + 1}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }),
      rawText: '',
      formattedText: ''
    };
    const updated = [newDoc, ...documents];
    setDocuments(updated);
    localStorage.setItem('wispr_history', JSON.stringify(updated));
    setActiveDocId(newDoc.id);
    showToast('New document created!');
  };

  // Update document title
  const handleUpdateTitle = (id: string, newTitle: string) => {
    const updated = documents.map(doc => {
      if (doc.id === id) {
        return { ...doc, title: newTitle };
      }
      return doc;
    });
    setDocuments(updated);
    localStorage.setItem('wispr_history', JSON.stringify(updated));
    showToast('Document renamed.');
  };

  // Delete document action
  const handleDeleteDocument = (id: string) => {
    const updated = documents.filter(doc => doc.id !== id);
    setDocuments(updated);
    localStorage.setItem('wispr_history', JSON.stringify(updated));
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
        setDocuments([fallback]);
        setActiveDocId(fallback.id);
        localStorage.setItem('wispr_history', JSON.stringify([fallback]));
      }
    }
  };

  // Save settings helpers
  const saveSettings = (newSettings: AISettings) => {
    setSettings(newSettings);
    localStorage.setItem('wispr_settings', JSON.stringify(newSettings));
    showToast('Settings saved successfully!');
  };

  const saveLanguage = (lang: string) => {
    setLanguage(lang);
    localStorage.setItem('wispr_lang', lang);
  };

  const clearHistory = () => {
    const emptyDocs = [{
      id: Date.now().toString(),
      title: 'Untitled Document',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }),
      rawText: '',
      formattedText: ''
    }];
    setDocuments(emptyDocs);
    setActiveDocId(emptyDocs[0].id);
    localStorage.setItem('wispr_history', JSON.stringify(emptyDocs));
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
    showToast('AI is refining your speech...');

    try {
      const result = await formatTranscript(textToProcess, selectedTemplate, settings);
      
      if (editor) {
        const blocks = editor.tryParseHTMLToBlocks(result);
        const lastBlock = editor.document[editor.document.length - 1];
        if (lastBlock) {
          editor.insertBlocks(blocks, lastBlock, "after");
        } else {
          editor.replaceBlocks(editor.document, blocks);
        }
      }
      showToast('Speech refined and added!');
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

  return (
    <div className="app-container">
      {/* Mesh Background */}
      <div className="bg-mesh"></div>

      {/* Sidebar - Log history */}
      <div className="sidebar-wrapper">
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
          <div className="app-brand">
            <div className="brand-glow">
              <Mic size={18} color="white" />
            </div>
            <h1>Wispr Flow</h1>
          </div>

          <div className="nav-actions">
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
          </div>
        </header>

        {/* Core content */}
        <main className="workspace-content document-view">
          {/* Active document title and copy button */}
          <div className="document-header">
            <h2 className="document-title">{activeDoc?.title || 'Untitled Document'}</h2>
            <button 
              className="btn-secondary btn-sm"
              onClick={copyToClipboard}
              title="Copy as Markdown"
            >
              <Copy size={13} style={{ marginRight: '4px' }} />
              Copy MD
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
          <div className="template-selector-container">
            <span className="template-selector-label">Refinement Preset</span>
            <div className="template-selector">
              {FORMATTING_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  className={`template-btn ${selectedTemplate === t.id ? 'active' : ''}`}
                  onClick={() => handleTemplateChange(t.id)}
                >
                  {t.name}
                </button>
              ))}
              <button
                className={`template-btn ${selectedTemplate === 'custom' ? 'active' : ''}`}
                onClick={() => handleTemplateChange('custom')}
              >
                Custom System Prompt
              </button>
            </div>
          </div>

          {/* BlockNote Rich Editor View */}
          <div className="notion-editor-card glass-panel">
            <BlockNoteView 
              editor={editor} 
              theme="dark" 
              onChange={handleEditorChange}
            />
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

      {/* Toast Alert */}
      <div className={`toast ${toastShow ? 'show' : ''}`}>
        <Volume2 size={16} className="text-primary" />
        <span>{toastMessage}</span>
      </div>
    </div>
  );
};
