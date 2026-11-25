import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, Edit2, Plus, Search, Trash2, Lock, Users, ShieldCheck } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { canAccessKnowledgeArticle } from '../core/permissions/rbac';
import { knowledgeArticleSchema } from '../core/validation/schemas';
import {
  KNOWLEDGE_CATEGORIES,
  type KnowledgeAccessLevel,
  type KnowledgeArticle,
  type KnowledgeStatus,
} from '../core/types/domain';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusText,
  Textarea,
} from '../components/ui/Primitives';
import { formatDate } from '../lib/utils';

const ACCESS_LABELS: Record<KnowledgeAccessLevel, string> = {
  IT_ONLY: 'IT Staff Only',
  EMPLOYEE_ACCESSIBLE: 'Employee Accessible',
  RESTRICTED: 'Restricted (Admins & Managers)',
};

function renderStructuredContent(content: string) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (keyPrefix: string) => {
    if (listItems.length > 0) {
      elements.push(
        <ul
          key={`${keyPrefix}-list`}
          className="list-disc pl-5 space-y-1 text-sm text-slate-700 dark:text-slate-300"
        >
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      flushList(`gap-${index}`);
      return;
    }
    if (line.startsWith('### ')) {
      flushList(`h3-${index}`);
      elements.push(
        <h4 key={`h3-${index}`} className="text-sm font-semibold text-slate-900 dark:text-slate-100 pt-2">
          {line.slice(4)}
        </h4>
      );
    } else if (line.startsWith('## ')) {
      flushList(`h2-${index}`);
      elements.push(
        <h3 key={`h2-${index}`} className="text-base font-semibold text-slate-900 dark:text-slate-50 pt-3">
          {line.slice(3)}
        </h3>
      );
    } else if (line.startsWith('# ')) {
      flushList(`h1-${index}`);
      elements.push(
        <h2 key={`h1-${index}`} className="text-lg font-bold text-slate-900 dark:text-slate-50 pt-2">
          {line.slice(2)}
        </h2>
      );
    } else if (/^[-*]\s+/.test(line)) {
      listItems.push(line.replace(/^[-*]\s+/, ''));
    } else if (/^\d+\.\s+/.test(line)) {
      listItems.push(line);
    } else if (line.startsWith('`') && line.endsWith('`') && line.length > 2) {
      flushList(`code-${index}`);
      elements.push(
        <pre
          key={`code-${index}`}
          className="rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 overflow-x-auto"
        >
          {line.slice(1, -1)}
        </pre>
      );
    } else {
      flushList(`p-${index}`);
      elements.push(
        <p key={`p-${index}`} className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {line}
        </p>
      );
    }
  });

  flushList('end');
  return elements;
}

