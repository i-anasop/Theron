/**
 * The proposed-rule caveat is a compliance invariant, so it is enforced in
 * code rather than requested in a prompt.
 *
 * The eval suite caught the model omitting it on two of eight scenarios even
 * after the instruction was made explicit and repeated. A property that must
 * hold every single time cannot rest on a model choosing to remember it.
 *
 * These tests also exist because the guard shipped broken once: a shell
 * heredoc turned the `\b` word boundaries in its regex into literal backspace
 * characters, so the pattern matched nothing and the function silently
 * returned its input. `.toString()` printed it as `/osha/i` because terminals
 * swallow backspaces — it looked correct in every place a human would check.
 * Only asserting the behaviour catches that.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { enforceProposedRuleCaveat } from "../lib/agent/agent";

describe("proposed-rule caveat", () => {
  it("appends the qualifier when OSHA is invoked without it", () => {
    const answer = "Exposure sits 138.5 degF-hours above the OSHA high-heat trigger.";
    const out = enforceProposedRuleCaveat(answer);
    assert.notEqual(out, answer, "the guard did not fire — check for stray control characters in its regex");
    assert.match(out, /propos/i);
    assert.ok(out.startsWith(answer), "the original answer must be preserved verbatim");
  });

  it("leaves an answer that already says 'proposed' untouched", () => {
    const answer = "Above the high-heat trigger in OSHA's proposed standard, which is not settled law.";
    assert.equal(enforceProposedRuleCaveat(answer), answer);
  });

  it("leaves answers that never mention OSHA untouched", () => {
    const answer = "Peak heat index today is 106.7 degF at 14:00.";
    assert.equal(enforceProposedRuleCaveat(answer), answer);
  });

  it("is idempotent, so repeated passes cannot stack notes", () => {
    const once = enforceProposedRuleCaveat("Above the OSHA trigger.");
    assert.equal(enforceProposedRuleCaveat(once), once);
  });

  it("matches OSHA in any casing", () => {
    for (const v of ["osha", "OSHA", "Osha"]) {
      const out = enforceProposedRuleCaveat(`Above the ${v} trigger.`);
      assert.match(out, /propos/i, `failed to catch "${v}"`);
    }
  });

  it("contains no control characters in its own output", () => {
    const out = enforceProposedRuleCaveat("Above the OSHA trigger.");
    // Checked by codepoint rather than a character class: the bug this guards
    // against is invisible in source, so the test must not rely on reading it.
    const control = [...out].find((ch) => {
      const c = ch.codePointAt(0)!;
      return c < 32 && c !== 10 && c !== 9;
    });
    assert.equal(control, undefined, "a control character leaked into user-facing text");
  });
});
