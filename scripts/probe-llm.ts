/** Dumps a raw tool-calling response so we can see exactly what the provider returns. */
import "dotenv/config";
import { resolveProvider } from "../lib/agent/llm";

async function main() {
  const p = resolveProvider();
  console.log(`provider: ${p.name}  model: ${p.model}\n`);

  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: p.model,
      messages: [{ role: "user", content: "What worksites are in the portfolio? Use the tool." }],
      tools: [
        {
          type: "function",
          function: {
            name: "list_worksites",
            description: "List every worksite in the portfolio.",
            parameters: { type: "object", properties: {}, required: [] },
          },
        },
      ],
      tool_choice: "auto",
    }),
  });

  console.log(`HTTP ${res.status}\n`);
  console.log(JSON.stringify(await res.json(), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
