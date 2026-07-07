export type DocumentVectorMutation =
  | "create"
  | "contentUpdate"
  | "favorite"
  | "trash"
  | "restore"
  | "versionRestore"
  | "delete"
  | "emptyTrash";

export type DocumentVectorAction = "none" | "reindex" | "delete";

export function documentVectorActionForMutation(mutation: DocumentVectorMutation): DocumentVectorAction {
  switch (mutation) {
    case "favorite":
      return "none";
    case "trash":
    case "delete":
    case "emptyTrash":
      return "delete";
    case "create":
    case "contentUpdate":
    case "restore":
    case "versionRestore":
      return "reindex";
  }
}
