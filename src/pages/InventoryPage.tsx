import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownUp, Edit3, Plus, Search, Trash2, Download, Upload, AlertTriangle, Package, TrendingUp, TrendingDown } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { getStockStatus } from '../core/logic/operations';
import { inventoryItemSchema } from '../core/validation/schemas';
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
  Toast,
  KPICard,
} from '../components/ui/Primitives';
import { formatCurrency, formatDateTime } from '../lib/utils';
import type { InventoryItem, InventoryTransactionType } from '../core/types/domain';

export function InventoryPage() {
  const { workspace, can, saveInventoryItem, deleteInventoryItem, performStockOperation } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [stockFilter, setStockFilter] = useState('ALL');
  const [viewTab, setViewTab] = useState<'catalog' | 'ledger'>('catalog');

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [txTarget, setTxTarget] = useState<InventoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [txError, setTxError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emptyItem = useMemo(
    () => ({
      sku: '',
      name: '',
      category: workspace?.organization.inventoryCategories[0] ?? 'Cables',
      manufacturer: '',
      description: '',
      quantity: 0,
      minStock: 5,
      maxStock: 25,
      unit: 'pcs',
      locationId: workspace?.locations[0]?.id ?? 'loc-wh',
      unitPrice: 0,
      currency: workspace?.organization.currency ?? 'USD',
      supplier: '',
    }),
    [workspace]
  );

  const [itemForm, setItemForm] = useState(emptyItem);
  const [txForm, setTxForm] = useState({
    type: 'ISSUE' as InventoryTransactionType,
    quantity: 1,
    reference: '',
    notes: '',
  });

  useEffect(() => {
    if (searchParams.get('action') === 'new' && can('inventory:manage')) {
      setEditingItem(null);
      setItemForm(emptyItem);
      setErrors({});
      setItemModalOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, can, emptyItem]);

  if (!workspace) return null;

  const locMap = new Map(workspace.locations.map((l) => [l.id, l.name]));
  const itemMap = new Map(workspace.inventory.map((i) => [i.id, i]));
  const currency = workspace.organization.currency;

  const filteredItems = workspace.inventory.filter((item) => {
    const status = getStockStatus(item);
    if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
    if (stockFilter !== 'ALL' && status !== stockFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      item.sku.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      item.manufacturer.toLowerCase().includes(q) ||
      item.supplier.toLowerCase().includes(q)
    );
  });

  const totalValuation = workspace.inventory.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0);
  const lowCount = workspace.inventory.filter((i) => getStockStatus(i) === 'LOW_STOCK').length;
  const outCount = workspace.inventory.filter((i) => getStockStatus(i) === 'OUT_OF_STOCK').length;
  const overstockCount = workspace.inventory.filter((i) => getStockStatus(i) === 'OVERSTOCK').length;

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = inventoryItemSchema.safeParse(itemForm);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message;
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      await saveInventoryItem({ ...parsed.data, id: editingItem?.id });
      setItemModalOpen(false);
      setToast({
        type: 'success',
        message: editingItem ? 'Inventory item updated successfully' : 'Inventory item added successfully',
      });
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save inventory item' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txTarget) return;
    setTxError(null);
    const res = await performStockOperation({
      itemId: txTarget.id,
      type: txForm.type,
      quantity: Number(txForm.quantity),
      reference: txForm.reference,
      notes: txForm.notes,
    });
    if (!res.ok) {
      setTxError(res.error);
      return;
    }
    setTxTarget(null);
    setToast({ type: 'success', message: 'Stock movement recorded successfully' });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteInventoryItem(deleteTarget.id);
      setDeleteTarget(null);
      setToast({ type: 'success', message: 'Inventory item deleted successfully' });
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete inventory item' });
    }
  };

  const handleDownloadCSV = () => {
    const headers = ['SKU', 'Name', 'Category', 'Location', 'Quantity', 'Unit', 'Min Stock', 'Max Stock', 'Unit Price', 'Currency', 'Supplier', 'Status'];
    const rows = workspace.inventory.map((item) => [
      item.sku,
      item.name,
      item.category,
      locMap.get(item.locationId) ?? '—',
      String(item.quantity),
      item.unit,
      String(item.minStock),
      String(item.maxStock),
      String(item.unitPrice),
      item.currency,
      item.supplier,
      getStockStatus(item).replace(/_/g, ' '),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventory-${workspace.organization.slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setToast({ type: 'success', message: 'Inventory exported to CSV' });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory & Spare Parts"
        description="Track IT consumables, spare components, reorder thresholds, stock movements, and depot valuation."
        actions={
          <>
            {can('inventory:manage') && (
              <Button onClick={handleDownloadCSV} variant="secondary">
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            )}
            {can('inventory:manage') && (
              <Button
                onClick={() => {
                  setEditingItem(null);
                  setItemForm(emptyItem);
                  setErrors({});
                  setItemModalOpen(true);
                }}
              >
                <Plus className="w-4 h-4" />
                Add Inventory Item
              </Button>
            )}
          </>
        }
      />

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Total Stock SKUs"
          value={workspace.inventory.length}
          sub={`${workspace.inventory.length} unique items tracked`}
          tone="default"
          icon={Package}
          trend={{ value: '+2', positive: true }}
        />
        <KPICard
          label="Inventory Valuation"
          value={formatCurrency(totalValuation, currency)}
          sub={`${workspace.inventory.length} SKUs total value`}
          tone="default"
          icon={TrendingUp}
          trend={{ value: '+5.2%', positive: true }}
        />
        <KPICard
          label="Low Stock Alerts"
          value={lowCount}
          sub={`${outCount} out of stock`}
          tone={lowCount > 0 || outCount > 0 ? 'danger' : 'success'}
          icon={AlertTriangle}
          trend={{ value: lowCount > 0 ? '+1' : '0', positive: false }}
        />
        <KPICard
          label="Overstock Items"
          value={overstockCount}
          sub="Above maximum threshold"
          tone={overstockCount > 0 ? 'warning' : 'success'}
          icon={TrendingDown}
          trend={{ value: overstockCount > 0 ? '+1' : '0', positive: false }}
        />
      </div>

      {/* View Switcher & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 w-fit">
          <button
            type="button"
            onClick={() => setViewTab('catalog')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewTab === 'catalog'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Stock Catalog ({workspace.inventory.length})
          </button>
          <button
            type="button"
            onClick={() => setViewTab('ledger')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewTab === 'ledger'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Stock Movement History ({workspace.inventoryTransactions.length})
          </button>
        </div>

        {viewTab === 'catalog' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-60">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search SKU, name, supplier..."
                aria-label="Search inventory"
                className="pl-9 h-9"
              />
            </div>
            <Select
              aria-label="Filter inventory by category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-44 h-9"
            >
              <option value="ALL">All Categories</option>
              {workspace.organization.inventoryCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter inventory by stock status"
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="w-40 h-9"
            >
              <option value="ALL">All Stock States</option>
              <option value="IN_STOCK">In Stock</option>
              <option value="LOW_STOCK">Low Stock</option>
              <option value="OUT_OF_STOCK">Out of Stock</option>
              <option value="OVERSTOCK">Overstock</option>
            </Select>
          </div>
        )}
      </div>

      {viewTab === 'catalog' ? (
        filteredItems.length === 0 ? (
          <EmptyState
            title="No inventory items found"
            description="Adjust your filters or add spare parts and supplies to begin tracking stock."
          />
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" role="grid">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4 font-medium">SKU / Item</th>
                    <th className="py-3 px-4 font-medium">Category</th>
                    <th className="py-3 px-4 font-medium">Location</th>
                    <th className="py-3 px-4 font-medium text-right">Quantity</th>
                    <th className="py-3 px-4 font-medium text-right">Unit Price</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredItems.map((item) => {
                    const status = getStockStatus(item);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{item.name}</p>
                          <p className="text-xs font-mono text-slate-500">
                            {item.sku} · {item.manufacturer || 'Generic'}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">{item.category}</td>
                        <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                          {locMap.get(item.locationId) ?? '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {item.quantity} {item.unit}
                          </span>
                          <span className="block text-[11px] text-slate-400">
                            min {item.minStock} / max {item.maxStock}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                          {formatCurrency(item.unitPrice, item.currency)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <StatusText
                            tone={
                              status === 'OUT_OF_STOCK'
                                ? 'danger'
                                : status === 'LOW_STOCK'
                                ? 'warning'
                                : status === 'OVERSTOCK'
                                ? 'info'
                                : 'success'
                            }
                            label={status.replace(/_/g, ' ')}
                          />
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {can('inventory:manage') && (
                              <>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    setTxTarget(item);
                                    setTxForm({ type: 'ISSUE', quantity: 1, reference: '', notes: '' });
                                    setTxError(null);
                                  }}
                                  aria-label={`Record stock movement for ${item.sku}`}
                                >
                                  <ArrowDownUp className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Stock Move</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label={`Edit ${item.sku}`}
                                  onClick={() => {
                                    setEditingItem(item);
                                    setItemForm({
                                      sku: item.sku,
                                      name: item.name,
                                      category: item.category,
                                      manufacturer: item.manufacturer,
                                      description: item.description,
                                      quantity: item.quantity,
                                      minStock: item.minStock,
                                      maxStock: item.maxStock,
                                      unit: item.unit,
                                      locationId: item.locationId,
                                      unitPrice: item.unitPrice,
                                      currency: item.currency,
                                      supplier: item.supplier,
                                    });
                                    setErrors({});
                                    setItemModalOpen(true);
                                  }}
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label={`Delete ${item.sku}`}
                                  onClick={() => setDeleteTarget(item)}
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" role="grid">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-medium">Timestamp</th>
                  <th className="py-3 px-4 font-medium">Item</th>
                  <th className="py-3 px-4 font-medium">Operation</th>
                  <th className="py-3 px-4 font-medium text-right">Delta</th>
                  <th className="py-3 px-4 font-medium text-right">Balance</th>
                  <th className="py-3 px-4 font-medium">Reference / Notes</th>
                  <th className="py-3 px-4 font-medium">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {workspace.inventoryTransactions.map((tx) => {
                  const item = itemMap.get(tx.itemId);
                  return (
                    <tr key={tx.id}>
                      <td className="py-3 px-4 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                        {formatDateTime(tx.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-slate-900 dark:text-slate-100">
                        {item ? `${item.sku} · ${item.name}` : tx.itemId}
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {tx.type}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono text-xs font-semibold tabular-nums ${
                          tx.quantityDelta >= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {tx.quantityDelta > 0 ? `+${tx.quantityDelta}` : tx.quantityDelta}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-800 dark:text-slate-200">
                        {tx.resultingQuantity}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">
                        {tx.reference ? `${tx.reference} — ` : ''}
                        {tx.notes || '—'}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">{tx.performedBy}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Item Modal */}
      <Modal
        open={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        title={editingItem ? `Edit Inventory · ${editingItem.sku}` : 'Add Inventory Item'}
      >
        <form onSubmit={handleSaveItem} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="SKU / Item ID" htmlFor="invSku" required error={errors.sku}>
              <Input
                id="invSku"
                value={itemForm.sku}
                onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })}
                placeholder="CAB-CAT6A-3M"
              />
            </Field>
            <Field label="Item Name" htmlFor="invName" required error={errors.name}>
              <Input
                id="invName"
                value={itemForm.name}
                onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                placeholder="Cat6A Patch Cable 3m"
              />
            </Field>
            <Field label="Category" htmlFor="invCat" required>
              <Select
                id="invCat"
                value={itemForm.category}
                onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
              >
                {workspace.organization.inventoryCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Storage Location" htmlFor="invLoc" required>
              <Select
                id="invLoc"
                value={itemForm.locationId}
                onChange={(e) => setItemForm({ ...itemForm, locationId: e.target.value })}
              >
                {workspace.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Manufacturer" htmlFor="invMfr">
              <Input
                id="invMfr"
                value={itemForm.manufacturer}
                onChange={(e) => setItemForm({ ...itemForm, manufacturer: e.target.value })}
              />
            </Field>
            <Field label="Supplier" htmlFor="invSupplier">
              <Input
                id="invSupplier"
                value={itemForm.supplier}
                onChange={(e) => setItemForm({ ...itemForm, supplier: e.target.value })}
              />
            </Field>
            <Field label="Opening / Current Quantity" htmlFor="invQty" required error={errors.quantity}>
              <Input
                id="invQty"
                type="number"
                min={0}
                value={itemForm.quantity}
                onChange={(e) => setItemForm({ ...itemForm, quantity: Number(e.target.value) })}
              />
            </Field>
            <Field label="Unit" htmlFor="invUnit" required error={errors.unit}>
              <Input
                id="invUnit"
                value={itemForm.unit}
                onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                placeholder="pcs / cartridges / kits"
              />
            </Field>
            <Field label="Minimum Stock Threshold" htmlFor="invMin" required error={errors.minStock}>
              <Input
                id="invMin"
                type="number"
                min={0}
                value={itemForm.minStock}
                onChange={(e) => setItemForm({ ...itemForm, minStock: Number(e.target.value) })}
              />
            </Field>
            <Field label="Maximum Stock Threshold" htmlFor="invMax" required error={errors.maxStock}>
              <Input
                id="invMax"
                type="number"
                min={1}
                value={itemForm.maxStock}
                onChange={(e) => setItemForm({ ...itemForm, maxStock: Number(e.target.value) })}
              />
            </Field>
            <Field label="Unit Price" htmlFor="invPrice" required error={errors.unitPrice}>
              <Input
                id="invPrice"
                type="number"
                min={0}
                step="0.01"
                value={itemForm.unitPrice}
                onChange={(e) => setItemForm({ ...itemForm, unitPrice: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="invDesc">
            <Textarea
              id="invDesc"
              value={itemForm.description}
              onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setItemModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : editingItem ? 'Save Item' : 'Add Item'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Stock Movement Modal */}
      <Modal
        open={Boolean(txTarget)}
        onClose={() => setTxTarget(null)}
        title={txTarget ? `Stock Movement · ${txTarget.name}` : 'Stock Movement'}
        subtitle={txTarget ? `Current on-hand balance: ${txTarget.quantity} ${txTarget.unit}` : undefined}
        size="md"
      >
        <form onSubmit={handleStockSubmit} className="space-y-4">
          {txError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-3 py-2.5 text-xs text-red-700 dark:text-red-300"
            >
              {txError}
            </div>
          )}
          <Field label="Transaction Type" htmlFor="txType" required>
            <Select
              id="txType"
              value={txForm.type}
              onChange={(e) => setTxForm({ ...txForm, type: e.target.value as InventoryTransactionType })}
            >
              <option value="ADD">Add Stock (Receive Shipment)</option>
              <option value="ISSUE">Issue Items (Consume / Deploy)</option>
              <option value="RETURN">Return Items to Stock</option>
              <option value="TRANSFER">Transfer Stock Out</option>
              <option value="ADJUST">Cycle Count Adjustment (+/-)</option>
            </Select>
          </Field>
          <Field
            label={txForm.type === 'ADJUST' ? 'Adjustment Delta (use negative to subtract)' : 'Quantity'}
            htmlFor="txQty"
            required
          >
            <Input
              id="txQty"
              type="number"
              value={txForm.quantity}
              onChange={(e) => setTxForm({ ...txForm, quantity: Number(e.target.value) })}
            />
          </Field>
          <Field label="Reference (PO #, Asset Tag, or Department)" htmlFor="txRef">
            <Input
              id="txRef"
              value={txForm.reference}
              onChange={(e) => setTxForm({ ...txForm, reference: e.target.value })}
              placeholder="PO-2026-0912 or FX-PRT-001"
            />
          </Field>
          <Field label="Notes" htmlFor="txNotes">
            <Textarea
              id="txNotes"
              value={txForm.notes}
              onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setTxTarget(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Recording...' : 'Record Transaction'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Inventory Item"
        message={`Delete ${deleteTarget?.sku} (${deleteTarget?.name}) from catalog? Past movement records remain in the audit log.`}
        confirmLabel="Delete Item"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}