export function KnowledgeBasePage() {
  const { workspace, session, can, saveKnowledgeArticle, deleteKnowledgeArticle } = useWorkspace();
  const [searchParams] = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';

  const [query, setQuery] = useState(initialQ);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | KnowledgeStatus>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeArticle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeArticle | null>(null);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(KNOWLEDGE_CATEGORIES[0]);
  const [accessLevel, setAccessLevel] = useState<KnowledgeAccessLevel>('IT_ONLY');
  const [status, setStatus] = useState<KnowledgeStatus>('PUBLISHED');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const canManage = can('knowledge:manage');
  const role = session?.role ?? 'EMPLOYEE';

  const visibleArticles = useMemo(() => {
    if (!workspace) return [];
    const q = query.trim().toLowerCase();
    return workspace.knowledgeArticles
      .filter((art) => {
        if (!canAccessKnowledgeArticle(role, art.accessLevel)) return false;
        if (!canManage && art.status !== 'PUBLISHED') return false;
        if (categoryFilter !== 'ALL' && art.category !== categoryFilter) return false;
        if (statusFilter !== 'ALL' && art.status !== statusFilter) return false;
        if (!q) return true;
        return (
          art.title.toLowerCase().includes(q) ||
          art.category.toLowerCase().includes(q) ||
          art.summary.toLowerCase().includes(q) ||
          art.content.toLowerCase().includes(q) ||
          art.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [workspace, role, canManage, categoryFilter, statusFilter, query]);

  const activeArticle = useMemo(() => {
    if (visibleArticles.length === 0) return null;
    if (selectedId) {
      const found = visibleArticles.find((a) => a.id === selectedId);
      if (found) return found;
    }
    return visibleArticles[0];
  }, [visibleArticles, selectedId]);

  const openCreateModal = () => {
    setEditing(null);
    setTitle('');
    setCategory(KNOWLEDGE_CATEGORIES[0]);
    setAccessLevel('IT_ONLY');
    setStatus('PUBLISHED');
    setSummary('');
    setContent('');
    setTagsText('');
    setFormErrors({});
    setModalOpen(true);
  };

  const openEditModal = (article: KnowledgeArticle) => {
    setEditing(article);
    setTitle(article.title);
    setCategory(article.category);
    setAccessLevel(article.accessLevel);
    setStatus(article.status);
    setSummary(article.summary);
    setContent(article.content);
    setTagsText(article.tags.join(', '));
    setFormErrors({});
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const parsed = knowledgeArticleSchema.safeParse({
      title,
      category,
      accessLevel,
      status,
      summary,
      content,
      tags,
    });

    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setFormErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      await saveKnowledgeArticle({
        id: editing?.id,
        ...parsed.data,
      });
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteKnowledgeArticle(deleteTarget.id);
    if (selectedId === deleteTarget.id) setSelectedId(null);
    setDeleteTarget(null);
  };

  if (!workspace) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="IT Knowledge Base"
        description="Internal standard operating procedures, troubleshooting runbooks, hardware setup guides, and IT policies."
        actions={
          canManage ? (
            <Button onClick={openCreateModal}>
              <Plus className="w-4 h-4" />
              New Article
            </Button>
          ) : undefined
        }
      />

      {/* Filter bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guides, commands, tags, or policies..."
            aria-label="Search knowledge base articles"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="w-48"
          >
            <option value="ALL">All Categories</option>
            {KNOWLEDGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          {canManage && (
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | KnowledgeStatus)}
              aria-label="Filter by publish status"
              className="w-40"
            >
              <option value="ALL">All Statuses</option>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
            </Select>
          )}
        </div>
      </div>

      {visibleArticles.length === 0 ? (
        <EmptyState
          title="No matching knowledge base articles"
          description="Try broadening your search keywords or create a new IT runbook for your team."
          action={
            canManage ? (
              <Button onClick={openCreateModal}>
                <Plus className="w-4 h-4" />
                Create Article
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Article list */}
          <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden divide-y divide-slate-200 dark:divide-slate-800">
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Articles ({visibleArticles.length})
              </span>
            </div>
            <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {visibleArticles.map((article) => {
                const isSelected = activeArticle?.id === article.id;
                return (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => setSelectedId(article.id)}
                    className={`w-full text-left px-4 py-3.5 transition-colors ${
                      isSelected
                        ? 'bg-sky-50/70 dark:bg-sky-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-sky-700 dark:text-sky-400">
                        {article.category}
                      </span>
                      <StatusText
                        tone={article.status === 'PUBLISHED' ? 'success' : 'warning'}
                        label={article.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                      />
                    </div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1 line-clamp-2">
                      {article.title}
                    </p>
                    {article.summary && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {article.summary}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                      {ACCESS_LABELS[article.accessLevel]} · Updated {formatDate(article.updatedAt)}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Article reader */}
          {activeArticle && (
            <article className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div className="space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-sky-700 dark:text-sky-400">
                      {activeArticle.category}
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      {activeArticle.accessLevel === 'RESTRICTED' ? (
                        <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      ) : activeArticle.accessLevel === 'IT_ONLY' ? (
                        <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                      ) : (
                        <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      )}
                      {ACCESS_LABELS[activeArticle.accessLevel]}
                    </span>
                    <span>·</span>
                    <StatusText
                      tone={activeArticle.status === 'PUBLISHED' ? 'success' : 'warning'}
                      label={activeArticle.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                    />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 leading-snug">
                    {activeArticle.title}
                  </h2>
                  {activeArticle.summary && (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {activeArticle.summary}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Author: {activeArticle.authorName} · Last updated {formatDate(activeArticle.updatedAt)}
                  </p>
                </div>

                {canManage && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openEditModal(activeArticle)}
                      aria-label={`Edit ${activeArticle.title}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(activeArticle)}
                      aria-label={`Delete ${activeArticle.title}`}
                      className="text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-3">{renderStructuredContent(activeArticle.content)}</div>

              {activeArticle.tags.length > 0 && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                  <span>Tags: {activeArticle.tags.join(', ')}</span>
                </div>
              )}
            </article>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Knowledge Base Article' : 'Create Knowledge Base Article'}
        subtitle="Document reusable IT setup guides, troubleshooting procedures, and operational policies."
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Article Title" htmlFor="kb-title" required error={formErrors.title}>
            <Input
              id="kb-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Standard Windows 11 Workstation Provisioning Checklist"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Category" htmlFor="kb-category" required error={formErrors.category}>
              <Select
                id="kb-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {KNOWLEDGE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Access Level" htmlFor="kb-access" required>
              <Select
                id="kb-access"
                value={accessLevel}
                onChange={(e) => setAccessLevel(e.target.value as KnowledgeAccessLevel)}
              >
                <option value="IT_ONLY">IT Staff Only</option>
                <option value="EMPLOYEE_ACCESSIBLE">Employee Accessible</option>
                <option value="RESTRICTED">Restricted (Admins & Managers)</option>
              </Select>
            </Field>

            <Field label="Publish Status" htmlFor="kb-status" required>
              <Select
                id="kb-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as KnowledgeStatus)}
              >
                <option value="PUBLISHED">Published</option>
                <option value="DRAFT">Draft</option>
              </Select>
            </Field>
          </div>

          <Field label="Summary" htmlFor="kb-summary" error={formErrors.summary}>
            <Input
              id="kb-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief 1-sentence overview shown in search results"
            />
          </Field>

          <Field
            label="Article Content"
            htmlFor="kb-content"
            required
            error={formErrors.content}
            hint="Supports headings (# / ## / ###), bullet lists (- item), numbered steps, and single-line `commands`."
          >
            <Textarea
              id="kb-content"
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="## Steps&#10;- Verify network link&#10;- Run diagnostic command"
              className="font-mono text-xs"
            />
          </Field>

          <Field
            label="Tags (comma-separated)"
            htmlFor="kb-tags"
            error={formErrors.tags}
          >
            <Input
              id="kb-tags"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="windows, onboarding, bitlocker, vlan"
            />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Publish Article'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Knowledge Article"
        message={`Permanently delete "${deleteTarget?.title ?? ''}"? This action is recorded in the audit log and cannot be undone.`}
        confirmLabel="Delete Article"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
