---
name: newsroom-news-radar
description: "Find and score the AI news story with the highest view potential right now for the Frontier Feed Reels channel, using parallel subagent scans and a weighted rubric."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [newsroom, news, research, topic-selection]
    category: newsroom
    requires_toolsets: [web, terminal]
---

# Frontier Feed news radar

## When to use

At the start of every production run, before writing anything. Output: `runs/<run>/candidates.md` and a single chosen story.

## Procedure

1. **Load context.** Read `playbook.md` (topic priorities, scoring weights, learnings), `data/backlog.md`, and the run context at the top of the prompt (recent posts, topics already covered, already scheduled posts).

2. **Fan out the scan.** Spawn subagents in parallel with `delegate_task`, one per source cluster. Each brief must be self-contained and must say: today's date and time, "find AI news from the last 24 hours (48 h max) that a general audience would care about", return 3–6 items each with headline, one-sentence why-it-matters, primary source URL, publish time, whether usable video or images exist, and confidence. Clusters:
   - Official: OpenAI, Anthropic, Google/DeepMind, Meta AI, xAI, Microsoft, Apple, NVIDIA, Mistral, DeepSeek, Alibaba/Qwen blogs, changelogs and X accounts.
   - Products and demos: Product Hunt, GitHub trending, Hugging Face trending models/spaces, viral demo videos (and their original source).
   - Community signal: Hacker News front page, r/singularity, r/LocalLLaMA, r/OpenAI, r/ChatGPT, AI X/Twitter discussion. Tips only, never confirmation.
   - Mainstream and money: Reuters, Bloomberg, The Verge, TechCrunch, Wired, CNBC on AI: jobs, lawsuits, big deals, regulation with concrete consequences.
   - Robots and hardware: humanoids, devices, chips, anything visually striking.

3. **Merge and dedupe.** Drop anything covered in the last 10 days unless there is a genuinely new development. Drop stories older than 48 h unless we have a differentiated angle (hands-on test, "what it means for you").

4. **Score** every remaining candidate with the rubric in `playbook.md` (weights, hard gate on source confidence, legal-risk penalty). Write the table to `candidates.md` with the scores and one line of reasoning each.

5. **Verify the top 2.** Give each to a separate fact-check subagent: open the primary source, confirm every number and name, find whether original footage/images exist and under which terms (press kit, official demo, own screen recording possible). Kill a story if the primary source does not confirm it.

6. **Choose.** Highest verified score wins. If nothing scores ≥ 3.2, pick the best backlog item or an evergreen explainer that ties into the current news cycle. Put runner-ups worth keeping into `data/backlog.md`.

7. **Decide the angle** in one sentence: "This Reel makes viewers feel ___ because ___, and they will send it to ___." If you cannot fill it in, choose another story.

## Pitfalls

- Fake demos and fake leaks go viral constantly. Check the original uploader, look for Sora/Veo/Kling watermarks, require a primary source.
- "Model X beats model Y on benchmark Z" is not a story by itself. Find the consequence for the viewer.
- A story everyone posted 12 hours ago needs a sharper angle than everyone else's, or skip it.

## Verification

`candidates.md` exists, has ≥ 8 scored candidates from ≥ 3 clusters, the winner has a primary source URL that was opened and confirmed.
