import { useState, useCallback } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { useI18n } from '../../lib/i18n'
import { fetcher, apiPatch, apiDelete } from '../../lib/fetcher'
import type { FeedWithCounts, Category } from '../../../shared/types'
import { Pencil, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { IconButton } from '@/components/ui/icon-button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export function ViewerTab() {
  const { t } = useI18n()
  const { data: feedsData, mutate: mutateFeeds } = useSWR<{ feeds: FeedWithCounts[] }>('/api/feeds', fetcher)
  useSWR<{ categories: Category[] }>('/api/categories', fetcher)
  const { mutate: globalMutate } = useSWRConfig()
  const [filter, setFilter] = useState('')
  const [deleting, setDeleting] = useState<FeedWithCounts | null>(null)
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)

  const revalidateArticles = useCallback(() => {
    void globalMutate((key: unknown) =>
      typeof key === 'string' && key.includes('/api/articles'))
  }, [globalMutate])

  async function handleDeleteConfirm() {
    if (!deleting) return
    const feedId = deleting.id
    setDeleting(null)
    void mutateFeeds(
      prev => prev ? { ...prev, feeds: prev.feeds.filter(f => f.id !== feedId) } : prev,
      { revalidate: false },
    )
    try {
      await apiDelete(`/api/feeds/${feedId}`)
    } catch {
      // revalidation below restores the row on failure
    }
    void mutateFeeds()
    revalidateArticles()
  }

  async function handleRenameSubmit() {
    if (!renaming || !renaming.name.trim()) {
      setRenaming(null)
      return
    }
    await apiPatch(`/api/feeds/${renaming.id}`, { name: renaming.name.trim() })
    setRenaming(null)
    void mutateFeeds()
  }

  const allFeeds = feedsData?.feeds ?? []
  const query = filter.trim().toLowerCase()
  const feeds = query
    ? allFeeds.filter(f => f.name.toLowerCase().includes(query) || f.url.toLowerCase().includes(query))
    : allFeeds

  return (
    <section>
      <h2 className="text-base font-semibold text-text mb-1">{t('settings.viewer')}</h2>
      <p className="text-xs text-muted mb-4">{t('settings.viewerDesc')}</p>
      <Input
        type="search"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder={t('settings.feedFilterPlaceholder')}
        className="mb-2"
      />
      <p className="text-xs text-muted mb-1 select-none">
        {t('settings.feedCount', { count: String(feeds.length) })}
      </p>
      <ul className="divide-y divide-border">
        {feeds.map(feed => (
          <li key={feed.id} className="flex items-center gap-3 py-2.5">
            <div className="flex-1 min-w-0">
              {renaming?.id === feed.id ? (
                <Input
                  autoFocus
                  value={renaming.name}
                  onChange={e => setRenaming({ id: feed.id, name: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void handleRenameSubmit()
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                  onBlur={() => setRenaming(null)}
                  className="h-7 px-2 py-1"
                />
              ) : (
                <p className="text-sm text-text truncate">{feed.name}</p>
              )}
              <p className="text-xs text-muted truncate">{feed.url}</p>
            </div>
            {feed.disabled === 1 && (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] text-error bg-hover select-none">
                {t('settings.feedDisabled')}
              </span>
            )}
            {feed.category_name && (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] text-muted bg-hover select-none">
                {feed.category_name}
              </span>
            )}
            <IconButton
              size="md"
              aria-label={t('feeds.rename')}
              onClick={() => setRenaming({ id: feed.id, name: feed.name })}
            >
              <Pencil size={15} strokeWidth={1.5} />
            </IconButton>
            {feed.type !== 'clip' && (
              <IconButton
                size="md"
                aria-label={t('feeds.deleteFeed')}
                className="hover:text-error"
                onClick={() => setDeleting(feed)}
              >
                <Trash2 size={15} strokeWidth={1.5} />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
      {feeds.length === 0 && (
        <p className="py-8 text-center text-sm text-muted select-none">{t('settings.noFeedsFound')}</p>
      )}

      {deleting && (
        <ConfirmDialog
          title={t('feeds.deleteFeed')}
          message={t('feeds.deleteConfirm', { name: deleting.name })}
          confirmLabel={t('feeds.delete')}
          danger
          onConfirm={() => { void handleDeleteConfirm() }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </section>
  )
}
