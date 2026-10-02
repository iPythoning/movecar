declare module '*.mdx' {
  import type { ComponentType } from 'react';
  import type { MDXProps } from 'mdx/types';
  const Content: ComponentType<MDXProps>;
  export default Content;
}
