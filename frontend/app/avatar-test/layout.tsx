import { notFound } from "next/navigation";

// the avatar playground is for development: a 404 in the production build
export default function AvatarTestLayout({ children }: LayoutProps<"/avatar-test">) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
