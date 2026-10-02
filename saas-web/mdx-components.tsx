import type { MDXComponents as MDXComponentMap } from 'mdx/types';
import MDXComponents from '@/components/mdx/MDXComponents';

export function useMDXComponents(components: MDXComponentMap): MDXComponentMap {
  return { ...MDXComponents, ...components };
}
