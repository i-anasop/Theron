import type { Metadata } from "next";
import Rail from "@/components/Rail";

export const metadata: Metadata = {
  title: { default: "Workspace", template: "%s · Theron" },
};

/**
 * Workspace chrome: the icon rail, and nothing else.
 *
 * No marketing header, no footer. Once someone is working, every pixel that
 * isn't the task is in the way.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="workspace">
      <Rail />
      <main className="work-main">{children}</main>
    </div>
  );
}
