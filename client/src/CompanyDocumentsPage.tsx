import { useEffect, useState, type FormEvent } from 'react';
import { Download, FileText, LoaderCircle, Plus, Trash2, Upload, X } from 'lucide-react';
import { api, ApiError, type ApiCompanyDocument, type ApiUser } from './api';
import './CompanyDocumentsPage.css';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ACCEPTED_FILES = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.rtf,.csv,.txt';

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

export function CompanyDocumentsPage({ user }: { user: ApiUser }) {
  const canManage = user.role === 'hr' || user.role === 'super_admin';
  const [documents, setDocuments] = useState<ApiCompanyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedName, setSelectedName] = useState('');

  async function loadDocuments() {
    try {
      setDocuments(await api.companyDocuments());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load company documents.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
    // Initial data load is tied to the authenticated page mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem('document');
    if (!(fileInput instanceof HTMLInputElement) || !fileInput.files?.[0]) {
      setError('Choose a document to upload.');
      return;
    }

    const file = fileInput.files[0];
    if (file.size > MAX_FILE_SIZE) {
      setError('Documents must be 25 MB or smaller.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api.uploadCompanyDocument(file);
      form.reset();
      setSelectedName('');
      setSuccess(`${file.name} was uploaded.`);
      await loadDocuments();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload this document.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadDocument(document: ApiCompanyDocument) {
    setBusy(true);
    setError('');
    try {
      const blob = await api.downloadCompanyDocument(document.id);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Could not download this document.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteDocument(document: ApiCompanyDocument) {
    if (!window.confirm(`Delete "${document.name}"? This cannot be undone.`)) return;

    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api.deleteCompanyDocument(document.id);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setSuccess(`${document.name} was deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof ApiError ? deleteError.message : 'Could not delete this document.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="company-documents-page">
      <div className="page-title-row">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" /> SHARED RESOURCES
          </div>
          <h1>Company documents</h1>
          <p>Policies, guides, and other documents shared with everyone at Northstar.</p>
        </div>
      </div>

      {error && (
        <div className="documents-notice documents-error" role="alert">
          <span>{error}</span>
          <button className="documents-icon-button" aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {success && (
        <div className="documents-notice documents-success" role="status">
          <span>{success}</span>
          <button className="documents-icon-button" aria-label="Dismiss message" onClick={() => setSuccess('')}>
            <X size={16} />
          </button>
        </div>
      )}

      {canManage && (
        <form className="document-upload-card" onSubmit={(event) => void uploadDocument(event)}>
          <div className="document-upload-icon">
            <Upload size={20} />
          </div>
          <div className="document-upload-copy">
            <strong>Add a company document</strong>
            <span>Available to all employees. PDF, Office, RTF, CSV, and text files up to 25 MB.</span>
          </div>
          <label className="document-file-picker">
            <Plus size={16} />
            <span>{selectedName || 'Choose file'}</span>
            <input
              name="document"
              type="file"
              accept={ACCEPTED_FILES}
              required
              disabled={busy}
              onChange={(event) => setSelectedName(event.currentTarget.files?.[0]?.name ?? '')}
            />
          </label>
          <button className="primary-button document-upload-button" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="document-spinner" size={16} /> : <Upload size={16} />}
            Upload
          </button>
        </form>
      )}

      <div className="documents-list-heading">
        <div>
          <h2>Shared with everyone</h2>
          <p>{documents.length} {documents.length === 1 ? 'document' : 'documents'}</p>
        </div>
        {loading && <LoaderCircle className="document-spinner" size={18} aria-label="Loading documents" />}
      </div>

      {!loading && documents.length === 0 ? (
        <div className="documents-empty">
          <span className="documents-empty-icon"><FileText size={24} /></span>
          <strong>No company documents yet</strong>
          <p>{canManage ? 'Upload a document to make it available to everyone.' : 'Shared company documents will appear here.'}</p>
        </div>
      ) : (
        <div className="documents-list">
          {documents.map((document) => (
            <article className="document-row" key={document.id}>
              <span className="document-type-icon"><FileText size={19} /></span>
              <div className="document-details">
                <strong title={document.name}>{document.name}</strong>
                <span>{formatSize(document.size)} <i>·</i> Added {formatDate(document.uploadedAt)}</span>
              </div>
              <button
                className="documents-icon-button"
                aria-label={`Download ${document.name}`}
                title="Download"
                disabled={busy}
                onClick={() => void downloadDocument(document)}
              >
                <Download size={17} />
              </button>
              {canManage && (
                <button
                  className="documents-icon-button document-delete-button"
                  aria-label={`Delete ${document.name}`}
                  title="Delete"
                  disabled={busy}
                  onClick={() => void deleteDocument(document)}
                >
                  <Trash2 size={17} />
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
