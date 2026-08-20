import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { KeyboardNavigationProvider, useKeyboardNavigationContext } from '../../contexts/keyboard-navigation-context'
import type { ArticleListItem } from '../../../shared/types'

const mockFetcher = vi.hoisted(() => vi.fn())
const mockNavigate = vi.hoisted(() => vi.fn())

vi.mock('../../lib/fetcher', () => ({
  fetcher: mockFetcher,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../app', () => ({
  useAppLayout: () => ({
    settings: {
      keyboardNavigation: 'on',
      keybindings: { next: 'j', prev: 'k', bookmark: 'b', openExternal: ';' },
    },
  }),
}))

import { ArticleZapNavigation } from './article-zap-navigation'

function makeArticle(id: number): ArticleListItem {
  return {
    id,
    feed_id: 1,
    feed_name: 'Test Feed',
    title: `Article ${id}`,
    url: `https://example.com/${id}`,
    published_at: `2026-01-0${id}T00:00:00Z`,
    lang: 'en',
    summary: null,
    excerpt: null,
    og_image: null,
    seen_at: null,
    read_at: null,
    bookmarked_at: null,
    liked_at: null,
  }
}

function ArticleIdsProbe() {
  const { articleIds } = useKeyboardNavigationContext()
  return <output data-testid="article-ids">{articleIds.join(',')}</output>
}

function fireKey(key: string) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

describe('ArticleZapNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    sessionStorage.setItem('kb_article_ids', JSON.stringify(['1', '2']))
    sessionStorage.setItem('kb_article_urls', JSON.stringify({
      '1': 'https://example.com/1',
      '2': 'https://example.com/2',
    }))
    sessionStorage.setItem('kb_article_list_key', '/api/articles?unread=1&limit=20&offset=0')
  })

  it('loads the next page when j reaches the last retained article', async () => {
    mockFetcher.mockResolvedValue({
      articles: [makeArticle(3)],
      total: 1,
      has_more: false,
    })

    render(
      <KeyboardNavigationProvider>
        <ArticleZapNavigation currentArticleId="2" />
        <ArticleIdsProbe />
      </KeyboardNavigationProvider>,
    )

    fireKey('j')

    await waitFor(() => {
      expect(mockFetcher).toHaveBeenCalledWith('/api/articles?unread=1&limit=20&offset=0')
    })
    await waitFor(() => {
      expect(screen.getByTestId('article-ids').textContent).toBe('1,2,3')
    })
  })
})
