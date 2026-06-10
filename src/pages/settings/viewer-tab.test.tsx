import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { LocaleContext } from '../../lib/i18n'
import type { FeedWithCounts, Category } from '../../../shared/types'

vi.mock('../../lib/fetcher', () => ({
  fetcher: vi.fn(),
  apiPatch: vi.fn(() => Promise.resolve()),
  apiDelete: vi.fn(() => Promise.resolve()),
}))

import { ViewerTab } from './viewer-tab'
import { apiDelete, apiPatch } from '../../lib/fetcher'

function makeFeed(overrides: Partial<FeedWithCounts> = {}): FeedWithCounts {
  return {
    id: 1,
    name: 'Test Feed',
    url: 'https://example.com',
    rss_url: null,
    rss_bridge_url: null,
    category_id: null,
    last_error: null,
    error_count: 0,
    disabled: 0,
    requires_js_challenge: 0,
    type: 'rss',
    etag: null,
    last_modified: null,
    last_content_hash: null,
    next_check_at: null,
    check_interval: null,
    created_at: '2024-01-01',
    category_name: null,
    article_count: 10,
    unread_count: 3,
    articles_per_week: 2,
    latest_published_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: 'Tech',
    sort_order: 0,
    collapsed: 0,
    created_at: '2024-01-01',
    ...overrides,
  }
}

function renderViewerTab(
  feeds: FeedWithCounts[] = [],
  categories: Category[] = [],
) {
  const swrFallback: Record<string, unknown> = {
    '/api/feeds': { feeds, bookmark_count: 0, like_count: 0, clip_feed_id: null },
    '/api/categories': { categories },
  }

  return render(
    <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
      <SWRConfig value={{ provider: () => new Map(), fallback: swrFallback }}>
        <ViewerTab />
      </SWRConfig>
    </LocaleContext.Provider>,
  )
}

describe('ViewerTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all feeds with name and URL', () => {
    renderViewerTab([
      makeFeed({ id: 1, name: 'My Blog', url: 'https://blog.example.com' }),
      makeFeed({ id: 2, name: 'News Site', url: 'https://news.example.com' }),
    ])
    expect(screen.getByText('My Blog')).toBeTruthy()
    expect(screen.getByText('https://blog.example.com')).toBeTruthy()
    expect(screen.getByText('News Site')).toBeTruthy()
    expect(screen.getByText('https://news.example.com')).toBeTruthy()
  })

  it('shows the category name of a categorized feed', () => {
    renderViewerTab(
      [makeFeed({ id: 1, name: 'Go Blog', category_id: 10, category_name: 'Tech' })],
      [makeCategory({ id: 10, name: 'Tech' })],
    )
    expect(screen.getByText('Tech')).toBeTruthy()
  })

  it('filters the list by name or URL', () => {
    renderViewerTab([
      makeFeed({ id: 1, name: 'My Blog', url: 'https://blog.example.com' }),
      makeFeed({ id: 2, name: 'News Site', url: 'https://news.example.com' }),
    ])
    fireEvent.change(screen.getByPlaceholderText('Filter feeds'), { target: { value: 'news' } })
    expect(screen.queryByText('My Blog')).toBeNull()
    expect(screen.getByText('News Site')).toBeTruthy()
  })

  it('shows a delete button for rss feeds but not for the clip feed', () => {
    renderViewerTab([
      makeFeed({ id: 1, name: 'My Blog', type: 'rss' }),
      makeFeed({ id: 2, name: 'Clips', type: 'clip' }),
    ])
    expect(screen.getAllByLabelText('Delete Feed')).toHaveLength(1)
  })

  it('opens a confirm dialog and deletes the feed on confirm', async () => {
    renderViewerTab([makeFeed({ id: 7, name: 'My Blog' })])
    fireEvent.click(screen.getByLabelText('Delete Feed'))
    expect(screen.getByText('Delete My Blog? All associated articles will also be deleted.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(apiDelete).toHaveBeenCalledWith('/api/feeds/7')
    })
  })

  it('does not delete when the confirm dialog is cancelled', () => {
    renderViewerTab([makeFeed({ id: 7, name: 'My Blog' })])
    fireEvent.click(screen.getByLabelText('Delete Feed'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(apiDelete).not.toHaveBeenCalled()
  })

  it('renames a feed inline with the rename button', async () => {
    renderViewerTab([makeFeed({ id: 3, name: 'My Blog' })])
    fireEvent.click(screen.getByLabelText('Rename'))
    const input = screen.getByDisplayValue('My Blog')
    fireEvent.change(input, { target: { value: 'Renamed Blog' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(apiPatch).toHaveBeenCalledWith('/api/feeds/3', { name: 'Renamed Blog' })
    })
  })

  it('shows a Disabled badge for disabled feeds', () => {
    renderViewerTab([
      makeFeed({ id: 1, name: 'Dead Feed', disabled: 1 }),
      makeFeed({ id: 2, name: 'Live Feed', disabled: 0 }),
    ])
    expect(screen.getAllByText('Disabled')).toHaveLength(1)
  })

  it('shows an empty state when the filter matches nothing', () => {
    renderViewerTab([makeFeed({ id: 1, name: 'My Blog' })])
    fireEvent.change(screen.getByPlaceholderText('Filter feeds'), { target: { value: 'zzz' } })
    expect(screen.getByText('No feeds match your filter')).toBeTruthy()
  })
})
