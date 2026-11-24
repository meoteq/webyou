import { useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileNode } from '@shared/types'
import { errorKey } from '@shared/errors'
import { basenameText, extnameText } from '@shared/path-text'
import { isValidEntryName } from '@shared/names'
import { Icon, type IconName } from '../components/Icon'
import { IconButton, Button } from '../components/Button'
import { ContextMenu, type MenuItemSpec } from '../components/Menu'
import { ConfirmDialog, Dialog } from '../components/Dialog'
import { EmptyState } from '../components/Feedback'
import { useApp } from '../state/AppContext'

function iconFor(name: string): IconName {
  const extension = extnameText(name)
  if (extension === '.html' || extension === '.htm' || extension === '.php') return 'fileCode'
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.avif'].includes(extension)) {
    return 'image'
  }
  if (extension === '.css') return 'layers'
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs' || extension === '.ts') {
    return 'code'
  }
  if (extension === '.json') return 'terminal'
  return 'file'
}

function parentOf(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  const index = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'))
  return index > 0 ? normalized.slice(0, index) : normalized
}

interface MenuState {
  x: number
  y: number
  node: FileNode
}

interface NameDialogState {
  parent: string
  kind: 'file' | 'directory'
}

export function FileTree(): ReactNode {
  const { t } = useTranslation()
  const {
    tree,
    treeTruncated,
    project,
    activePath,
    openFile,
    refreshTree,
    setPanel,
    createItem,
    renameItem,
    deleteItem,
    revealItem,
    openCreate
  } = useApp()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null)
  const [renameTarget, setRenameTarget] = useState<FileNode | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FileNode | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ key: string; options?: Record<string, unknown> } | null>(
    null
  )

  const directoryPaths = useMemo(() => {
    const paths: string[] = []
    const walk = (nodes: FileNode[]): void => {
      for (const node of nodes) {
        if (node.kind === 'directory') {
          paths.push(node.path)
          if (node.children) walk(node.children)
        }
      }
    }
    walk(tree)
    return paths
  }, [tree])

  const toggleDirectory = (path: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const openMenu = (event: MouseEvent, node: FileNode): void => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, node })
  }

  const closeDialogs = (): void => {
    setNameDialog(null)
    setRenameTarget(null)
    setDeleteTarget(null)
    setError(null)
  }

  const menuItems = (node: FileNode): MenuItemSpec[] => {
    if (node.kind === 'directory') {
      return [
        { id: 'new-file', label: t('actions.newFile'), icon: 'file' },
        { id: 'new-folder', label: t('actions.newFolder'), icon: 'folderPlus' },
        { id: 'reveal', label: t('actions.showInFolder'), icon: 'external', separatorBefore: true },
        { id: 'rename', label: t('actions.rename'), icon: 'pencil' },
        { id: 'delete', label: t('actions.delete'), icon: 'trash', danger: true }
      ]
    }
    return [
      { id: 'open', label: t('actions.open'), icon: 'fileCode' },
      { id: 'reveal', label: t('actions.showInFolder'), icon: 'external' },
      { id: 'rename', label: t('actions.rename'), icon: 'pencil', separatorBefore: true },
      { id: 'delete', label: t('actions.delete'), icon: 'trash', danger: true }
    ]
  }

  const handleMenu = (id: string): void => {
    if (!menu) return
    const node = menu.node
    setMenu(null)
    switch (id) {
      case 'open':
        void openFile(node.path)
        break
      case 'new-file':
        setNameDialog({ parent: node.path, kind: 'file' })
        break
      case 'new-folder':
        setNameDialog({ parent: node.path, kind: 'directory' })
        break
      case 'rename':
        setRenameTarget(node)
        break
      case 'delete':
        setDeleteTarget(node)
        break
      case 'reveal':
        void revealItem(node.path)
        break
      default:
        break
    }
  }

  const submitCreate = async (name: string): Promise<void> => {
    if (!nameDialog) return
    setBusy(true)
    setError(null)
    try {
      await createItem(nameDialog.parent, name, nameDialog.kind)
      closeDialogs()
    } catch (caught) {
      setError({
        key: 'errors.createFailed',
        options: { name, reason: t(errorKey(caught)) }
      })
    } finally {
      setBusy(false)
    }
  }

  const submitRename = async (name: string): Promise<void> => {
    if (!renameTarget) return
    if (name === renameTarget.name) {
      // Renaming to the same name is a no-op, not an ALREADY_EXISTS error.
      closeDialogs()
      return
    }
    setBusy(true)
    setError(null)
    try {
      await renameItem(renameTarget.path, name)
      closeDialogs()
    } catch (caught) {
      setError({
        key: 'errors.renameFailed',
        options: { name: renameTarget.name, reason: t(errorKey(caught)) }
      })
    } finally {
      setBusy(false)
    }
  }

  const submitDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    setBusy(true)
    setError(null)
    try {
      await deleteItem(deleteTarget.path)
      closeDialogs()
    } catch (caught) {
      setError({
        key: 'errors.deleteFailed',
        options: { name: deleteTarget.name, reason: t(errorKey(caught)) }
      })
    } finally {
      setBusy(false)
    }
  }

  const renderNodes = (nodes: FileNode[], depth: number): ReactNode =>
    nodes.map((node) => {
      const isDirectory = node.kind === 'directory'
      const expanded = !collapsed.has(node.path)
      const active = activePath === node.path
      return (
        <div key={node.path} role="none">
          <div
            role="treeitem"
            aria-expanded={isDirectory ? expanded : undefined}
            aria-selected={active}
            tabIndex={0}
            className={`tree-row${active ? ' is-active' : ''}`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            onClick={() => {
              if (isDirectory) toggleDirectory(node.path)
              else void openFile(node.path)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                if (isDirectory) toggleDirectory(node.path)
                else void openFile(node.path)
              }
            }}
            onContextMenu={(event) => openMenu(event, node)}
          >
            <span className={`tree-row__chevron${isDirectory ? '' : ' is-hidden'}`}>
              <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={16} />
            </span>
            <span className={`tree-row__icon tree-row__icon--${extnameText(node.name).slice(1) || 'folder'}`}>
              <Icon
                name={isDirectory ? (expanded ? 'folderOpen' : 'folder') : iconFor(node.name)}
                size={18}
              />
            </span>
            <span className="tree-row__name" title={node.name}>
              {node.name}
            </span>
            <span className="tree-row__actions">
              <button
                type="button"
                className="tree-row__more"
                aria-label={t('actions.more')}
                onClick={(event) => openMenu(event, node)}
              >
                <Icon name="more" size={16} />
              </button>
            </span>
          </div>
          {isDirectory && expanded && node.children ? (
            <div role="group">{renderNodes(node.children, depth + 1)}</div>
          ) : null}
        </div>
      )
    })

  return (
    <section className="pane tree-pane" aria-label={t('workspace.files')}>
      <div className="pane__header">
        <div className="pane__heading">
          <h2 className="md-title-small">{t('workspace.files')}</h2>
          <p className="md-body-small pane__subtitle" title={project?.root}>
            {project?.name}
          </p>
        </div>
        <div className="pane__actions">
          <IconButton
            icon="file"
            label={t('actions.newFile')}
            dense
            onClick={() => {
              if (project) setNameDialog({ parent: project.root, kind: 'file' })
            }}
          />
          <IconButton
            icon="folderPlus"
            label={t('actions.newFolder')}
            dense
            onClick={() => {
              if (project) setNameDialog({ parent: project.root, kind: 'directory' })
            }}
          />
          <IconButton
            icon="refresh"
            label={t('actions.refresh')}
            dense
            onClick={() => void refreshTree()}
          />
          <IconButton
            icon="chevronDown"
            label={t('actions.collapseAll')}
            dense
            onClick={() => setCollapsed(new Set(directoryPaths))}
          />
          <IconButton
            icon="panelLeft"
            label={t('actions.close')}
            dense
            tooltipSide="left"
            onClick={() => setPanel('tree', false)}
          />
        </div>
      </div>

      <div className="tree-pane__body" role="tree" aria-label={t('workspace.files')}>
        {tree.length === 0 ? (
          <EmptyState
            icon="folder"
            title={t('workspace.filesEmpty')}
            action={
              <Button variant="tonal" icon="plus" onClick={() => openCreate('blank')}>
                {t('actions.createFromTemplate')}
              </Button>
            }
          />
        ) : (
          <>
            {renderNodes(tree, 0)}
            {treeTruncated ? (
              <p className="tree-notice" role="status">
                <Icon name="info" size={14} />
                {t('workspace.treeTruncated')}
              </p>
            ) : null}
          </>
        )}
      </div>

      <ContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={menu ? menuItems(menu.node) : []}
        onSelect={handleMenu}
        onClose={() => setMenu(null)}
      />

      <NameDialog
        open={nameDialog !== null}
        kind={nameDialog?.kind ?? 'file'}
        error={error}
        busy={busy}
        onCancel={closeDialogs}
        onSubmit={(name) => void submitCreate(name)}
      />

      <NameDialog
        open={renameTarget !== null}
        kind="rename"
        initialValue={renameTarget?.name ?? ''}
        targetName={renameTarget?.name ?? ''}
        error={error}
        busy={busy}
        onCancel={closeDialogs}
        onSubmit={(name) => void submitRename(name)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('dialog.delete.title', { name: deleteTarget?.name ?? '' })}
        message={error ? t(error.key, error.options) : t('dialog.delete.message')}
        confirmLabel={t('actions.delete')}
        cancelLabel={t('actions.cancel')}
        danger
        busy={busy}
        onConfirm={() => void submitDelete()}
        onCancel={closeDialogs}
      />
    </section>
  )
}

