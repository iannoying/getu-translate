// Type declarations for .mdx files — allows TypeScript to understand
// `import Foo from "./foo.mdx"` as a React functional component.
declare module "*.mdx" {
  import type { ComponentType } from "react"
  const MDXComponent: ComponentType
  export default MDXComponent
}
