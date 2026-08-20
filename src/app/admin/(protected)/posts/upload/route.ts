import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { getAdminEmail } from "@/lib/auth/admin-email";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB — stays under Vercel's ~4.5MB function body limit
const BUCKET = "post-images";
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(request: Request): Promise<Response> {
  // Route Handlers (unlike Server Actions) don't get Next.js's automatic Origin-header
  // CSRF check — cheapest guard, so it runs before the auth lookup.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return Response.json({ error: "Unauthorized." }, { status: 403 });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email !== getAdminEmail()) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("image");

  if (!(file instanceof File)) {
    return Response.json({ error: "No image file provided." }, { status: 400 });
  }

  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return Response.json(
      { error: "Unsupported file type. Use PNG, JPEG, WEBP, or GIF." },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: "Image must be 4MB or smaller." }, { status: 400 });
  }

  const path = `${crypto.randomUUID()}.${extension}`;
  const bucket = createAdminClient().storage.from(BUCKET);
  const { error: uploadError } = await bucket.upload(path, file, {
    contentType: file.type,
  });

  if (uploadError) {
    console.error("Image upload to Storage failed:", uploadError);
    return Response.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = bucket.getPublicUrl(path);

  return Response.json({ url: publicUrl });
}
