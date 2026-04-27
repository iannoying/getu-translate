import type { ComponentType } from "react"

/**
 * Required by @next/mdx for App Router.
 * Return an empty map so MDX files use their own HTML elements as-is.
 * This file must exist at the project root to prevent @next/mdx from
 * falling back to @mdx-js/react (which uses createContext and breaks
 * server-component builds).
 */
export function useMDXComponents(
  components: Record<string, ComponentType>,
): Record<string, ComponentType> {
  return { ...components }
}
