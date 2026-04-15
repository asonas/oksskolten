import { createLocalStorageHook } from './create-local-storage-hook'

export type ArticleSort = 'desc' | 'asc'

const useHook = createLocalStorageHook<ArticleSort>('article-sort', 'desc', ['desc', 'asc'])

export function useArticleSort() {
  const [articleSort, setArticleSort] = useHook()
  return { articleSort, setArticleSort }
}
