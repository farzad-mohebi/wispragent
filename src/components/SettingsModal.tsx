import { useState, useEffect } from 'react';
import { X, Key, Globe, Sparkles, AlertCircle, Info, Folder } from 'lucide-react';
import type { AISettings } from '../utils/ai';
import { getVaultHandle, saveVaultHandle } from '../utils/obsidian';

interface SettingsModalProps {
  settings: AISettings;
  language: string;
  onSaveSettings: (settings: AISettings) => void;
  onSaveLanguage: (lang: string) => void;
  onClose: () => void;
  onClearHistory: () => void;
}

export const LANGUAGES = [
  { code: 'en-US', name: 'English (United States)' },
  { code: 'fa-IR', name: 'Persian (Iran)' },
  { code: 'en-GB', name: 'English (United Kingdom)' },
  { code: 'es-ES', name: 'Spanish (Spain)' },
  { code: 'fr-FR', name: 'French (France)' },
  { code: 'de-DE', name: 'German (Germany)' },
  { code: 'it-IT', name: 'Italian (Italy)' },
  { code: 'ja-JP', name: 'Japanese (Japan)' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'ru-RU', name: 'Russian (Russia)' },
  { code: 'ko-KR', name: 'Korean (South Korea)' },
];

export const SettingsModal = ({
  settings,
  language,
  onSaveSettings,
  onSaveLanguage,
  onClose,
  onClearHistory,
}: SettingsModalProps) => {
  const [provider, setProvider] = useState<AISettings['provider']>(settings.provider);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [customPrompt, setCustomPrompt] = useState(settings.customPrompt);
  const [openRouterModel, setOpenRouterModel] = useState(settings.openRouterModel || 'google/gemini-2.5-flash');
  const [lang, setLang] = useState(language);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Obsidian States
  const [obsidianVaultName, setObsidianVaultName] = useState('');
  const [hasVaultFolder, setHasVaultFolder] = useState(false);
  const [folderName, setFolderName] = useState('');

  useEffect(() => {
    const savedVault = localStorage.getItem('obsidian_vault_name') || '';
    setObsidianVaultName(savedVault);

    const checkVaultFolder = async () => {
      const handle = await getVaultHandle();
      if (handle) {
        setHasVaultFolder(true);
        setFolderName(handle.name);
      }
    };
    checkVaultFolder();
  }, []);

  const handleSelectFolder = async () => {
    try {
      if (typeof (window as any).showDirectoryPicker !== 'function') {
        alert("Local file system sync is not supported in this browser. Please use Chrome, Edge, or Opera.");
        return;
      }
      const handle = await (window as any).showDirectoryPicker({
        mode: 'readwrite'
      });
      await saveVaultHandle(handle);
      setHasVaultFolder(true);
      setFolderName(handle.name);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = () => {
    onSaveSettings({
      provider,
      apiKey,
      customPrompt,
      openRouterModel,
    });
    onSaveLanguage(lang);
    localStorage.setItem('obsidian_vault_name', obsidianVaultName);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="title-group">
            <span className="icon-glow">
              <Sparkles size={20} className="text-primary" />
            </span>
            <h3>Application Settings</h3>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Section: Language */}
          <div className="setting-section">
            <label className="section-label">
              <Globe size={16} />
              <span>Dictation Language</span>
            </label>
            <div className="select-container">
              <select value={lang} onChange={(e) => setLang(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="helper-text">
              Select the language you will speak. The browser recognition model works best when this matches your input language.
            </p>
          </div>

          {/* Section: AI Provider & Keys */}
          <div className="setting-section">
            <label className="section-label">
              <Key size={16} />
              <span>Smart Formatting AI Engine</span>
            </label>
            
            <div className="provider-grid">
              <button
                type="button"
                className={`provider-card ${provider === 'none' ? 'active' : ''}`}
                onClick={() => setProvider('none')}
              >
                <span>Offline / Basic</span>
                <span className="badge">No key needed</span>
              </button>
              <button
                type="button"
                className={`provider-card ${provider === 'gemini' ? 'active' : ''}`}
                onClick={() => setProvider('gemini')}
              >
                <span>Gemini Flash</span>
                <span className="badge recommend">Recommended</span>
              </button>
              <button
                type="button"
                className={`provider-card ${provider === 'openai' ? 'active' : ''}`}
                onClick={() => setProvider('openai')}
              >
                <span>GPT-4o Mini</span>
                <span className="badge">OpenAI</span>
              </button>
              <button
                type="button"
                className={`provider-card ${provider === 'openrouter' ? 'active' : ''}`}
                onClick={() => setProvider('openrouter')}
              >
                <span>OpenRouter</span>
                <span className="badge">Custom</span>
              </button>
            </div>

            {provider !== 'none' && (
              <div className="input-group">
                <input
                  type="password"
                  placeholder={`Enter your ${provider === 'gemini' ? 'Gemini' : provider === 'openai' ? 'OpenAI' : 'OpenRouter'} API Key`}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                
                {provider === 'openrouter' && (
                  <input
                    type="text"
                    placeholder="Enter OpenRouter Model (e.g. google/gemini-2.5-flash)"
                    value={openRouterModel}
                    onChange={(e) => setOpenRouterModel(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.2)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      color: 'hsl(var(--text-primary))',
                      fontSize: '0.95rem',
                      marginTop: '8px'
                    }}
                  />
                )}

                <div className="api-info">
                  <Info size={12} />
                  <span>Keys are stored locally in your browser and never sent to any server other than the AI provider directly.</span>
                </div>
              </div>
            )}
          </div>

          {/* Section: Obsidian Vault Integration */}
          <div className="setting-section" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '20px' }}>
            <label className="section-label">
              <Folder size={16} />
              <span>Obsidian Vault Integration</span>
            </label>
            <div className="input-group">
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleSelectFolder}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {hasVaultFolder ? 'Reconnect Vault Folder' : 'Connect Vault Folder'}
                </button>
                <span className="helper-text" style={{ color: hasVaultFolder ? 'hsl(var(--success))' : 'inherit' }}>
                  {hasVaultFolder ? `Connected: ${folderName} ✓` : 'No local directory connected.'}
                </span>
              </div>
              <input
                type="text"
                placeholder="Obsidian Vault Name (for URI/Mobile fallback)"
                value={obsidianVaultName}
                onChange={(e) => setObsidianVaultName(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: 'hsl(var(--text-primary))',
                  fontSize: '0.95rem',
                  marginTop: '8px'
                }}
              />
            </div>
            <p className="helper-text">
              Connecting a folder allows direct background note writes. Vault Name is used on mobile/unsupported platforms via Obsidian URIs.
            </p>
          </div>

          {/* Section: Custom Template Prompt */}
          <div className="setting-section">
            <label className="section-label">
              <Sparkles size={16} />
              <span>Custom Formatting System Prompt</span>
            </label>
            <textarea
              rows={3}
              placeholder="e.g. 'Format this as a poetry piece' or 'Translate this transcript to French and summarize'"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
            />
            <p className="helper-text">
              Define the instructions to apply when selecting the "Custom" template mode in the main editor.
            </p>
          </div>

          {/* Danger zone */}
          <div className="setting-section danger-zone">
            <label className="section-label text-error">
              <AlertCircle size={16} />
              <span>Danger Zone</span>
            </label>
            <div className="danger-action">
              {!showClearConfirm ? (
                <button 
                  className="btn-danger-outline" 
                  onClick={() => setShowClearConfirm(true)}
                >
                  Clear Dictation Log
                </button>
              ) : (
                <div className="confirm-group">
                  <span className="confirm-text">Are you sure? This cannot be undone.</span>
                  <div className="confirm-buttons">
                    <button 
                      className="btn-danger" 
                      onClick={() => {
                        onClearHistory();
                        setShowClearConfirm(false);
                      }}
                    >
                      Yes, Clear
                    </button>
                    <button 
                      className="btn-secondary" 
                      onClick={() => setShowClearConfirm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
