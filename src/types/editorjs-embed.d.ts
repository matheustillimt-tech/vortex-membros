// O pacote tem tipos (dist/index.d.ts), mas o "exports" não os expõe.
declare module "@editorjs/embed" {
  import type { BlockToolConstructable } from "@editorjs/editorjs";
  const Embed: BlockToolConstructable;
  export default Embed;
}
