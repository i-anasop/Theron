import type { Metadata } from "next";
import AgentStage from "@/components/AgentStage";

export const metadata: Metadata = { title: "Ask" };

export default function AskPage() {
  return <AgentStage />;
}
