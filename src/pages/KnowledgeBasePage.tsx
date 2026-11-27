import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  Copy,
  Download,
  Edit2,
  ExternalLink,
  Filter,
  Loader2,
  Minus,
  MoreHorizontal,
  Plus,
  Search,
  Tag,
  Trash2,
  Lock,
  Users,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
} from 'lucide-react';
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
  KPICard,
  Modal,
  PageHeader,
  Select,
  StatusText,
  Textarea,
  Toast,
  ToastContainer,
  type ToastMessage,
} from '../components/ui/Primitives';
import { formatDate } from '../lib/utils';
import { toCsv } from '../core/logic/operations';

const ACCESS_LABELS: Record<KnowledgeAccessLevel, string> = {
  IT_ONLY: 'IT Staff Only',
  EMPLOYEE_ACCESSIBLE: 'Employee Accessible',
  RESTRICTED: 'Restricted (Admins & Managers)',
};

const ACCESS_ICONS: Record<KnowledgeAccessLevel, React.ComponentType<{ className?: string }>> = {
  IT_ONLY: ShieldCheck,
  EMPLOYEE_ACCESSIBLE: Users,
  RESTRICTED: Lock,
};

const ACCESS_COLORS: Record<KnowledgeAccessLevel, string> = {
  IT_ONLY: 'text-slate-500',
  EMPLOYEE_ACCESSIBLE: 'text-emerald-600 dark:text-emerald-400',
  RESTRICTED: 'text-amber-600 dark:text-amber-400',
};

