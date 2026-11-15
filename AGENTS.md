
## User model preference

Default to `gpt-6.1-sol` with `xhigh` reasoning for all work in this project, including every generation, specialist, review and repair step. Use a different model or effort only when the user explicitly requests it for that task. One-off experiments do not change this default.

## Comprehensibility and integration

The clarity/simplicity score measures whether the explanation is comprehensible
on first listen, not how basic its vocabulary is. Words such as "enzymes" and
other technical terms are welcome when their meaning or role is clear in context
or briefly explained. Do not penalize complex words alone or impose a jargon
quota. Judge causal links, clear references and conceptual load.

Periodically create a PR for a coherent, tested batch and merge it into `main`.
The user has authorized this workflow; preserve unrelated work and satisfy the
repository's checks/review requirements before merging.
