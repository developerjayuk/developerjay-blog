import { PostForm } from "../PostForm";

export default function NewPostPage() {
  return (
    <div className="flex flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">New post</h1>
      <PostForm mode="create" />
    </div>
  );
}
