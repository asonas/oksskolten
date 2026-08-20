import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useKeyboardNavigationContext } from '../../contexts/keyboard-navigation-context'
import { useKeyboardNavigation } from '../../hooks/use-keyboard-navigation'
import { useAppLayout } from '../../app'
import { fetcher } from '../../lib/fetcher'
import type { ArticleListItem } from '../../../shared/types'

import { articleUrlToPath } from '../../lib/url'

interface ArticleZapNavigationProps {
  currentArticleId: string
  onBookmarkToggle?: () => void
  onOpenExternal?: () => void
}

interface ArticleListResponse {
  articles: ArticleListItem[]
  has_more: boolean
}

export function ArticleZapNavigation({ currentArticleId, onBookmarkToggle, onOpenExternal }: ArticleZapNavigationProps) {
  const navigate = useNavigate()
  const {
    articleIds,
    articleUrls,
    setArticleIds,
    setArticleUrls,
    articleListKey,
    setFocusedItemId,
    lastListUrl,
  } = useKeyboardNavigationContext()
  const { settings: { keyboardNavigation, keybindings } } = useAppLayout()

  const articleIdsRef = useRef(articleIds)
  articleIdsRef.current = articleIds
  const articleUrlsRef = useRef(articleUrls)
  articleUrlsRef.current = articleUrls
  const loadingRef = useRef(false)
  const hasMoreRef = useRef(true)

  useEffect(() => {
    hasMoreRef.current = true
  }, [articleListKey])

  const loadMore = useCallback(() => {
    if (!articleListKey || loadingRef.current || !hasMoreRef.current) return

    loadingRef.current = true
    void fetcher(articleListKey)
      .then((response: ArticleListResponse) => {
        hasMoreRef.current = response.has_more
        const knownIds = new Set(articleIdsRef.current)
        const newArticles = response.articles.filter(article => !knownIds.has(String(article.id)))
        if (newArticles.length === 0) return

        const nextIds = [...articleIdsRef.current, ...newArticles.map(article => String(article.id))]
        const nextUrls = { ...articleUrlsRef.current }
        for (const article of newArticles) nextUrls[String(article.id)] = article.url
        setArticleIds(nextIds)
        setArticleUrls(nextUrls)
      })
      .catch(() => {})
      .finally(() => {
        loadingRef.current = false
      })
  }, [articleListKey, setArticleIds, setArticleUrls])

  useKeyboardNavigation({
    items: articleIds,
    focusedItemId: currentArticleId,
    onFocusChange: (id) => {
      setFocusedItemId(id)
      const url = articleUrls[id]
      if (url) void navigate(articleUrlToPath(url))
    },
    onBookmarkToggle: onBookmarkToggle ? () => onBookmarkToggle() : undefined,
    onOpenExternal: onOpenExternal ? () => onOpenExternal() : undefined,
    onNearEnd: loadMore,
    onEscape: () => {
      void navigate(lastListUrl || '/inbox')
    },
    enabled: keyboardNavigation === 'on' && articleIds.length > 0,
    keyBindings: keybindings,
  })

  useEffect(() => {
    setFocusedItemId(currentArticleId)
  }, [currentArticleId, setFocusedItemId])

  return null
}
