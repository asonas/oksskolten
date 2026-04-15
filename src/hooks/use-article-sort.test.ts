import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useArticleSort } from './use-article-sort'

describe('useArticleSort', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to desc', () => {
    const { result } = renderHook(() => useArticleSort())
    expect(result.current.articleSort).toBe('desc')
  })

  it('reads stored value from localStorage', () => {
    localStorage.setItem('article-sort', 'asc')
    const { result } = renderHook(() => useArticleSort())
    expect(result.current.articleSort).toBe('asc')
  })

  it('ignores invalid localStorage value', () => {
    localStorage.setItem('article-sort', 'invalid')
    const { result } = renderHook(() => useArticleSort())
    expect(result.current.articleSort).toBe('desc')
  })

  it('persists changes to localStorage', () => {
    const { result } = renderHook(() => useArticleSort())
    act(() => result.current.setArticleSort('asc'))
    expect(result.current.articleSort).toBe('asc')
    expect(localStorage.getItem('article-sort')).toBe('asc')
  })
})