interface NameDialogProps {
  open: boolean
  kind: 'file' | 'directory' | 'rename'
  initialValue?: string
  targetName?: string
  error: { key: string; options?: Record<string, unknown> } | null
  busy: boolean
  onCancel: () => void
  onSubmit: (name: string) => void
}

function NameDialog({
  open,
  kind,
  initialValue = '',
  targetName = '',
  error,
  busy,
  onCancel,
  onSubmit
}: NameDialogProps): ReactNode {
  const { t } = useTranslation()
  const formId = useId()
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    setValue(initialValue)
    // Only reset when the dialog is opened, not while the person types.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    // Run after Dialog's own 40 ms autofocus, otherwise focusing the field
    // again would move the caret back to the end of the name.
    const timer = window.setTimeout(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      if (kind === 'rename') {
        const dot = initialValue.lastIndexOf('.')
        input.setSelectionRange(0, dot > 0 ? dot : initialValue.length)
      } else {
        input.select()
      }
    }, 60)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const trimmed = value.trim()
  const valid = isValidEntryName(trimmed)

  const title =
    kind === 'file'
      ? t('dialog.newFile.title')
      : kind === 'directory'
        ? t('dialog.newFolder.title')
        : t('dialog.rename.title', { name: targetName })

  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      dismissible={!busy}
      actions={
        <>
          <Button variant="text" onClick={onCancel} disabled={busy}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={busy || !valid}>
            {kind === 'rename' ? t('actions.save') : t('actions.create')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault()
          if (valid && !busy) onSubmit(trimmed)
        }}
      >
        <label className="md-field">
          <span className="md-field__label">
            {kind === 'rename' ? t('dialog.rename.label') : t('dialog.newFile.name')}
          </span>
          <input
            className="md-field__input"
            value={value}
            ref={inputRef}
            autoFocus
            data-autofocus
            spellCheck={false}
            placeholder={
              kind === 'file'
                ? t('dialog.newFile.namePlaceholder')
                : kind === 'directory'
                  ? t('dialog.newFolder.namePlaceholder')
                  : ''
            }
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <p className="md-field__hint">
          {kind === 'file'
            ? t('dialog.newFile.hint')
            : kind === 'directory'
              ? t('dialog.newFolder.hint')
              : t('dialog.createProject.nameHint')}
        </p>
        {trimmed !== value && trimmed.length > 0 ? (
          <p className="md-field__hint">{t('dialog.trimHint')}</p>
        ) : null}
        {error ? <p className="md-field__error">{t(error.key, error.options)}</p> : null}
      </form>
    </Dialog>
  )
}

/** The parent directory for a path; exported for file actions in other panes. */
export function parentDirectory(path: string): string {
  return parentOf(path)
}

/** File name without extension, useful for suggestions. */
export function fileStem(path: string): string {
  const name = basenameText(path)
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(0, index) : name
}
