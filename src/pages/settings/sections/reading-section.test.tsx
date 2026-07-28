import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReadingSection } from './reading-section'

// --- Mocks ---

const mockSetArticleSort = vi.fn()

let articleSort: 'desc' | 'asc' = 'desc'

vi.mock('../../../app', () => ({
  useAppLayout: () => ({
    settings: {
      autoMarkRead: 'off',
      setAutoMarkRead: vi.fn(),
      keyboardNavigation: 'off',
      setKeyboardNavigation: vi.fn(),
      keybindings: {},
      setKeybindings: vi.fn(),
      showUnreadIndicator: 'on',
      setShowUnreadIndicator: vi.fn(),
      indicatorStyle: 'dot',
      internalLinks: 'off',
      setInternalLinks: vi.fn(),
      categoryUnreadOnly: 'off',
      setCategoryUnreadOnly: vi.fn(),
      showThumbnails: 'on',
      setShowThumbnails: vi.fn(),
      showFeedActivity: 'on',
      setShowFeedActivity: vi.fn(),
      chatPosition: 'fab',
      setChatPosition: vi.fn(),
      articleOpenMode: 'page',
      setArticleOpenMode: vi.fn(),
      dateMode: 'relative',
      setDateMode: vi.fn(),
      articleSort,
      setArticleSort: mockSetArticleSort,
    },
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  articleSort = 'desc'
})

describe('ReadingSection article sort order', () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 })

  it('selects Newest when articleSort is desc', () => {
    render(<ReadingSection />)

    const newest = screen.getByLabelText('Newest') as HTMLInputElement
    const oldest = screen.getByLabelText('Oldest') as HTMLInputElement
    expect(newest.checked).toBe(true)
    expect(oldest.checked).toBe(false)
  })

  it('selects Oldest when articleSort is asc', () => {
    articleSort = 'asc'
    render(<ReadingSection />)

    expect((screen.getByLabelText('Oldest') as HTMLInputElement).checked).toBe(true)
  })

  it('persists the choice when Oldest is selected', async () => {
    render(<ReadingSection />)

    await user.click(screen.getByLabelText('Oldest'))

    expect(mockSetArticleSort).toHaveBeenCalledWith('asc')
  })
})
