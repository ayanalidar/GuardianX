import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BLOG_POSTS, getPostBySlug } from "@/lib/blog-posts";
import { BlogPostView } from "@/components/sentinel/blog-post-view";

export const dynamicParams = false;

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return (async () => {
    const { slug } = await params;
    const post = getPostBySlug(slug);
    if (!post) {
      return { title: "Post not found — GuardianX Blog" };
    }
    return {
      title: `${post.title} — GuardianX Blog`,
      description: post.excerpt,
      openGraph: {
        title: post.title,
        description: post.excerpt,
        type: "article",
      },
    };
  })();
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) {
    notFound();
  }
  return <BlogPostView post={post} />;
}
