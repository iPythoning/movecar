import { getPostMetadataAction, getPublishedPostBySlugAction, listPublishedPostsAction } from '@/actions/posts/posts';
import { POST_CONFIGS } from '@/components/cms/post-config';
import { DEFAULT_LOCALE } from '@/i18n/routing';
import { PostType } from '@/lib/db/schema';
import { PostBase, PublicPost, PublicPostWithContent } from '@/types/cms';
import dayjs from 'dayjs';
import localPostManifest from './local-posts.json';

type LocalPost = { data: Record<string, unknown>; content: string; datePaths: string[][] };
const localPosts: Record<string, Record<string, LocalPost[]>> = localPostManifest;

function localPostData(post: LocalPost): Record<string, unknown> {
  const data = structuredClone(post.data);
  for (const keys of post.datePaths) {
    let target = data;
    for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
    const key = keys[keys.length - 1];
    target[key] = new Date(target[key] as string);
  }
  return data;
}

/**
 * Maps a server post to the unified PostBase format
 */
function mapServerPostToPostBase(serverPost: PublicPostWithContent, locale: string): PostBase {
  return {
    locale: locale,
    id: serverPost.id || undefined,
    title: serverPost.title,
    description: serverPost.description ?? '',
    featuredImageUrl: serverPost.featuredImageUrl ?? '',
    slug: serverPost.slug,
    tags: serverPost.tags ?? '',
    publishedAt:
      (serverPost.publishedAt && dayjs(serverPost.publishedAt).toDate()) || new Date(serverPost.createdAt),
    status: serverPost.status ?? 'published',
    visibility: serverPost.visibility ?? 'public',
    isPinned: serverPost.isPinned ?? false,
    content: serverPost.content ?? '',
  };
}

/**
 * Maps local markdown file data to PostBase format
 */
function mapLocalFileToPostBase(data: Record<string, any>, content: string, locale: string): PostBase {
  return {
    locale,
    id: data.id || undefined,
    title: data.title,
    description: data.description || '',
    featuredImageUrl: data.featuredImageUrl || '',
    slug: data.slug,
    tags: data.tags || '',
    publishedAt: data.publishedAt ? new Date(data.publishedAt) : new Date(),
    status: data.status || 'published',
    visibility: data.visibility || 'public',
    isPinned: data.isPinned || false,
    content,
    metadata: data,
  };
}

export interface GetBySlugResult {
  post: PostBase | null;
  error?: string;
  errorCode?: string;
}

export interface GetListResult {
  posts: PostBase[];
}

export interface GetPublishedListResult {
  posts: PublicPost[];
  count: number;
}

export interface PostMetadata {
  title: string;
  description: string | null;
  featuredImageUrl: string | null;
  visibility: string;
}

export interface GetMetadataResult {
  metadata: PostMetadata | null;
}

/**
 * Creates a CMS module for a given post type
 * Configuration is read from POST_CONFIGS in post-config.ts
 */
export function createCmsModule(postType: PostType) {
  const config = POST_CONFIGS[postType];
  const localDirectory = config.localDirectory;

  function findLocalPost(slug: string, locale: string): LocalPost | undefined {
    if (!localDirectory) return undefined;
    const targetSlug = slug.replace(/^\//, '').replace(/\/$/, '');
    return localPosts[postType]?.[locale]?.find(({ data }) => {
      const localSlug = (typeof data.slug === 'string' ? data.slug : '')
        .replace(/^\//, '').replace(/\/$/, '');
      return localSlug === targetSlug && data.status !== 'draft';
    });
  }

  /**
   * Get a single post by slug
   * If localDirectory is configured, checks local files first, then falls back to server
   */
  async function getBySlug(
    slug: string,
    locale: string = DEFAULT_LOCALE
  ): Promise<GetBySlugResult> {
    const localPost = findLocalPost(slug, locale);
    if (localPost) {
      return {
        post: mapLocalFileToPostBase(localPostData(localPost), localPost.content, locale),
        error: undefined,
        errorCode: undefined,
      };
    }

    // Fall back to server
    const serverResult = await getPublishedPostBySlugAction({ slug, locale, postType });

    if (serverResult.success && serverResult.data?.post) {
      return {
        post: mapServerPostToPostBase(serverResult.data.post, locale),
        error: undefined,
        errorCode: serverResult.customCode,
      };
    } else if (!serverResult.success) {
      return { post: null, error: serverResult.error, errorCode: serverResult.customCode };
    } else {
      return { post: null, error: `${postType} not found (unexpected server response).`, errorCode: undefined };
    }
  }

  /**
   * Get all posts from local directory (if configured)
   * Returns empty array if no localDirectory is set
   */
  async function getLocalList(locale: string = DEFAULT_LOCALE): Promise<GetListResult> {
    if (!localDirectory) {
      return { posts: [] };
    }

    let allPosts = [...(localPosts[postType]?.[locale] ?? [])]
      .reverse()
      .map(post => mapLocalFileToPostBase(localPostData(post), post.content, locale));

    // Filter out non-published articles
    allPosts = allPosts.filter(post => post.status === 'published');

    // Sort posts by isPinned and publishedAt
    allPosts = allPosts.sort((a, b) => {
      if (a.isPinned !== b.isPinned) {
        return (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
      }
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    return { posts: allPosts };
  }

  /**
   * Get published posts from server with pagination
   */
  async function getPublishedList(
    locale: string = DEFAULT_LOCALE,
    options: {
      pageIndex?: number;
      pageSize?: number;
      tagId?: string | null;
      visibility?: 'public' | 'logged_in' | 'subscribers' | null;
    } = {}
  ): Promise<GetPublishedListResult> {
    const result = await listPublishedPostsAction({
      postType,
      locale,
      pageIndex: options.pageIndex ?? 0,
      pageSize: options.pageSize ?? 60,
      tagId: options.tagId ?? null,
      visibility: options.visibility ?? null,
    });

    if (result.success && result.data) {
      return {
        posts: result.data.posts ?? [],
        count: result.data.count ?? 0,
      };
    }

    return { posts: [], count: 0 };
  }

  /**
   * Get post metadata (title and description) for OpenGraph images
   * No authentication required - lightweight query for OG image generation
   */
  async function getPostMetadata(
    slug: string,
    locale: string = DEFAULT_LOCALE
  ): Promise<GetMetadataResult> {
    const localPost = findLocalPost(slug, locale);
    if (localPost) {
      const post = mapLocalFileToPostBase(localPostData(localPost), localPost.content, locale);
      return {
        metadata: {
          title: post.title,
          description: post.description || null,
          featuredImageUrl: post.featuredImageUrl || null,
          visibility: post.visibility || 'public',
        },
      };
    }

    // Fall back to server
    const serverResult = await getPostMetadataAction({ slug, locale, postType });

    if (serverResult.success && serverResult.data?.metadata) {
      return {
        metadata: serverResult.data.metadata,
      };
    }

    return { metadata: null };
  }

  return {
    getBySlug,
    getLocalList,
    getPublishedList,
    getPostMetadata,
  };
}

// Pre-configured CMS modules for common post types
export const blogCms = createCmsModule('blog');
export const glossaryCms = createCmsModule('glossary');