function renderStructuredContent(content: string) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

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

  const flushCodeBlock = (keyPrefix: string) => {
    if (codeBlockContent.length > 0) {
      elements.push(
        <pre
          key={`${keyPrefix}-codeblock`}
          className="rounded-lg bg-slate-100 dark:bg-slate-800 px-4 py-3 text-sm font-mono text-slate-800 dark:text-slate-200 overflow-x-auto border border-slate-200 dark:border-slate-700"
        >
          <code>{codeBlockContent.join('\n')}</code>
        </pre>
      );
      codeBlockContent = [];
      inCodeBlock = false;
    }
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine;
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock(`codeblock-${index}`);
      } else {
        flushList(`codeblock-start-${index}`);
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      return;
    }

    if (!trimmed) {
      flushList(`gap-${index}`);
      return;
    }
    if (trimmed.startsWith('### ')) {
      flushList(`h3-${index}`);
      elements.push(
        <h4 key={`h3-${index}`} className="text-sm font-semibold text-slate-900 dark:text-slate-100 pt-2">
          {trimmed.slice(4)}
        </h4>
      );
    } else if (trimmed.startsWith('## ')) {
      flushList(`h2-${index}`);
      elements.push(
        <h3 key={`h2-${index}`} className="text-base font-semibold text-slate-900 dark:text-slate-50 pt-3">
          {trimmed.slice(3)}
        </h3>
      );
    } else if (trimmed.startsWith('# ')) {
      flushList(`h1-${index}`);
      elements.push(
        <h2 key={`h1-${index}`} className="text-lg font-bold text-slate-900 dark:text-slate-50 pt-2">
          {trimmed.slice(2)}
        </h2>
      );
    } else if (/^[-*]\s+/.test(trimmed)) {
      listItems.push(trimmed.replace(/^[-*]\s+/, ''));
    } else if (/^\d+\.\s+/.test(trimmed)) {
      listItems.push(trimmed);
    } else if (trimmed.startsWith('`') && trimmed.endsWith('`') && trimmed.length > 2) {
      flushList(`code-${index}`);
      elements.push(
        <pre
          key={`code-${index}`}
          className="rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 overflow-x-auto"
        >
          {trimmed.slice(1, -1)}
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
  flushCodeBlock('end');
  return elements;
}

function highlightSearch(text: string, query: string) {
  if (!query.trim()) return <span>{text}</span>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

export function KnowledgeBasePage() {
  const { workspace, session, can, saveKnowledgeArticle, deleteKnowledgeArticle, addToast } = useWorkspace();
  const [searchParams] = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';

  const [query, setQuery] = useState(initialQ);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | KnowledgeStatus>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'updated' | 'title' | 'category'>('updated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeArticle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeArticle | null>(null);
  const [viewMode, setViewMode] = useState<'split' | 'list' | 'grid'>('split');

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(KNOWLEDGE_CATEGORIES[0]);
  const [accessLevel, setAccessLevel] = useState<KnowledgeAccessLevel>('IT_ONLY');
  const [status, setStatus] = useState<KnowledgeStatus>('PUBLISHED');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((type: ToastMessage['type'], message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const canManage = can('knowledge:manage');
  const role = session?.role ?? 'EMPLOYEE';

  const visibleArticles = useMemo(() => {
    if (!workspace) return [];
    const q = query.trim().toLowerCase();
    let articles = workspace.knowledgeArticles
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
      .sort((a, b) => {
        let aVal: string | number, bVal: string | number;
        if (sortBy === 'title') {
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
        } else if (sortBy === 'category') {
          aVal = a.category.toLowerCase();
          bVal = b.category.toLowerCase();
        } else {
          aVal = new Date(a.updatedAt).getTime();
          bVal = new Date(b.updatedAt).getTime();
        }
        if (sortDir === 'asc') return aVal > bVal ? 1 : -1;
        return aVal < bVal ? 1 : -1;
      });
    return articles;
  }, [workspace, role, canManage, categoryFilter, statusFilter, query, sortBy, sortDir]);

  const activeArticle = useMemo(() => {
    if (visibleArticles.length === 0) return null;
    if (selectedId) {
      const found = visibleArticles.find((a) => a.id === selectedId);
      if (found) return found;
    }
    return visibleArticles[0];
  }, [visibleArticles, selectedId]);

  const stats = useMemo(() => {
    if (!workspace) return { total: 0, published: 0, drafts: 0, categories: 0 };
    const accessible = workspace.knowledgeArticles.filter((a) => canAccessKnowledgeArticle(role, a.accessLevel));
    const cats = new Set(accessible.map((a) => a.category));
    return {
      total: accessible.length,
      published: accessible.filter((a) => a.status === 'PUBLISHED').length,
      drafts: accessible.filter((a) => a.status === 'DRAFT').length,
      categories: cats.size,
    };
  }, [workspace, role]);

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
      showToast('success', editing ? 'Article updated successfully' : 'Article published successfully');
      setModalOpen(false);
    } catch (err) {
      showToast('error', 'Failed to save article');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteKnowledgeArticle(deleteTarget.id);
    showToast('success', 'Article deleted');
    if (selectedId === deleteTarget.id) setSelectedId(null);
    setDeleteTarget(null);
  };

  const handleExportCsv = () => {
    if (visibleArticles.length === 0) return;
    const headers = ['Title', 'Category', 'Access Level', 'Status', 'Summary', 'Tags', 'Author', 'Created', 'Updated'];
    const rows = visibleArticles.map((a) => [
      a.title,
      a.category,
      ACCESS_LABELS[a.accessLevel],
      a.status,
      a.summary,
      a.tags.join('; '),
      a.authorName,
      formatDate(a.createdAt),
      formatDate(a.updatedAt),
    ]);
    const csv = toCsv(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fixdesk-knowledge-base-${formatDate(new Date().toISOString())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Knowledge base exported to CSV');
  };

  const handleCopyLink = (article: KnowledgeArticle) => {
    const url = `${window.location.origin}${window.location.pathname}?q=${encodeURIComponent(article.title)}`;
    navigator.clipboard.writeText(url);
    showToast('success', 'Article link copied to clipboard');
  };

  const handleSort = (field: 'updated' | 'title' | 'category') => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  if (!workspace) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="IT Knowledge Base"
        description="Internal standard operating procedures, troubleshooting runbooks, hardware setup guides, and IT policies."
        actions={
          <>
            {canManage && (
              <Button variant="secondary" onClick={handleExportCsv} aria-label="Export knowledge base to CSV">
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            )}
            {canManage && (
              <Button onClick={openCreateModal}>
                <Plus className="w-4 h-4" />
                New Article
              </Button>
            )}
          </>
        }
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 no-print">
        <KPICard label="Total Articles" value={stats.total} sub="Accessible to you" tone="default" icon={BookOpen} />
        <KPICard label="Published" value={stats.published} sub="Live articles" tone="success" icon={BookOpen} />
        <KPICard label="Drafts" value={stats.drafts} sub="Work in progress" tone="warning" icon={BookOpen} />
        <KPICard label="Categories" value={stats.categories} sub="In use" tone="info" icon={Tag} />
      </div>

      {/* Filter & Search Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row gap-3">
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
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="w-44 sm:w-48"
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
              className="w-36 sm:w-40"
            >
              <option value="ALL">All Statuses</option>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
            </Select>
          )}
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'updated' | 'title' | 'category')}
            aria-label="Sort by"
            className="w-36 sm:w-40"
          >
            <option value="updated">Updated</option>
            <option value="title">Title</option>
            <option value="category">Category</option>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
            aria-label={`Sort ${sortDir === 'asc' ? 'descending' : 'ascending'}`}
          >
            {sortDir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
          <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-800 pl-3 ml-2">
            <Button
              variant={viewMode === 'split' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('split')}
              aria-label="Split view"
              aria-pressed={viewMode === 'split'}
            >
              <BookOpen className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
            >
              <MoreHorizontal className="w-4 h-4 rotate-90" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
            >
              <Tag className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {viewMode === 'split' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Article List */}
          <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden divide-y divide-slate-200 dark:divide-slate-800">
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Articles ({visibleArticles.length})
              </span>
            </div>
            <div className="max-h-[700px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {visibleArticles.map((article) => {
                const isSelected = activeArticle?.id === article.id;
                const AccessIcon = ACCESS_ICONS[article.accessLevel];
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
                      {highlightSearch(article.title, query)}
                    </p>
                    {article.summary && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {highlightSearch(article.summary, query)}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                      <AccessIcon className={`w-3 h-3 ${ACCESS_COLORS[article.accessLevel]}`} />
                      <span>{ACCESS_LABELS[article.accessLevel]}</span>
                      <span>·</span>
                      <span>Updated {formatDate(article.updatedAt)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {visibleArticles.length === 0 && (
              <EmptyState
                title="No matching articles"
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
            )}
          </div>

          {/* Article Reader */}
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
                      {(() => {
                        const AccessIcon = ACCESS_ICONS[activeArticle.accessLevel];
                        return AccessIcon ? <AccessIcon className={`w-3.5 h-3.5 ${ACCESS_COLORS[activeArticle.accessLevel]}`} /> : null;
                      })()}
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
                      onClick={() => handleCopyLink(activeArticle)}
                      aria-label={`Copy link to ${activeArticle.title}`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(activeArticle)}
                      aria-label={`Delete ${activeArticle.title}`}
                      className="text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="prose prose-slate dark:prose-invert max-w-none space-y-3">
                {renderStructuredContent(activeArticle.content)}
              </div>

              {activeArticle.tags.length > 0 && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Tag className="w-3.5 h-3.5 shrink-0" />
                  <span>Tags:</span>
                  {activeArticle.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </article>
          )}
        </div>
      )}

      {viewMode === 'list' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Title</th>
                  <th className="py-3 px-4 hidden md:table-cell">Summary</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Access</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Author</th>
                  <th className="py-3 px-4">Updated</th>
                  {canManage && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleArticles.map((article) => (
                  <tr key={article.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100 max-w-xs truncate">
                      {highlightSearch(article.title, query)}
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell text-slate-600 dark:text-slate-400 max-w-md truncate">
                      {highlightSearch(article.summary || '—', query)}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400">
                        {article.category}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-xs">
                        {(() => {
                          const AccessIcon = ACCESS_ICONS[article.accessLevel];
                          return AccessIcon ? <AccessIcon className={`w-3 h-3 ${ACCESS_COLORS[article.accessLevel]}`} /> : null;
                        })()}
                        {ACCESS_LABELS[article.accessLevel]}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <StatusText
                        tone={article.status === 'PUBLISHED' ? 'success' : 'warning'}
                        label={article.status}
                      />
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{article.authorName}</td>
                    <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDate(article.updatedAt)}
                    </td>
                    {canManage && (
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditModal(article)} aria-label={`Edit ${article.title}`}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleCopyLink(article)} aria-label={`Copy link`}>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(article)} aria-label={`Delete ${article.title}`} className="text-red-600 hover:text-red-700 dark:text-red-400">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleArticles.length === 0 && (
            <EmptyState
              title="No matching articles"
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
          )}
        </div>
      )}

      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleArticles.map((article) => {
            const AccessIcon = ACCESS_ICONS[article.accessLevel];
            return (
              <article
                key={article.id}
                className={`rounded-xl border p-4 transition-colors ${
                  activeArticle?.id === article.id
                    ? 'border-sky-500 bg-sky-50/50 dark:border-sky-500 dark:bg-sky-950/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
                onClick={() => setSelectedId(article.id)}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-sky-700 dark:text-sky-400 px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30">
                    {article.category}
                  </span>
                  <StatusText
                    tone={article.status === 'PUBLISHED' ? 'success' : 'warning'}
                    label={article.status}
                  />
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 mb-2">
                  {highlightSearch(article.title, query)}
                </h3>
                {article.summary && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3 mb-3">
                    {highlightSearch(article.summary, query)}
                  </p>
                )}
                <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                  <AccessIcon className={`w-3 h-3 ${ACCESS_COLORS[article.accessLevel]}`} />
                  <span className="truncate">{ACCESS_LABELS[article.accessLevel]}</span>
                  <span>·</span>
                  <span>{formatDate(article.updatedAt)}</span>
                </div>
                {article.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {article.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      >
                        {tag}
                      </span>
                    ))}
                    {article.tags.length > 3 && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        +{article.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {visibleArticles.length === 0 && (
            <div className="col-span-full">
              <EmptyState
                title="No matching articles"
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
            </div>
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
            hint="Supports headings (# / ## / ###), bullet lists (- item), numbered steps, inline `commands`, and fenced code blocks (```)."
          >
            <Textarea
              id="kb-content"
              rows={14}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# Heading\n## Subheading\n- Bullet point\n- Another point\n1. Numbered step\n\n\`\`\`bash\ncommand --flag\n\`\`\`"
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
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Save Changes' : 'Publish Article'}
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

      <ToastContainer toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}